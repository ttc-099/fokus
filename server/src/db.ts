// single prisma client shared by the whole server
import { PrismaClient } from "@prisma/client";
import { env } from "./env";

export const prisma = new PrismaClient({
  datasources: { db: { url: env.databaseUrl } },
});
