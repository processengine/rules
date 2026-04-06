import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const srcDir = join(root, 'src');
const distDir = join(root, 'dist');

function assertExists(path, label) {
  if (!existsSync(path)) {
    throw new Error(`build: missing ${label} at ${path}`);
  }
}

assertExists(join(srcDir, 'index.js'), 'runtime source entry');
assertExists(join(srcDir, 'internal'), 'runtime internal source directory');

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });
cpSync(join(srcDir, 'index.js'), join(distDir, 'index.js'));
cpSync(join(srcDir, 'internal'), join(distDir, 'internal'), { recursive: true });

console.log('build ok');
