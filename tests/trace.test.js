import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareRules, evaluateRules } from '../index.js';

const source = {
  artifacts: [
    { id: 'library.name.required', type: 'rule', description: 'name required', role: 'check', operator: 'not_empty', field: 'name', level: 'ERROR', code: 'NAME.REQUIRED', message: 'Name is required' },
    { id: 'entry.registration', type: 'pipeline', description: 'registration', entrypoint: true, strict: false, flow: [{ rule: 'library.name.required' }] }
  ]
};

test('trace false omits trace', () => {
  const artifact = prepareRules(source);
  const result = evaluateRules(artifact, { pipelineId: 'entry.registration', payload: { name: '' } }, { trace: false });
  assert.equal('trace' in result, false);
});

test('basic trace returns compact trace entries', () => {
  const artifact = prepareRules(source);
  const result = evaluateRules(artifact, { pipelineId: 'entry.registration', payload: { name: '' } }, { trace: 'basic' });
  assert.ok(Array.isArray(result.trace));
  assert.equal(result.trace[0].artifactType, 'rules');
  assert.equal(typeof result.trace[0].step, 'string');
  assert.equal('input' in result.trace[0], false);
});
