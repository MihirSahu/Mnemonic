import { config } from '../config.js';
import { openDatabase } from '../db.js';
import { initializeVault } from '../markdown.js';
import { reindexVault } from '../indexer.js';

initializeVault(config.vaultPath);
const db = openDatabase(config.databasePath);
const result = reindexVault(db, config.vaultPath);
db.close();
console.log(JSON.stringify(result, null, 2));
