import { prepareRules, evaluateRules } from '../../index.js';

const source = {
  artifacts: [
    { id: 'library.checkout.email_required', type: 'rule', description: 'Customer email must be filled', role: 'check', operator: 'not_empty', field: 'customer.email', level: 'ERROR', code: 'CHECKOUT.EMAIL.REQUIRED', message: 'Customer email is required' },
    { id: 'entry.checkout', type: 'pipeline', description: 'Checkout validation', entrypoint: true, strict: false, flow: [{ rule: 'library.checkout.email_required' }] }
  ]
};

const artifact = prepareRules(source);
const result = evaluateRules(artifact, { pipelineId: 'entry.checkout', payload: { customer: { email: '' } } }, { trace: 'basic' });
console.log(JSON.stringify(result, null, 2));
