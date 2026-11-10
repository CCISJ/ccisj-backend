import jwt from 'jsonwebtoken';
import { type Server as HttpServer, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { type Socket, io as conectarCliente } from 'socket.io-client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import app from '../src/app';
import { environment } from '../src/config/environment';
import { prisma } from '../src/config/prisma';
import { configureSocket } from '../src/config/socket';
import {
  createAdmin,
  createApplicant,
  createCategory,
  createMember,
  deleteUsers,
  sessionCookie,
} from './session';

/**
 * Notificaciones en tiempo real, con un servidor HTTP de verdad y el cliente
 * de Socket.IO que usa el frontend.
 *
 * El aviso solo dice "hay una nueva" y su id; lo que se prueba es a quién le
 * llega, a quién no, y que una sesión que dejó de valer no reciba nada.
 */

type Aviso = { notificacionId: number };

const ORIGEN = environment.allowedOrigins[0];

let httpServer: HttpServer;
let ioServer: ReturnType<typeof configureSocket>;
let url: string;

const abiertos: Socket[] = [];
const usuarios: number[] = [];

function conectar({
  cookie,
  origin = ORIGEN,
}: {
  cookie?: string[];
  origin?: string | null;
}) {
  const headers: Record<string, string> = {};

  if (origin) headers.origin = origin;
  if (cookie) headers.cookie = cookie.join('; ');

  const socket = conectarCliente(url, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    extraHeaders: headers,
  });

  abiertos.push(socket);

  return socket;
}

function conectado(socket: Socket) {
  return new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', (error) => reject(error));
  });
}

function rechazado(socket: Socket) {
  return new Promise<string>((resolve, reject) => {
    socket.once('connect', () => reject(new Error('Se conectó')));
    socket.once('connect_error', (error) => resolve(error.message));
  });
}

/**
 * Junta los avisos que lleguen mientras dure la prueba. Puede haber otros
 * además del que se espera: otros archivos de tests corren en paralelo y
 * mandan comunicados "a todos", que también les llegan a estos usuarios.
 */
function avisosDe(socket: Socket) {
  const avisos: number[] = [];

  socket.on('notificacion:nueva', (aviso: Aviso) =>
    avisos.push(aviso.notificacionId),
  );

  return avisos;
}

async function llega(avisos: number[], notificacionId: number, ms = 3000) {
  const limite = Date.now() + ms;

  while (!avisos.includes(notificacionId)) {
    if (Date.now() > limite) throw new Error('No llegó el aviso');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** El aviso automático más reciente que recibió el usuario de esa cuenta. */
async function ultimoAvisoDe(usuarioId: number, creadoPorId: number) {
  const recibido = await prisma.notificacionUsuario.findFirstOrThrow({
    where: { usuarioId, notificacion: { creadoPorId } },
    orderBy: { notificacionId: 'desc' },
    include: { notificacion: true },
  });

  return recibido.notificacion;
}

function desconectado(socket: Socket, ms = 4000) {
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('No se cortó')), ms);

    socket.once('disconnect', (motivo) => {
      clearTimeout(timer);
      resolve(motivo);
    });
  });
}

async function postulanteConectado() {
  const postulante = await createApplicant();
  usuarios.push(postulante.userId);

  const socket = conectar({ cookie: postulante.cookie });
  const avisos = avisosDe(socket);
  await conectado(socket);

  return { postulante, socket, avisos };
}

beforeAll(async () => {
  httpServer = createServer(app);
  ioServer = configureSocket(httpServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', resolve);
  });

  url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});

afterEach(() => {
  for (const socket of abiertos.splice(0)) socket.disconnect();
});

afterAll(async () => {
  await ioServer.close();
  await deleteUsers(usuarios);
});

describe('conexión', () => {
  it('rechaza un origen que no es el del sistema, o ninguno', async () => {
    const admin = await createAdmin();
    usuarios.push(admin.userId);

    expect(
      await rechazado(
        conectar({ cookie: admin.cookie, origin: 'https://otro.example' }),
      ),
    ).toBe('Origen no permitido');

    expect(
      await rechazado(conectar({ cookie: admin.cookie, origin: null })),
    ).toBe('Origen no permitido');
  });

  it('rechaza sin sesión, con un token falsificado o con la cuenta desactivada', async () => {
    const inactivo = await createApplicant();
    usuarios.push(inactivo.userId);

    await prisma.usuario.update({
      where: { id: inactivo.userId },
      data: { activo: false },
    });

    const falsificado = jwt.sign({ id: inactivo.userId }, 'otro-secreto', {
      algorithm: 'HS256',
    });

    for (const cookie of [
      undefined,
      [`token=${falsificado}`],
      inactivo.cookie,
    ]) {
      expect(await rechazado(conectar({ cookie }))).toBe(
        'Sesión inválida o expirada',
      );
    }
  });
});

