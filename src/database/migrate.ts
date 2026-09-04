import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../config/database';

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function getExecutedMigrations(): Promise<Set<string>> {
  const result = await pool.query<{ filename: string }>(
    `SELECT filename FROM schema_migrations`,
  );

  return new Set(result.rows.map((row) => row.filename));
}

async function runMigration(filename: string, sql: string) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(sql);

    await client.query(
      `
      INSERT INTO schema_migrations (filename)
      VALUES ($1)
      `,
      [filename],
    );

    await client.query('COMMIT');

    console.log(`✓ ${filename}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function migrate() {
  try {
    await ensureMigrationsTable();

    const migrationsPath = path.join(process.cwd(), 'database', 'migrations');

    const files = await fs.readdir(migrationsPath);

    const migrationFiles = files.filter((file) => file.endsWith('.sql')).sort();

    const executedMigrations = await getExecutedMigrations();

    for (const filename of migrationFiles) {
      if (executedMigrations.has(filename)) {
        console.log(`- ${filename} already executed`);
        continue;
      }

      console.log(`Running ${filename}...`);

      const filePath = path.join(migrationsPath, filename);
      const sql = await fs.readFile(filePath, 'utf8');

      await runMigration(filename, sql);
    }

    console.log('Migrations completed.');
  } catch (error) {
    console.error('Migration failed:');
    console.error(error);

    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
