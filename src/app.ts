import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import applicantRoutes from './modules/applicants/applicant.routes';
import applicationRoutes from './modules/applications/application.routes';
import authRoutes from './modules/auth/auth.routes';
import categoryRoutes from './modules/categories/category.routes';
import feeRoutes from './modules/fees/fee.routes';
import memberRoutes from './modules/members/member.routes';
import notificationRoutes from './modules/notifications/notification.routes';
import offerRoutes from './modules/offers/offer.routes';
import userRoutes from './modules/users/user.routes';

const app = express();

// MIDDLEWARES
// Cabeceras de seguridad estándar; también saca `X-Powered-By`.
app.use(helmet());
app.use(express.json());
app.use(cookieParser());
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// CORS configuration
// Orígenes separados por coma. Por defecto (sin definir o vacío, como queda al
// copiar el .env.example), el frontend en desarrollo.
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);

// ROUTES
app.use('/usuarios', userRoutes);
app.use('/socios', memberRoutes);
app.use('/postulantes', applicantRoutes);
app.use('/categorias', categoryRoutes);
app.use('/ofertas', offerRoutes);
app.use('/postulaciones', applicationRoutes);
app.use('/notificaciones', notificationRoutes);
app.use('/auth', authRoutes);
app.use('/cuotas', feeRoutes);

app.get('/', (_req, res) => {
  res.send('API de CCISJ');
});

app.use((_req, res) => {
  res.status(404).json({
    message: 'Ruta no encontrada',
  });
});

// Último recurso: sin esto Express responde con HTML y, fuera de producción,
// con el stack trace. Un JSON mal formado en el body cae acá como 400.
app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    return next(error);
  }

  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number(error.status)
      : 500;

  if (status >= 400 && status < 500) {
    return res.status(status).json({
      message: 'Solicitud inválida',
    });
  }

  console.error(error);

  return res.status(500).json({
    message: 'Error interno del servidor',
  });
});

export default app;
