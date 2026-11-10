import { parseCookie } from 'cookie';
import jwt from 'jsonwebtoken';
import type { Server as HttpServer } from 'node:http';
import { type RemoteSocket, Server } from 'socket.io';

import { resolveSessionToken } from '../middlewares/auth.middleware.js';
import { environment } from './environment.js';

/**
 * Notificaciones en tiempo real.
 *
 * El servidor solo avisa "hay una nueva" (con el id): el contenido lo sigue
 * pidiendo la pantalla por la API, que aplica los permisos de siempre. Así un
 * socket no puede filtrar nada que la API no daría.
 *
 * La sesión se valida al conectar, pero una conexión puede durar horas. Por
 * eso:
 * - se corta sola cuando vence el token (`exp`);
 * - antes de cada aviso se vuelve a validar el token de cada conexión con la
 *   misma función que `requireAuth`: si la contraseña cambió, la cuenta se
 *   desactivó o se borró, la conexión se cierra y no recibe el aviso.
 */

type ServerEvents = {
  'notificacion:nueva': (data: { notificacionId: number }) => void;
};

type SocketData = {
  usuarioId: number;
  token: string;
};

type NoEvents = Record<string, never>;

let io: Server<NoEvents, ServerEvents, NoEvents, SocketData> | null = null;

/** Milisegundos hasta que vence el token; null si no trae `exp`. */
function msHastaVencer(token: string) {
  const payload = jwt.decode(token);

  if (
    !payload ||
    typeof payload !== 'object' ||
    typeof payload.exp !== 'number'
  ) {
    return null;
  }

  return payload.exp * 1000 - Date.now();
}

async function sesionSigueValida(
  socket: RemoteSocket<ServerEvents, SocketData>,
) {
  try {
    const session = await resolveSessionToken(socket.data.token);

    return session.estado === 'ok' && session.user.id === socket.data.usuarioId;
  } catch {
    return false;
  }
}

export function configureSocket(httpServer: HttpServer) {
  io = new Server<NoEvents, ServerEvents, NoEvents, SocketData>(httpServer, {
    cors: {
      origin: [...environment.allowedOrigins],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.use((socket, next) => {
    void (async () => {
      try {
        const origin = socket.handshake.headers.origin;

        if (!origin || !environment.allowedOrigins.includes(origin)) {
          next(new Error('Origen no permitido'));
          return;
        }

        const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
        const token = cookies.token;
        const session = await resolveSessionToken(token);

        if (session.estado !== 'ok' || !token) {
          next(new Error('Sesión inválida o expirada'));
          return;
        }

        socket.data.usuarioId = session.user.id;
        socket.data.token = token;

        next();
      } catch {
        next(new Error('No se pudo autenticar la conexión'));
      }
    })();
  });

  io.on('connection', (socket) => {
    void socket.join(`usuario:${socket.data.usuarioId}`);

    const restante = msHastaVencer(socket.data.token);

    if (restante !== null) {
      // El token dura horas: entra de sobra en el máximo de setTimeout.
      const timer = setTimeout(
        () => socket.disconnect(true),
        Math.max(restante, 0),
      );

      socket.on('disconnect', () => clearTimeout(timer));
    }
  });

  return io;
}

/**
 * Avisa a cada usuario conectado que tiene una notificación nueva.
 *
 * Nunca rechaza: si el aviso no sale, la notificación ya está guardada y el
 * usuario la ve al recargar o al reconectarse (la pantalla vuelve a pedir la
 * bandeja al conectar). Se llama después de que la transacción terminó, para
 * que la pantalla, al pedirla, ya la encuentre.
 */
export async function avisarNotificacionNueva(
  notificacionId: number,
  usuarioIds: readonly number[],
) {
  if (!io || usuarioIds.length === 0) return;

  try {
    const salas = [...new Set(usuarioIds)].map((id) => `usuario:${id}`);
    const sockets = await io.in(salas).fetchSockets();

    await Promise.all(
      sockets.map(async (socket) => {
        if (await sesionSigueValida(socket)) {
          socket.emit('notificacion:nueva', { notificacionId });
        } else {
          socket.disconnect(true);
        }
      }),
    );
  } catch (error) {
    console.error('No se pudo avisar la notificación en tiempo real', error);
  }
}
