/**
 * Acceso indebido a recursos de otro dueño (IDOR).
 *
 * La matriz de autorización (`matriz-autorizacion.test.ts`) prueba el control
 * de ROL: si un postulante puede entrar o no a `/postulantes/:id`. Pero el rol
 * correcto con el ID de OTRO es un agujero distinto, y el más común en
 * aplicaciones así: el postulante tiene permiso para ver "un perfil de
 * postulante", y nada le impide escribir el número de otro en la URL.
 *
 * Por eso acá los recursos son REALES y de un dueño distinto al que ataca.
 *
 * La respuesta correcta es **404, no 403**, y es una decisión de diseño del
 * proyecto: un 403 sobre un recurso ajeno confirma que ese recurso existe, y
 * eso ya es información. Con 404 el atacante no puede distinguir "no es tuyo"
 * de "no existe", así que tampoco puede enumerar IDs para averiguar cuántos
 * socios o postulaciones hay.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import app from '../src/app';
import { prisma } from '../src/config/prisma';
import {
  createAdmin,
  createApplicant,
  createMember,
  deleteNotificationsCreatedBy,
  deleteUsers,
  uniqueSuffix,
} from './session';

const creados: number[] = [];

/** Lo que es de la víctima y el atacante va a intentar tocar. */
const ajeno = {
  postulanteId: 0,
  socioId: 0,
  ofertaId: 0,
  postulacionId: 0,
  notificacionId: 0,
};

const atacante = {
  postulante: [] as string[],
  socio: [] as string[],
  directivo: [] as string[],
};

beforeAll(async () => {
  const [
    atacantePostulante,
    victimaPostulante,
    atacanteSocio,
    victimaSocio,
    directivo,
    admin,
  ] = await Promise.all([
    createApplicant(),
    createApplicant(),
    createMember('COMUN'),
    createMember('COMUN'),
    createMember('DIRECTIVO'),
    createAdmin(),
  ]);

  creados.push(
    atacantePostulante.userId,
    victimaPostulante.userId,
    atacanteSocio.userId,
    victimaSocio.userId,
    directivo.userId,
    admin.userId,
  );

  atacante.postulante = atacantePostulante.cookie;
  atacante.socio = atacanteSocio.cookie;
  atacante.directivo = directivo.cookie;

  // Una oferta de la empresa víctima, con una postulación de la otra víctima.
  const oferta = await prisma.oferta.create({
    data: {
      socioId: victimaSocio.socioId,
      creadaPor: victimaSocio.userId,
      titulo: `Oferta ajena ${uniqueSuffix()}`,
      descripcion: 'Oferta usada para probar accesos indebidos.',
      cantidadVacantes: 1,
    },
  });

  const postulacion = await prisma.postulacion.create({
    data: {
      ofertaId: oferta.id,
      postulanteId: victimaPostulante.postulanteId,
      estado: 'ENVIADA',
    },
  });

  // Una notificación dirigida SOLO a la víctima.
  const notificacion = await prisma.notificacion.create({
    data: {
      titulo: 'Privada',
      mensaje: 'Esta notificación es solo para la víctima.',
      creadoPorId: admin.userId,
      destinatarios: { create: { usuarioId: victimaPostulante.userId } },
    },
  });

  ajeno.postulanteId = victimaPostulante.postulanteId;
  ajeno.socioId = victimaSocio.socioId;
  ajeno.ofertaId = oferta.id;
  ajeno.postulacionId = postulacion.id;
  ajeno.notificacionId = notificacion.id;
}, 60_000);

afterAll(async () => {
  await deleteNotificationsCreatedBy(creados);
  await deleteUsers(creados);
});

describe('un postulante contra los datos de otro postulante', () => {
  it('no puede leer el perfil ajeno', async () => {
    const res = await request(app)
      .get(`/postulantes/${ajeno.postulanteId}`)
      .set('Cookie', atacante.postulante);

    expect(res.status).toBe(404);
  });

  it('no puede editar el perfil ajeno', async () => {
    const res = await request(app)
      .patch(`/postulantes/${ajeno.postulanteId}`)
      .set('Cookie', atacante.postulante)
      .send({ nombre: 'Secuestrado' });

    expect(res.status).toBe(404);

    // Y no quedó escrito: el 404 no puede ser "falló después de guardar".
    const victima = await prisma.postulante.findUnique({
      where: { id: ajeno.postulanteId },
    });

    expect(victima?.nombre).not.toBe('Secuestrado');
  });

  it('no puede leer la postulación ajena', async () => {
    const res = await request(app)
      .get(`/postulaciones/${ajeno.postulacionId}`)
      .set('Cookie', atacante.postulante);

    expect(res.status).toBe(404);
  });

  it('no puede borrar la postulación ajena', async () => {
    const res = await request(app)
      .delete(`/postulaciones/${ajeno.postulacionId}`)
      .set('Cookie', atacante.postulante);

    expect(res.status).toBe(404);

    const sigue = await prisma.postulacion.findUnique({
      where: { id: ajeno.postulacionId },
    });

    expect(sigue).not.toBeNull();
  });

  it('no puede marcar como leída una notificación ajena', async () => {
    const res = await request(app)
      .patch(`/notificaciones/${ajeno.notificacionId}/leida`)
      .set('Cookie', atacante.postulante);

    expect(res.status).toBe(404);

    const destinatario = await prisma.notificacionUsuario.findFirst({
      where: { notificacionId: ajeno.notificacionId },
    });

    expect(destinatario?.leida).toBe(false);
  });
});

