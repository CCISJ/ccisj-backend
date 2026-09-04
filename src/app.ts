import express from 'express';
import usuarioRoutes from './modules/users/user.route';

const app = express();

app.use(express.json());

app.use('/usuarios', usuarioRoutes);

export default app;
