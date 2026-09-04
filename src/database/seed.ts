import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../config/database';

async function seed() {
  try {
    const seedsPath = path.join(process.cwd(), 'database', 'seeds');

    const files = await fs.readdir(seedsPath);

    const seedFiles = files.filter((file) => file.endsWith('.sql')).sort();

    for (const filename of seedFiles) {
      console.log(`Running seed: ${filename}`);

      const filePath = path.join(seedsPath, filename);
      const sql = await fs.readFile(filePath, 'utf8');

      await pool.query(sql);

      console.log(`✓ ${filename}`);
    }

    console.log('Seeds completed.');
  } catch (error) {
    console.error('Seed failed:');
    console.error(error);

    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

seed();
