import { prepareRules, evaluateRules, RulesCompileError } from '../index.js';

const source = {
  artifacts: [
    { id: 'library.checkout.email_required', type: 'rule', description: 'Customer email must be filled', role: 'check', operator: 'not_empty', field: 'customer.email', level: 'ERROR', code: 'CHECKOUT.EMAIL.REQUIRED', message: 'Customer email is required' },
    { id: 'entry.checkout', type: 'pipeline', description: 'Checkout validation', entrypoint: true, strict: false, flow: [{ rule: 'library.checkout.email_required' }] }
  ]
};

const artifact = prepareRules(source);
const result = evaluateRules(artifact, { pipelineId: 'entry.checkout', payload: { customer: { email: '' } } }, { trace: 'basic' });
if (result.status !== 'ERROR') throw new Error('Expected ERROR result');
if (!Array.isArray(result.trace) || result.trace.length === 0) throw new Error('Expected trace entries');
let failed = false;
try {
  prepareRules({ artifacts: [{ id: 'bad', type: 'pipeline', description: 'bad', entrypoint: true, strict: false, flow: [] }] });
} catch (error) {
  failed = error instanceof RulesCompileError;
}
if (!failed) throw new Error('Expected RulesCompileError');
console.log('smoke consumer ok');
