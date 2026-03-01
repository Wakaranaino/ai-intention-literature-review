import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoAuthToken = process.env.TURSO_AUTH_TOKEN;

  if (process.env.VERCEL) {
    console.log("VERCEL env check:", {
      hasTursoUrl: !!tursoUrl,
      hasTursoToken: !!tursoAuthToken,
      tursoUrlPrefix: tursoUrl?.slice(0, 10),
      dbUrl: process.env.DATABASE_URL,
    });
  }

  if (tursoUrl && tursoAuthToken) {
    const adapter = new PrismaLibSQL({
      url: tursoUrl,
      authToken: tursoAuthToken,
    });
    return new PrismaClient({ adapter });
  }

  return new PrismaClient();
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;