import express from 'express';

import { pool } from './config/database.js';

const app = express();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
  });
});

app.get('/', (_req, res) => {
  res.status(200).json({
    message: 'Welcome to the API',
  });
});

app.get('/db-test', async (_req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');

    res.json({
      database: 'connected',
      time: result.rows[0].now,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      database: 'error',
    });
  }
});

export default app;
