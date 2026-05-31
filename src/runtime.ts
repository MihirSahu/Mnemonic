import type { Db } from './db';
import { bootstrapAdminClient, openDatabase } from './db';
import { config } from './config';
import { MemoryService } from './service';

type RuntimeContext = {
  db: Db;
  service: MemoryService;
};

const globalForRuntime = globalThis as typeof globalThis & {
  __mnemonicRuntime?: RuntimeContext;
};

export const getRuntime = (): RuntimeContext => {
  if (globalForRuntime.__mnemonicRuntime) return globalForRuntime.__mnemonicRuntime;
  const db = openDatabase(config.databasePath);
  bootstrapAdminClient(db, config.adminToken);
  const service = new MemoryService(db, {
    vaultPath: config.vaultPath,
    gitEnabled: config.gitEnabled,
    defaultSearchLimit: config.defaultSearchLimit
  });
  service.init();
  globalForRuntime.__mnemonicRuntime = { db, service };
  return globalForRuntime.__mnemonicRuntime;
};

