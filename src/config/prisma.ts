import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

import { PrismaClient } from '../generated/prisma/client';
import { environment } from './environment';

// La base de Supabase se usa a través de su pooler en modo sesión, que admite
// 15 conexiones en total para todo el proyecto: las comparten el backend, el
// worker de correos y los entornos de todo el equipo. Con el máximo por
// defecto de `pg` (10 por proceso), dos o tres procesos alcanzaban para
// llenarlo y las consultas fallaban con EMAXCONNSESSION. Con 3 por proceso
// sobra para el uso del sistema: las consultas que llegan juntas esperan
// unos milisegundos a que se libere una conexión en vez de fallar.
const MAX_CONNECTIONS = 3;

const adapter = new PrismaPg({
  connectionString: environment.databaseUrl,
  max: MAX_CONNECTIONS,
});

export const prisma = new PrismaClient({
  adapter,
});
