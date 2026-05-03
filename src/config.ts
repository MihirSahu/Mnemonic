import 'dotenv/config';
import path from 'node:path';

const booleanFromEnv = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value.trim() === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const numberFromEnv = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export type AppConfig = {
  port: number;
  publicUrl: string;
  vaultPath: string;
  databasePath: string;
  adminToken?: string;
  gitEnabled: boolean;
  defaultSearchLimit: number;
  corsOrigin: string;
};

export const config: AppConfig = {
  port: numberFromEnv(process.env.PORT, 3000),
  publicUrl: process.env.PUBLIC_URL ?? `http://localhost:${numberFromEnv(process.env.PORT, 3000)}`,
  vaultPath: path.resolve(process.env.MEMORY_VAULT_PATH ?? './memory'),
  databasePath: path.resolve(process.env.DATABASE_PATH ?? './data/memory.db'),
  adminToken: process.env.MEMORY_ADMIN_TOKEN,
  gitEnabled: booleanFromEnv(process.env.GIT_ENABLED, false),
  defaultSearchLimit: numberFromEnv(process.env.DEFAULT_SEARCH_LIMIT, 8),
  corsOrigin: process.env.CORS_ORIGIN ?? '*'
};
