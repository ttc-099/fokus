// loads .env and exposes a typed config object
import "dotenv/config";

export const env = {
  port: Number(process.env.PORT ?? 4000),

  // secret for signing login tokens
  jwtSecret: process.env.JWT_SECRET ?? "dev-only-secret-change-me",

  // sqlite file by default, or a postgres url
  databaseUrl: process.env.DATABASE_URL ?? "file:./dev.db",

  ai: {
    // offline | openai | huggingface
    provider: (process.env.AI_PROVIDER ?? "offline").toLowerCase(),
    apiKey: process.env.AI_API_KEY ?? "",
    baseUrl: process.env.AI_BASE_URL ?? "",
    model: process.env.AI_MODEL ?? "",
  },
};
