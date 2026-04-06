import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareRules, evaluateRules } from '../index.js';

const rulesSource = {
  artifacts: [
    { id: 'library.checkout.email_required', type: 'rule', description: 'Customer email must be filled', role: 'check', operator: 'not_empty', field: 'customer.email', level: 'ERROR', code: 'CHECKOUT.EMAIL.REQUIRED', message: 'Customer email is required' },
    { id: 'entry.checkout', type: 'pipeline', description: 'Checkout validation', entrypoint: true, strict: false, flow: [{ rule: 'library.checkout.email_required' }] }
  ]
};

const mappingsSource = {
  id: 'facts.checkout.validation',
  description: 'Build normalized facts from rules result',
  output: {
    validation: {
      status: '$.status',
      control: '$.control',
      issueCount: '$.issues.length',
      hasErrors: '$.issuesByLevel.ERROR',
      hasWarnings: '$.issuesByLevel.WARNING',
      primaryCode: '$.issues[0].code'
    }
  }
};

function ensureTransportSafeInput(value, path = '$') {
  if (value === undefined) throw new Error(`Non transport-safe value at ${path}`);
  if (Array.isArray(value)) {
    value.forEach((item, index) => ensureTransportSafeInput(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) ensureTransportSafeInput(item, `${path}.${key}`);
  }
}

function deepGet(obj, expr) {
  const normalized = expr.replace(/^\$\./, '').replace(/\[(\d+)\]/g, '.$1');
  if (!normalized) return obj;
  return normalized.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function executeMappingsEquivalent(source, input) {
  ensureTransportSafeInput(input);
  const issuesByLevel = Object.create(null);
  for (const issue of input.issues || []) {
    issuesByLevel[issue.level] = (issuesByLevel[issue.level] || 0) + 1;
  }
  const runtimeInput = { ...input, issuesByLevel };
  return {
    validation: {
      status: deepGet(runtimeInput, source.output.validation.status),
      control: deepGet(runtimeInput, source.output.validation.control),
      issueCount: deepGet(runtimeInput, source.output.validation.issueCount),
      hasErrors: (deepGet(runtimeInput, source.output.validation.hasErrors) || 0) > 0,
      hasWarnings: (deepGet(runtimeInput, source.output.validation.hasWarnings) || 0) > 0,
      primaryCode: deepGet(runtimeInput, source.output.validation.primaryCode) ?? null,
    },
  };
}

test('rules runtime result flows into mappings-equivalent runtime without manual cleanup', () => {
  const artifact = prepareRules(rulesSource);
  const rulesResult = evaluateRules(artifact, { pipelineId: 'entry.checkout', payload: { customer: { email: '' } } }, { trace: false });
  const mapped = executeMappingsEquivalent(mappingsSource, rulesResult);
  assert.deepEqual(mapped, {
    validation: {
      status: 'ERROR',
      control: 'STOP',
      issueCount: 1,
      hasErrors: true,
      hasWarnings: false,
      primaryCode: 'CHECKOUT.EMAIL.REQUIRED',
    },
  });
});
