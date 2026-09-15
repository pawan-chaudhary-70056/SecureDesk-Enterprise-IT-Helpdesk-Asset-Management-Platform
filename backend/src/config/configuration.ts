import type { ConfigFactory } from "@nestjs/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRES: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_DAYS: z.coerce.number().int().positive().default(30),
  FRONTEND_ORIGIN: z.string().default("http://localhost:5173"),
  UPLOAD_DIR: z.string().default("./uploads"),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(10),
  AUTH_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(20),
});

export type AppConfig = z.infer<typeof EnvSchema> & { isProduction: boolean };

export const loadConfig = (): AppConfig => {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration -> ${issues}`);
  }
  const isProduction = parsed.data.NODE_ENV === "production";
  if (isProduction && parsed.data.JWT_ACCESS_SECRET.includes("change-me")) {
    throw new Error("Refusing to run in production with a development JWT secret");
  }
  return { ...parsed.data, isProduction };
};

const factory: ConfigFactory = () => loadConfig();
export default factory;
