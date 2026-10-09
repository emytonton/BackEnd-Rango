// Gera docs/openapi.json a partir dos schemas das rotas (sem subir o servidor).
import fs from 'node:fs';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';

async function main() {
  const config = { ...loadConfig(), databasePath: ':memory:', seedDemoData: false, env: 'test' as const };
  const { app } = await buildApp({ config, logger: false });
  await app.ready();
  fs.mkdirSync('docs', { recursive: true });
  fs.writeFileSync('docs/openapi.json', JSON.stringify(app.swagger(), null, 2) + '\n');
  await app.close();
  console.log('docs/openapi.json gerado');
}

void main();
