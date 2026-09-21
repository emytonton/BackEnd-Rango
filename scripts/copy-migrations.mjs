// Copia os arquivos .sql para dist/ após o `tsc` (o compilador só emite .js).
import fs from 'node:fs';

fs.cpSync('src/db/migrations', 'dist/db/migrations', { recursive: true });
console.log('migrations copiadas para dist/db/migrations');
