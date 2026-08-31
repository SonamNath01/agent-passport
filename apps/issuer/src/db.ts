import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Prisma 7 dropped connection strings from schema.prisma; the runtime client
// now takes a driver adapter instead. See prisma.config.ts for the CLI side.
//
// The issuer shares the passport's Postgres database (one schema for the
// whole app) so a mandate it issues can be looked up and revoked by id later
// — it does not gain Razorpay credentials or any other passport-only secret.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });
