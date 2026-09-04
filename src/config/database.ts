import 'dotenv/config';
import { Pool } from 'pg';

console.log('Database URL:', process.env.DB_URL);

export const pool = new Pool({
  connectionString: process.env.DB_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});
