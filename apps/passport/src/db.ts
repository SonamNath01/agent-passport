import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Prisma 7 dropped connection strings from schema.prisma; the runtime client
// now takes a driver adapter instead. See prisma.config.ts for the CLI side.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });
