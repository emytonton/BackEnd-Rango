import fs from 'node:fs';
import path from 'node:path';
import type { DB } from './connection';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Aplica, em ordem, os arquivos `NNN_nome.sql` ainda não registrados em
 * `schema_migrations`. Cada migration roda dentro de uma transação.
 * Retorna os nomes aplicados nesta execução.
 */
export function runMigrations(db: DB, dir = MIGRATIONS_DIR): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);

  const applied = new Set(
    db.prepare('SELECT name FROM schema_migrations').all().map((r) => (r as { name: string }).name),
  );
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort();

  const done: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(
        file,
        new Date().toISOString(),
      );
    })();
    done.push(file);
  }
  return done;
}
