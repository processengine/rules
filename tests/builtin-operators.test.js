import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareRules, evaluateRules } from '../index.js';

function checkResult(operator, rulePatch, payload) {
  const rule = {
    id: `library.check.${operator}`,
    type: 'rule',
    description: `Check operator ${operator}`,
    role: 'check',
    operator,
    field: 'value',
    level: 'ERROR',
    code: `CHECK.${operator.toUpperCase()}`,
    message: `${operator} failed`,
    ...rulePatch,
  };
  const artifacts = [rule];
  if (rulePatch.dictionaryArtifact) artifacts.unshift(rulePatch.dictionaryArtifact);
  artifacts.push({ id: 'entry.check', type: 'pipeline', description: 'Check pipeline', entrypoint: true, strict: false, flow: [{ rule: rule.id }] });
  delete rule.dictionaryArtifact;
  const artifact = prepareRules({ artifacts });
  return evaluateRules(artifact, { pipelineId: 'entry.check', payload });
}

function predicateTruth(operator, rulePatch, payload) {
  const predicate = {
    id: `library.predicate.${operator}`,
    type: 'rule',
    description: `Predicate operator ${operator}`,
    role: 'predicate',
    operator,
    field: 'value',
    ...rulePatch,
  };
  const failCheck = {
    id: 'library.check.marker',
    type: 'rule',
    description: 'Marker check',
    role: 'check',
    operator: 'equals',
    field: '__marker__',
    value: 'never',
    level: 'ERROR',
    code: 'PREDICATE.TRUE',
    message: 'Predicate was true'
  };
  const condition = {
    id: 'library.condition.when_predicate',
    type: 'condition',
    description: 'Runs marker when predicate is true',
    when: predicate.id,
    steps: [{ rule: failCheck.id }]
  };
  const artifacts = [predicate, failCheck, condition];
  if (rulePatch.dictionaryArtifact) artifacts.unshift(rulePatch.dictionaryArtifact);
  artifacts.push({ id: 'entry.predicate', type: 'pipeline', description: 'Predicate pipeline', entrypoint: true, strict: false, flow: [{ condition: condition.id }] });
  delete predicate.dictionaryArtifact;
  const artifact = prepareRules({ artifacts });
  const result = evaluateRules(artifact, { pipelineId: 'entry.predicate', payload });
  return result.status === 'ERROR' && result.issues.some((issue) => issue.code === 'PREDICATE.TRUE');
}

test('built-in check operators keep expected success/failure semantics', () => {
  assert.equal(checkResult('not_empty', {}, { value: 'x' }).status, 'OK');
  assert.equal(checkResult('not_empty', {}, { value: '' }).status, 'ERROR');
  assert.equal(checkResult('is_empty', {}, { value: '' }).status, 'OK');
  assert.equal(checkResult('equals', { value: 'A' }, { value: 'A' }).status, 'OK');
  assert.equal(checkResult('not_equals', { value: 'A' }, { value: 'B' }).status, 'OK');
  assert.equal(checkResult('contains', { value: 'bc' }, { value: 'abcd' }).status, 'OK');
  assert.equal(checkResult('matches_regex', { value: '^\\d{3}$' }, { value: '123' }).status, 'OK');
  assert.equal(checkResult('greater_than', { value: 10 }, { value: 11 }).status, 'OK');
  assert.equal(checkResult('less_than', { value: 10 }, { value: 9 }).status, 'OK');
  assert.equal(checkResult('length_equals', { value: 3 }, { value: 'abc' }).status, 'OK');
  assert.equal(checkResult('length_max', { value: 3 }, { value: 'abc' }).status, 'OK');
  assert.equal(checkResult('field_equals_field', { value_field: 'other' }, { value: 'x', other: 'x' }).status, 'OK');
  assert.equal(checkResult('field_not_equals_field', { value_field: 'other' }, { value: 'x', other: 'y' }).status, 'OK');
  assert.equal(checkResult('field_greater_than_field', { value_field: 'other' }, { value: 2, other: 1 }).status, 'OK');
  assert.equal(checkResult('field_greater_or_equal_than_field', { value_field: 'other' }, { value: 2, other: 2 }).status, 'OK');
  assert.equal(checkResult('field_less_than_field', { value_field: 'other' }, { value: 1, other: 2 }).status, 'OK');
  assert.equal(checkResult('field_less_or_equal_than_field', { value_field: 'other' }, { value: 2, other: 2 }).status, 'OK');
  assert.equal(checkResult('any_filled', { fields: ['missing', 'value'] }, { value: 'x' }).status, 'OK');
});

test('built-in dictionary check and predicate resolve static dictionaries', () => {
  const dictionaryArtifact = { id: 'dict.country', type: 'dictionary', description: 'Countries', entries: [{ code: 'TJ', label: 'Tajikistan' }, 'KZ'] };
  const dictionary = { type: 'static', id: 'dict.country' };
  assert.equal(checkResult('in_dictionary', { dictionary, dictionaryArtifact }, { value: 'TJ' }).status, 'OK');
  assert.equal(predicateTruth('in_dictionary', { dictionary, dictionaryArtifact }, { value: 'KZ' }), true);
});

test('built-in predicate operators keep expected boolean semantics', () => {
  assert.equal(predicateTruth('not_empty', {}, { value: 'x' }), true);
  assert.equal(predicateTruth('is_empty', {}, { value: '' }), true);
  assert.equal(predicateTruth('equals', { value: 'A' }, { value: 'A' }), true);
  assert.equal(predicateTruth('not_equals', { value: 'A' }, { value: 'B' }), true);
  assert.equal(predicateTruth('contains', { value: 'bc' }, { value: 'abcd' }), true);
  assert.equal(predicateTruth('matches_regex', { value: '^\\d{3}$' }, { value: '123' }), true);
  assert.equal(predicateTruth('greater_than', { value: 10 }, { value: 11 }), true);
  assert.equal(predicateTruth('less_than', { value: 10 }, { value: 9 }), true);
  assert.equal(predicateTruth('field_equals_field', { value_field: 'other' }, { value: 'x', other: 'x' }), true);
  assert.equal(predicateTruth('field_not_equals_field', { value_field: 'other' }, { value: 'x', other: 'y' }), true);
  assert.equal(predicateTruth('field_greater_or_equal_than_field', { value_field: 'other' }, { value: 2, other: 2 }), true);
  assert.equal(predicateTruth('field_less_or_equal_than_field', { value_field: 'other' }, { value: 2, other: 2 }), true);
});

test('wildcard COUNT, MIN and MAX aggregate modes execute base operators over matched fields', () => {
  assert.equal(checkResult('not_empty', {
    field: 'items[*].code',
    aggregate: { mode: 'COUNT', op: '>=', value: 2, onEmpty: 'FAIL' }
  }, { items: [{ code: 'A' }, { code: '' }, { code: 'C' }] }).status, 'OK');

  assert.equal(checkResult('greater_than', {
    field: 'items[*].score',
    value: 5,
    aggregate: { mode: 'MIN', onEmpty: 'FAIL' }
  }, { items: [{ score: 6 }, { score: 7 }] }).status, 'OK');

  assert.equal(checkResult('less_than', {
    field: 'items[*].score',
    value: 10,
    aggregate: { mode: 'MAX', onEmpty: 'FAIL' }
  }, { items: [{ score: 6 }, { score: 9 }] }).status, 'OK');
});
