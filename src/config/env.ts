import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_STAFF_GROUP_CHAT_ID: z.string().min(1),
  AI_PROVIDER: z.enum(['gemini', 'ollama']).default('ollama'),
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().default('gemini-2.0-flash-lite'),
  GEMINI_EMBEDDING_MODEL: z.string().default('text-embedding-004'),
  OLLAMA_BASE_URL: z.string().url().default('http://host.docker.internal:11434'),
  OLLAMA_GENERATION_MODEL: z.string().default('qwen2.5:7b'),
  OLLAMA_EMBEDDING_MODEL: z.string().default('nomic-embed-text'),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),
  GOOGLE_REFRESH_TOKEN: z.string().min(1),
  GOOGLE_CALENDAR_ID: z.string().min(1).default('primary')
}).superRefine((env, ctx) => {
  if (env.AI_PROVIDER === 'gemini' && env.GEMINI_API_KEY.trim() === '') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['GEMINI_API_KEY'],
      message: 'GEMINI_API_KEY is required when AI_PROVIDER=gemini'
    });
  }
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}

export const env = loadEnv();
