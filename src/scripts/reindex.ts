import { config } from '../config';
import { openDatabase } from '../db';
import { initializeVault } from '../markdown';
import { reindexVault } from '../indexer';

initializeVault(config.vaultPath);
const db = openDatabase(config.databasePath);
const result = reindexVault(db, config.vaultPath);
db.close();
console.log(JSON.stringify(result, null, 2));
