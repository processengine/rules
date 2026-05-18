import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareRules, evaluateRules } from '../index.js';

function makeSource(rule) {
  return {
    artifacts: [
      rule,
      {
        id: 'entry.wildcard',
        type: 'pipeline',
        description: 'Wildcard regression pipeline',
        entrypoint: true,
        strict: false,
        flow: [{ rule: rule.id }]
      }
    ]
  };
}

function evaluate(rule, payload) {
  const artifact = prepareRules(makeSource(rule));
  return evaluateRules(artifact, { pipelineId: 'entry.wildcard', payload });
}

const baseCheck = {
  id: 'library.tax.foreign_country_required',
  type: 'rule',
  description: 'Each foreign tax residency must contain country code',
  role: 'check',
  operator: 'not_empty',
  field: 'beneficiary.tax.foreignResidencies[*].countryCode',
  aggregate: { mode: 'EACH', onEmpty: 'FAIL' },
  level: 'EXCEPTION',
  code: 'BEN.TAX.FOREIGN_COUNTRY.REQUIRED',
  message: 'Foreign tax residency country code is required'
};

const validPayload = {
  beneficiary: {
    tax: {
      foreignResidencies: [
        { tin: '123456789', countryCode: 'TJ' },
        { tin: '987654321', countryCode: 'KZ' }
      ]
    }
  }
};

test('wildcard check expands array indexes and passes when every matched field is valid', () => {
  const result = evaluate(baseCheck, validPayload);
  assert.equal(result.status, 'OK');
  assert.equal(result.control, 'CONTINUE');
  assert.deepEqual(result.issues, []);
});

test('wildcard check reports concrete failing indexed field for EACH aggregate', () => {
  const result = evaluate(baseCheck, {
    beneficiary: {
      tax: {
        foreignResidencies: [
          { countryCode: 'TJ' },
          { countryCode: '' }
        ]
      }
    }
  });
  assert.equal(result.status, 'EXCEPTION');
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].field, 'beneficiary.tax.foreignResidencies[1].countryCode');
  assert.deepEqual(result.issues[0].meta, { pattern: 'beneficiary.tax.foreignResidencies[*].countryCode' });
});

test('wildcard check uses WILDCARD_EMPTY when pattern has no matching concrete keys and onEmpty=FAIL', () => {
  const result = evaluate(baseCheck, { beneficiary: { tax: { foreignResidencies: [] } } });
  assert.equal(result.status, 'EXCEPTION');
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].field, 'beneficiary.tax.foreignResidencies[*].countryCode');
  assert.deepEqual(result.issues[0].meta, { reason: 'WILDCARD_EMPTY' });
});

test('wildcard predicate supports ANY aggregate inside condition', () => {
  const source = {
    artifacts: [
      {
        id: 'library.tax.has_tj_residency',
        type: 'rule',
        description: 'At least one tax residency is Tajikistan',
        role: 'predicate',
        operator: 'equals',
        field: 'beneficiary.tax.foreignResidencies[*].countryCode',
        value: 'TJ',
        aggregate: { mode: 'ANY', onEmpty: 'FALSE' }
      },
      {
        id: 'library.tax.tj_tin_required',
        type: 'rule',
        description: 'TIN is required when TJ residency exists',
        role: 'check',
        operator: 'not_empty',
        field: 'beneficiary.tax.foreignResidencies[*].tin',
        aggregate: { mode: 'EACH', onEmpty: 'FAIL' },
        level: 'ERROR',
        code: 'TIN.REQUIRED',
        message: 'TIN is required'
      },
      {
        id: 'library.tax.when_tj',
        type: 'condition',
        description: 'Run nested checks when TJ residency exists',
        when: 'library.tax.has_tj_residency',
        steps: [{ rule: 'library.tax.tj_tin_required' }]
      },
      {
        id: 'entry.wildcard',
        type: 'pipeline',
        description: 'Wildcard condition pipeline',
        entrypoint: true,
        strict: false,
        flow: [{ condition: 'library.tax.when_tj' }]
      }
    ]
  };
  const artifact = prepareRules(source);
  const result = evaluateRules(artifact, {
    pipelineId: 'entry.wildcard',
    payload: {
      beneficiary: {
        tax: {
          foreignResidencies: [
            { countryCode: 'KZ', tin: '111' },
            { countryCode: 'TJ', tin: '222' }
          ]
        }
      }
    }
  });
  assert.equal(result.status, 'OK');
  assert.deepEqual(result.issues, []);
});

test('wildcard expansion supports multiple wildcard segments and preserves numeric order', () => {
  const rule = {
    id: 'library.documents.number_required',
    type: 'rule',
    description: 'Every nested document number is required',
    role: 'check',
    operator: 'not_empty',
    field: 'groups[*].documents[*].number',
    aggregate: { mode: 'EACH', onEmpty: 'FAIL' },
    level: 'ERROR',
    code: 'DOC.NUMBER.REQUIRED',
    message: 'Document number is required'
  };
  const result = evaluate(rule, {
    groups: [
      { documents: [{ number: '1' }, { number: '' }] },
      { documents: [{ number: '3' }] }
    ]
  });
  assert.equal(result.status, 'ERROR');
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].field, 'groups[0].documents[1].number');
});

test('validateRules rejects invalid aggregate.onEmpty value for wildcard check', async () => {
  const { validateRules } = await import('../index.js');
  const result = validateRules(makeSource({
    ...baseCheck,
    id: 'library.tax.invalid_on_empty',
    code: 'INVALID.ON_EMPTY',
    aggregate: { mode: 'EACH', onEmpty: 'SILENTLY_IGNORE' }
  }));
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.some((item) => item.code === 'AGGREGATE_ON_EMPTY_INVALID'), true);
});
