import { validateRules, prepareRules, evaluateRules } from '../../index.js';

const operators = {
  check: {
    minimum_total(rule, ctx) {
      const value = Number(ctx.get(rule.field));
      return Number.isFinite(value) && value >= Number(rule.value) ? { status: 'OK' } : { status: 'FAIL', actual: value };
    }
  }
};

const source = {
  artifacts: [
    { id: 'library.checkout.minimum_total', type: 'rule', description: 'Order total must reach the minimum amount', role: 'check', operator: 'minimum_total', field: 'order.total', value: 50, level: 'ERROR', code: 'CHECKOUT.TOTAL.TOO_LOW', message: 'Order total is below the minimum amount' },
    { id: 'entry.checkout', type: 'pipeline', description: 'Checkout validation', entrypoint: true, strict: false, flow: [{ rule: 'library.checkout.minimum_total' }] }
  ]
};

console.log(validateRules(source, { operators }));
const artifact = prepareRules(source, { operators });
console.log(evaluateRules(artifact, { pipelineId: 'entry.checkout', payload: { order: { total: 10 } } }));
