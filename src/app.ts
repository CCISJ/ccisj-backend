import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';

import userRoutes from './modules/users/user.routes';
import memberRoutes from './modules/members/member.routes';
import applicantRoutes from './modules/applicants/applicant.routes';
import categoryRoutes from './modules/categories/category.routes';
import offerRoutes from './modules/offers/offer.routes';
import applicationRoutes from './modules/applications/application.routes';
import authRoutes from './modules/auth/auth.routes';

const app = express();

// MIDDLEWARES
app.use(express.json());
app.use(cookieParser());
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// CORS configuration
app.use(
  cors({
    origin: 'http://localhost:5173',
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
app.use('/auth', authRoutes);

app.get('/', (_req, res) => {
  res.send('API de CCISJ');
});

export default app;
