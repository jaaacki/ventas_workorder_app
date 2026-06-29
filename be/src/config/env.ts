import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string().min(16),
  CORS_ORIGIN: z.string().optional(),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  OWNER_EMAIL: z.string().email().optional(),
  OWNER_PASSWORD: z.string().min(8).optional(),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  BOM_WO_SHEET_ID: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  MS_CLIENT_ID: z.string().optional(),
  MS_CLIENT_SECRET: z.string().optional(),
  MS_TENANT: z.string().optional().default('common'),
  MS_REDIRECT_URI: z.string().url().optional(),
  BITRIX_WEBHOOK_URL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return result.data;
}
