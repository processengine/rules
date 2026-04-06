import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareRules, evaluateRules } from '../index.js';

const source = {
  artifacts: [
    { id: 'library.checkout.email_required', type: 'rule', description: 'Customer email must be filled', role: 'check', operator: 'not_empty', field: 'customer.email', level: 'ERROR', code: 'CHECKOUT.EMAIL.REQUIRED', message: 'Customer email is required' },
    { id: 'entry.checkout', type: 'pipeline', description: 'Checkout validation', entrypoint: true, strict: false, flow: [{ rule: 'library.checkout.email_required' }] }
  ]
};

function collectUndefinedPaths(value, path = '$', acc = []) {
  if (value === undefined) {
    acc.push(path);
    return acc;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectUndefinedPaths(item, `${path}[${index}]`, acc));
    return acc;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) collectUndefinedPaths(item, `${path}.${key}`, acc);
  }
  return acc;
}

test('evaluateRules returns transport-safe JSON-safe runtime result', () => {
  const artifact = prepareRules(source);
  const result = evaluateRules(artifact, { pipelineId: 'entry.checkout', payload: { customer: { email: '' } } }, { trace: 'verbose' });
  assert.deepEqual(collectUndefinedPaths(result), []);
  const roundTrip = JSON.parse(JSON.stringify(result));
  assert.deepEqual(roundTrip, result);
  assert.equal(result.issues[0].actual, '');
  assert.equal('meta' in result.issues[0], false);
  assert.equal(result.trace.at(-1)?.step, 'pipeline.finish');
});
