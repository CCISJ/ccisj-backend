import express from 'express';
import userRoutes from './modules/users/user.routes';
import memberRoutes from './modules/members/member.routes';
import applicantRoutes from './modules/applicants/applicant.routes';
import categoryRoutes from './modules/categories/category.routes';
import offerRoutes from './modules/offers/offer.routes';

const app = express();

app.use(express.json());

app.use('/usuarios', userRoutes);
app.use('/socios', memberRoutes);
app.use('/postulantes', applicantRoutes);
app.use('/categorias', categoryRoutes);
app.use('/ofertas', offerRoutes);

export default app;
