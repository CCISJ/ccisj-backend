import { parseCookie } from 'cookie';
import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';

import { resolveSessionToken } from '../middlewares/auth.middleware.js';
import { environment } from './environment.js';

let io: Server | null = null;

export function configureSocket(httpServer: HttpServer) {
  io = new Server(httpServer, {
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
        const session = await resolveSessionToken(cookies.token);

        if (session.estado !== 'ok') {
          next(new Error('Sesión inválida o expirada'));
          return;
        }

        socket.data.usuarioId = session.user.id;

        next();
      } catch {
        next(new Error('No se pudo autenticar la conexión'));
      }
    })();
  });

  io.on('connection', (socket) => {
    const usuarioId = socket.data.usuarioId as number;

    void socket.join(`usuario:${usuarioId}`);

    console.log(`Socket conectado: usuario ${usuarioId}`);

    socket.on('disconnect', () => {
      console.log(`Socket desconectado: usuario ${usuarioId}`);
    });
  });

  return io;
}

export function emitToUser(usuarioId: number, event: string, data: unknown) {
  io?.to(`usuario:${usuarioId}`).emit(event, data);
}
