import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { environment } from './config/environment';
import applicantRoutes from './modules/applicants/applicant.routes';
import applicationRoutes from './modules/applications/application.routes';
import authRoutes from './modules/auth/auth.routes';
import cashCategoryRoutes from './modules/cash-categories/cash-category.routes';
import cashMovementRoutes from './modules/cash-movement/cash-movement.routes';
import categoryRoutes from './modules/categories/category.routes';
import feeRoutes from './modules/fees/fee.routes';
import memberRoutes from './modules/members/member.routes';
import notificationRoutes from './modules/notifications/notification.routes';
import offerRoutes from './modules/offers/offer.routes';
import userRoutes from './modules/users/user.routes';

const app = express();

// CONFIGURACIÓN EXPLÍCITA
// Express 5 ya usa `simple` por defecto, pero se fija por escrito. Con
// `extended`, `req.query` puede traer objetos y arreglos anidados, y hay
// controladores que hacen `String(req.query.x)` dando por sentado que siempre
// es texto (si no, les llega "[object Object]"). Dejarlo acá evita que un
// cambio de default, o una línea de configuración agregada sin pensarlo,
// abra ese camino sin que nadie lo note.
app.set('query parser', 'simple');

// Detrás de un proxy, `req.ip` es la IP del proxy y el rate limit por IP deja
// de distinguir usuarios; pero confiar en `X-Forwarded-For` sin un proxy
// delante es peor, porque cualquiera puede falsificar la cabecera y evadir el
// límite. La decisión depende del despliegue, así que viene del entorno, y por
// defecto es `false`, que es lo correcto corriendo sin proxy.
app.set('trust proxy', environment.trustProxy);

// MIDDLEWARES
// Cabeceras de seguridad estándar; también saca `X-Powered-By`.
app.use(helmet());

// El límite ya existía: es el valor por omisión de `express.json()`. Se
// escribe para que sea una decisión visible y no un default heredado, y para
// que cambiarlo requiera tocar la configuración y no el código.
app.use(express.json({ limit: environment.bodyLimit }));

// Express 5 deja `req.body` en `undefined` cuando el request no trae body
// (Express 4 lo dejaba en `{}`). Los controllers que desestructuran el body
// rompían con un TypeError en vez de llegar a su propia validación, y
// respondían ese mensaje interno. Se restituye el `{}` acá, una vez, en vez de
// defenderse en cada controller.
app.use((req, _res, next) => {
  req.body ??= {};
  next();
});
app.use(cookieParser());
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// CORS configuration
// Los orígenes se leen y normalizan en `config/environment`, junto con el
// resto de la configuración.
app.use(
  cors({
    origin: [...environment.allowedOrigins],
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
app.use('/caja/categorias', cashCategoryRoutes);
app.use('/caja/movimientos', cashMovementRoutes);

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
