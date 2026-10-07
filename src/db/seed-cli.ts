import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config';
import { systemClock } from '../lib/clock';
import { openDatabase } from './connection';
import { runMigrations } from './migrate';
import { seedCatalog, seedDemoUser } from './seed';
import { DEMO_USER } from './seed-data';

// Uso: npm run seed            → migra + catálogo + usuária demo (se ainda não existir)
//      npm run seed -- --reset → apaga o banco e recria tudo do zero
const config = loadConfig();
if (process.argv.includes('--reset') && config.databasePath !== ':memory:') {
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(path.resolve(config.databasePath + suffix), { force: true });
  console.log(`Banco removido: ${config.databasePath}`);
}

const db = openDatabase(config.databasePath);
runMigrations(db);
seedCatalog(db);
const created = seedDemoUser(db, config, systemClock);
console.log('Catálogo sincronizado.');
console.log(
  created
    ? `Usuária demo criada: ${DEMO_USER.email} / ${DEMO_USER.password}`
    : `Usuária demo já existia (${DEMO_USER.email}).`,
);
db.close();
