import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRules, prepareRules, evaluateRules, RulesCompileError } from '../index.js';

const source = {
  artifacts: [
    { id: 'library.name.required', type: 'rule', description: 'name required', role: 'check', operator: 'not_empty', field: 'name', level: 'ERROR', code: 'NAME.REQUIRED', message: 'Name is required' },
    { id: 'entry.registration', type: 'pipeline', description: 'registration', entrypoint: true, strict: false, flow: [{ rule: 'library.name.required' }] }
  ]
};

test('validateRules returns structured diagnostics and does not throw', () => {
  const result = validateRules({ artifacts: [{ id: 'bad', type: 'pipeline', description: 'bad', entrypoint: true, strict: false, flow: [] }] });
  assert.equal(result.ok, false);
  assert.ok(Array.isArray(result.diagnostics));
  assert.equal(result.diagnostics[0].code, 'PIPELINE_FLOW_REQUIRED');
});

test('prepareRules returns prepared artifact with stable public shape', () => {
  const artifact = prepareRules(source);
  assert.deepEqual(Object.keys(artifact), ['kind', 'artifactType', 'version', 'diagnostics']);
  assert.equal(artifact.kind, 'prepared-rules');
  assert.equal(artifact.artifactType, 'rules');
});

test('prepareRules throws RulesCompileError on invalid source', () => {
  assert.throws(() => prepareRules({ artifacts: [{ id: 'bad', type: 'pipeline', description: 'bad', entrypoint: true, strict: false, flow: [] }] }), RulesCompileError);
});

test('evaluateRules works only with prepared artifact', () => {
  assert.throws(() => evaluateRules({ kind: 'compiled-rules' }, { pipelineId: 'x', payload: {} }), /prepared rules artifact/);
});

test('evaluateRules returns ERROR for failing check', () => {
  const artifact = prepareRules(source);
  const result = evaluateRules(artifact, { pipelineId: 'entry.registration', payload: { name: '' } });
  assert.equal(result.status, 'ERROR');
  assert.equal(result.control, 'STOP');
  assert.equal(result.issues[0].code, 'NAME.REQUIRED');
});