describe('un socio contra los datos de otra empresa', () => {
  it('no puede ver la oferta ajena por /ofertas/mias', async () => {
    const res = await request(app)
      .get(`/ofertas/mias/${ajeno.ofertaId}`)
      .set('Cookie', atacante.socio);

    expect(res.status).toBe(404);
  });

  it('no puede editar la oferta ajena', async () => {
    const res = await request(app)
      .patch(`/ofertas/${ajeno.ofertaId}`)
      .set('Cookie', atacante.socio)
      .send({ titulo: 'Secuestrada' });

    expect(res.status).toBe(404);

    const oferta = await prisma.oferta.findUnique({
      where: { id: ajeno.ofertaId },
    });

    expect(oferta?.titulo).not.toBe('Secuestrada');
  });

  it('no puede borrar la oferta ajena', async () => {
    const res = await request(app)
      .delete(`/ofertas/${ajeno.ofertaId}`)
      .set('Cookie', atacante.socio);

    expect(res.status).toBe(404);

    const oferta = await prisma.oferta.findUnique({
      where: { id: ajeno.ofertaId },
    });

    expect(oferta).not.toBeNull();
  });

  it('no puede ver una postulación recibida por otra empresa', async () => {
    const res = await request(app)
      .get(`/postulaciones/recibidas/${ajeno.postulacionId}`)
      .set('Cookie', atacante.socio);

    expect(res.status).toBe(404);
  });

  it('no puede cambiar el estado de una postulación ajena', async () => {
    const res = await request(app)
      .patch(`/postulaciones/${ajeno.postulacionId}`)
      .set('Cookie', atacante.socio)
      .send({ estado: 'RECHAZADA' });

    expect(res.status).toBe(404);

    const postulacion = await prisma.postulacion.findUnique({
      where: { id: ajeno.postulacionId },
    });

    expect(postulacion?.estado).toBe('ENVIADA');
  });

  it('no puede ver las cuotas de otra empresa', async () => {
    const res = await request(app)
      .get(`/cuotas/socio/${ajeno.socioId}`)
      .set('Cookie', atacante.socio);

    // Este contesta 403 y no 404, a diferencia del resto: el módulo de cuotas
    // es de otro integrante y corta en el middleware, antes de buscar nada.
    // Bloquea igual, que es lo que importa.
    expect(res.status).toBe(403);
  });
});

/**
 * HALLAZGO ABIERTO H-02, en el módulo de cuotas (de otro integrante).
 *
 * `requireMemberAccess` deja pasar a cualquier socio DIRECTIVO a los datos de
 * cualquier socio. Un directivo es un socio más, dueño de su propia empresa, y
 * acá puede leer las cuotas, los pagos y los ajustes de un competidor.
 *
 * Estos tests afirman lo que el sistema hace HOY, a propósito, para que quede
 * documentado en el código y no solo en un informe. El día que el dueño del
 * módulo lo corrija, van a fallar: ahí hay que invertirlos a 403 y borrar esta
 * nota. Un test que se pone rojo cuando algo se arregla es molesto; uno que
 * tapa un agujero es peor.
 */
describe('HALLAZGO ABIERTO (H-02): un directivo entra a las cuotas de cualquier socio', () => {
  it('lee las cuotas de otra empresa (hoy responde 200)', async () => {
    const res = await request(app)
      .get(`/cuotas/socio/${ajeno.socioId}`)
      .set('Cookie', atacante.directivo);

    expect(res.status).toBe(200);
  });

  it('lee los pagos de otra empresa (hoy responde 200)', async () => {
    const res = await request(app)
      .get(`/cuotas/socio/${ajeno.socioId}/pagos`)
      .set('Cookie', atacante.directivo);

    expect(res.status).toBe(200);
  });

  it('lee los ajustes de otra empresa (hoy responde 200)', async () => {
    const res = await request(app)
      .get(`/cuotas/socio/${ajeno.socioId}/ajustes`)
      .set('Cookie', atacante.directivo);

    expect(res.status).toBe(200);
  });
});

/**
 * HALLAZGO ABIERTO H-01, también en cuotas: el importe de la cuota y su
 * historial los lee cualquiera con sesión. Un postulante no tiene ninguna
 * relación con las cuotas de los socios.
 */
describe('HALLAZGO ABIERTO (H-01): un postulante lee la configuración de cuotas', () => {
  it('lee el importe vigente (hoy responde 200)', async () => {
    const res = await request(app)
      .get('/cuotas/configuracion')
      .set('Cookie', atacante.postulante);

    expect(res.status).toBe(200);
  });

  it('lee el historial completo de importes (hoy responde 200)', async () => {
    const res = await request(app)
      .get('/cuotas/configuracion/historial')
      .set('Cookie', atacante.postulante);

    expect(res.status).toBe(200);
  });
});
