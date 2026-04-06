import { mkdirSync, rmSync, copyFileSync, cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const src = join(root, 'src');
const dist = join(root, 'dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
copyFileSync(join(src, 'index.js'), join(dist, 'index.js'));
cpSync(join(src, 'internal'), join(dist, 'internal'), { recursive: true });
console.log('build ok');
