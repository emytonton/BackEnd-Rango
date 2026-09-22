import { loadConfig } from '../config';
import { openDatabase } from './connection';
import { runMigrations } from './migrate';

const config = loadConfig();
const db = openDatabase(config.databasePath);
const applied = runMigrations(db);
console.log(applied.length ? `Migrations aplicadas: ${applied.join(', ')}` : 'Banco já está atualizado.');
db.close();
