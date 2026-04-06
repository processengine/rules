import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { prepareRules, evaluateRules, validateRules } from '../index.js';

const fixtureDir = path.join(process.cwd(), 'tests', 'fixtures', 'ecommerce-regression');
const source = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'source.json'), 'utf8'));
const cases = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'cases.json'), 'utf8'));

test('ecommerce regression fixture validates and keeps expected runtime semantics', () => {
  const validation = validateRules(source);
  assert.equal(validation.ok, true, validation.diagnostics.map((d) => d.code).join(','));

  const artifact = prepareRules(source);

  for (const sample of cases) {
    const result = evaluateRules(artifact, sample.input, { trace: false });
    assert.equal(result.status, sample.expected.status, `${sample.code} status mismatch`);
    assert.equal(result.control, sample.expected.control, `${sample.code} control mismatch`);
    assert.deepEqual(result.issues.map((item) => item.code), sample.expected.issueCodes, `${sample.code} issue code mismatch`);
    assert.deepEqual(result.issues.map((item) => item.level), sample.expected.issueLevels, `${sample.code} issue level mismatch`);
  }
});
