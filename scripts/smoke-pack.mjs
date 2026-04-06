import { mkdtempSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const temp = mkdtempSync(join(tmpdir(), 'rules-pack-'));
let tarballPath = null;

function parsePackJson(stdout) {
  const text = String(stdout).trim();
    const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`npm pack --json did not return JSON. Output was:\n${text}`);
  }
  return JSON.parse(text.slice(start, end + 1));
}

try {
  execSync('npm run build', { cwd: root, stdio: 'inherit' });
  const packJson = execSync('npm pack --json', { cwd: root, encoding: 'utf8' });
  const pack = parsePackJson(packJson)[0];
  tarballPath = join(root, pack.filename);

  execSync(`npm install "${tarballPath}"`, { cwd: temp, stdio: 'inherit' });
  writeFileSync(join(temp, 'consumer.mjs'), `
import { prepareRules, evaluateRules } from '@processengine/rules';
const source = {
  artifacts: [
    { id: 'library.checkout.email_required', type: 'rule', description: 'checkout email required', role: 'check', operator: 'not_empty', field: 'customer.email', level: 'ERROR', code: 'CHECKOUT.EMAIL.REQUIRED', message: 'Customer email is required' },
    { id: 'entry.checkout', type: 'pipeline', description: 'Checkout validation', entrypoint: true, strict: false, flow: [{ rule: 'library.checkout.email_required' }] }
  ]
};
const artifact = prepareRules(source);
const result = evaluateRules(artifact, { payload: { customer: { email: '' } }, pipelineId: 'entry.checkout' }, { trace: 'basic' });
if (result.status !== 'ERROR') throw new Error('bad status');
console.log('packed smoke ok');
`);
  execSync('node consumer.mjs', { cwd: temp, stdio: 'inherit' });
} finally {
  rmSync(temp, { recursive: true, force: true });
  if (tarballPath) {
    try {
      unlinkSync(tarballPath);
    } catch {
      // ignore cleanup errors for the temporary pack artifact
    }
  }
}
