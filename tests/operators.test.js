import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRules, prepareRules, evaluateRules } from '../index.js';

const custom = {
  check: {
    always_fail() { return { status: 'FAIL' }; }
  },
  predicate: {}
};

const source = {
  artifacts: [
    { id: 'library.custom.fail', type: 'rule', description: 'custom fail', role: 'check', operator: 'always_fail', field: 'x', level: 'ERROR', code: 'X.FAIL', message: 'X fail' },
    { id: 'entry.registration', type: 'pipeline', description: 'registration', entrypoint: true, strict: false, flow: [{ rule: 'library.custom.fail' }] }
  ]
};

test('custom operator participates in validate, prepare and evaluate', () => {
  const validation = validateRules(source, { operators: custom });
  assert.equal(validation.ok, true);
  const artifact = prepareRules(source, { operators: custom });
  const result = evaluateRules(artifact, { pipelineId: 'entry.registration', payload: { x: 1 } });
  assert.equal(result.status, 'ERROR');
  assert.equal(result.issues[0].code, 'X.FAIL');
});