describe('avisos', () => {
  it('un comunicado del admin le llega a su destinatario y a nadie más', async () => {
    const admin = await createAdmin();
    usuarios.push(admin.userId);

    const destinatario = await postulanteConectado();
    const otro = await postulanteConectado();

    const response = await request(app)
      .post('/notificaciones')
      .set('Cookie', admin.cookie)
      .send({
        titulo: 'Aviso puntual',
        mensaje: 'Solo para una persona',
        tipo: 'NORMAL',
        destinatarioTipo: 'USUARIOS',
        usuarioIds: [destinatario.postulante.userId],
      });

    expect(response.status).toBe(201);
    await llega(destinatario.avisos, response.body.id);

    // Si le hubiera llegado al otro, ya habría llegado: salen juntos.
    expect(otro.avisos).not.toContain(response.body.id);
  });

  describe('avisos automáticos de una postulación', () => {
    let socio: Awaited<ReturnType<typeof createMember>>;
    let categoriaId: number;

    beforeAll(async () => {
      socio = await createMember();
      usuarios.push(socio.userId);
      categoriaId = (await createCategory()).id;
    });

    afterAll(async () => {
      await prisma.categoria.delete({ where: { id: categoriaId } });
    });

    async function postulacionDe(cookie: string[]) {
      const oferta = await request(app)
        .post('/ofertas')
        .set('Cookie', socio.cookie)
        .send({
          titulo: 'Oferta en tiempo real',
          descripcion: 'Oferta de prueba',
          modalidad: 'REMOTO',
          categoriaIds: [categoriaId],
        });

      expect(oferta.status).toBe(201);

      const postulacion = await request(app)
        .post('/postulaciones')
        .set('Cookie', cookie)
        .send({ ofertaId: oferta.body.id });

      expect(postulacion.status).toBe(201);

      return postulacion.body.id as number;
    }

    it('cuando la empresa cambia el estado, el postulante se entera en el momento', async () => {
      const { postulante, avisos } = await postulanteConectado();
      const postulacionId = await postulacionDe(postulante.cookie);

      const response = await request(app)
        .patch(`/postulaciones/${postulacionId}`)
        .set('Cookie', socio.cookie)
        .send({ estado: 'EN_REVISION' });

      expect(response.status).toBe(200);

      const aviso = await ultimoAvisoDe(postulante.userId, socio.userId);

      expect(aviso.titulo).toBe('Tu postulación: En revisión');
      await llega(avisos, aviso.id);
    });

    it('cuando la empresa se da de baja, el postulante se entera de que su postulación finalizó', async () => {
      const admin = await createAdmin();
      usuarios.push(admin.userId);

      const empresa = await createMember();
      usuarios.push(empresa.userId);

      const oferta = await request(app)
        .post('/ofertas')
        .set('Cookie', empresa.cookie)
        .send({
          titulo: 'Oferta que se cierra',
          descripcion: 'Oferta de prueba',
          modalidad: 'REMOTO',
          categoriaIds: [categoriaId],
        });

      const { postulante, avisos } = await postulanteConectado();

      await request(app)
        .post('/postulaciones')
        .set('Cookie', postulante.cookie)
        .send({ ofertaId: oferta.body.id })
        .expect(201);

      await request(app)
        .delete(`/socios/${empresa.socioId}`)
        .set('Cookie', admin.cookie)
        .expect(200);

      const aviso = await ultimoAvisoDe(postulante.userId, empresa.userId);

      expect(aviso.titulo).toBe('Tu postulación: Finalizada');
      await llega(avisos, aviso.id);
    });
  });
});

describe('una sesión que deja de valer', () => {
  it('si la contraseña cambia después de conectar, no recibe el aviso y se corta', async () => {
    const admin = await createAdmin();
    usuarios.push(admin.userId);

    const { postulante, socket, avisos } = await postulanteConectado();
    const seCorta = desconectado(socket);

    // Lo mismo que deja la contraseña nueva que le da la administración: toda
    // sesión emitida antes deja de valer.
    await prisma.usuario.update({
      where: { id: postulante.userId },
      data: { passwordActualizada: new Date(Date.now() + 60_000) },
    });

    const response = await request(app)
      .post('/notificaciones')
      .set('Cookie', admin.cookie)
      .send({
        titulo: 'No tiene que llegar',
        mensaje: 'La sesión ya no vale',
        tipo: 'NORMAL',
        destinatarioTipo: 'USUARIOS',
        usuarioIds: [postulante.userId],
      })
      .expect(201);

    expect(await seCorta).toBe('io server disconnect');
    expect(avisos).not.toContain(response.body.id);
  });

  it('cuando vence el token, la conexión se corta sola', async () => {
    const postulante = await createApplicant();
    usuarios.push(postulante.userId);

    const [cookie] = sessionCookie(postulante.userId, 'POSTULANTE');
    const { id, tipo } = jwt.decode(cookie.slice('token='.length)) as {
      id: number;
      tipo: string;
    };

    const secret = process.env.JWT_SECRET as string;
    const casiVencido = jwt.sign(
      { id, tipo, exp: Math.floor(Date.now() / 1000) + 2 },
      secret,
      { algorithm: 'HS256' },
    );

    const socket = conectar({ cookie: [`token=${casiVencido}`] });
    await conectado(socket);

    expect(await desconectado(socket, 5000)).toBe('io server disconnect');
  });
});
