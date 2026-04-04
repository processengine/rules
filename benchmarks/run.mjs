import pkg from '../index.js';
const { createEngine, Operators } = pkg;

const engine = createEngine({ operators: Operators });
const definition = {
  artifacts: [
    {
      id: 'library.person.first_name_required',
      type: 'rule',
      description: 'First name must be filled',
      role: 'check',
      operator: 'not_empty',
      level: 'ERROR',
      code: 'PERSON.FIRST_NAME.REQUIRED',
      message: 'First name is required',
      field: 'person.firstName'
    },
    {
      id: 'registration.pipeline',
      type: 'pipeline',
      description: 'Registration validation',
      entrypoint: true,
      strict: false,
      flow: [{ rule: 'library.person.first_name_required' }]
    }
  ]
};
const payload = { person: { firstName: '' } };

function measure(label, fn, iterations = 1000) {
  const started = process.hrtime.bigint();
  for (let i = 0; i < iterations; i += 1) fn();
  const ended = process.hrtime.bigint();
  const ms = Number(ended - started) / 1e6;
  console.log(`${label}: ${ms.toFixed(2)} ms total (${(ms / iterations).toFixed(4)} ms/op)`);
}

const compiled = engine.compile(definition);
measure('compile', () => engine.compile(definition), 500);
measure('run', () => engine.runPipeline(compiled, 'registration.pipeline', payload), 5000);
measure('compile+run', () => {
  const c = engine.compile(definition);
  engine.runPipeline(c, 'registration.pipeline', payload);
}, 500);
