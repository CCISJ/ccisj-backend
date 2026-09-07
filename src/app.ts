import express from 'express';
import cors from 'cors';

import userRoutes from './modules/users/user.routes';
import memberRoutes from './modules/members/member.routes';
import applicantRoutes from './modules/applicants/applicant.routes';
import categoryRoutes from './modules/categories/category.routes';
import offerRoutes from './modules/offers/offer.routes';
import applicationRoutes from './modules/applications/application.routes';

const app = express();

app.use(express.json());

app.use(
  cors({
    origin: 'http://localhost:5173',
  }),
);

app.use('/usuarios', userRoutes);
app.use('/socios', memberRoutes);
app.use('/postulantes', applicantRoutes);
app.use('/categorias', categoryRoutes);
app.use('/ofertas', offerRoutes);
app.use('/postulaciones', applicationRoutes);

app.get('/', (_req, res) => {
  res.send('API de CCISJ');
});

export default app;
