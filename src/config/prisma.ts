import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

import { PrismaClient } from '../generated/prisma/client';
import { environment } from './environment';

const adapter = new PrismaPg({
  connectionString: environment.databaseUrl,
});

export const prisma = new PrismaClient({
  adapter,
});
