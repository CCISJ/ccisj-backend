import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

import { PrismaClient } from '../src/generated/prisma/client';
import { seedApplicants } from './seeds/applicants.seed';
import { seedCashMovements } from './seeds/cash-movements.seed';
import { seedCashCategories } from './seeds/cash.seed';
import { seedCategories } from './seeds/categories.seed';
import { seedFeeConfiguration } from './seeds/fees.seed';
import { seedMembers } from './seeds/members.seed';
import { seedOffers } from './seeds/offers.seed';
import { seedPayments } from './seeds/payments.seed';
import { seedUsers } from './seeds/users.seed';

if (
  process.env.NODE_ENV === 'production' ||
  process.env.ALLOW_DEMO_SEED !== 'true'
) {
  throw new Error(
    'Seed de demostración bloqueado. Requiere ALLOW_DEMO_SEED=true y entorno no productivo.',
  );
}
if (!process.env.DB_URL) throw new Error('Falta DB_URL');
const adapter = new PrismaPg({ connectionString: process.env.DB_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const users = await seedUsers(prisma);
  const { socio } = await seedMembers(
    prisma,
    users.usuarioSocio.id,
    users.usuarioDirectivo.id,
  );
  const { postulante } = await seedApplicants(
    prisma,
    users.usuarioPostulante.id,
  );
  const categories = await seedCategories(prisma);
  await seedFeeConfiguration(prisma);
  await seedOffers(
    prisma,
    socio.id,
    users.usuarioSocio.id,
    postulante.id,
    categories.administracion.id,
    categories.contabilidad.id,
    categories.tecnologia.id,
    categories.ventas.id,
  );
  await seedCashCategories(prisma);
  await seedPayments(prisma);
  await seedCashMovements(prisma);
  console.log('Seed base ejecutado correctamente.');
  console.log(
    'Usuarios: admin@ccisj.uy, empresa@ccisj.uy, directivo@ccisj.uy, postulante@ccisj.uy',
  );
  console.log('Contraseña: 1234');
}

async function run() {
  try {
    await main();
  } catch (error) {
    console.error('Error ejecutando seed:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
void run();
