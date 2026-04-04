import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const temp = mkdtempSync(join(tmpdir(), 'rules-pack-'));
try {
  const packJson = execSync('npm pack --json', { cwd: root, encoding: 'utf8' });
  const pack = JSON.parse(packJson)[0];
  execSync(`npm install "${join(root, pack.filename)}"`, { cwd: temp, stdio: 'inherit' });
  writeFileSync(join(temp, 'consumer.cjs'), `
const pkg = require('@processengine/rules');
const schema = require('@processengine/rules/schema');
const engine = pkg.createEngine({ operators: pkg.Operators });
const compiled = engine.compile({ artifacts: [
  { id: 'library.r', type: 'rule', description: 'r', role: 'check', operator: 'not_empty', field: 'name', level: 'ERROR', code: 'NAME.REQUIRED', message: 'Name required' },
  { id: 'p', type: 'pipeline', description: 'p', entrypoint: true, strict: false, flow: [{ rule: 'library.r' }] }
]});
const result = engine.runPipeline(compiled, 'p', { name: '' });
if (result.status !== 'ERROR') throw new Error('bad status');
if (!schema || schema.type !== 'object') throw new Error('bad schema');
console.log('packed smoke ok');
`);
  execSync('node consumer.cjs', { cwd: temp, stdio: 'inherit' });
} finally {
  rmSync(temp, { recursive: true, force: true });
}
