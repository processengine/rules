# @processengine/rules

`@processengine/rules` — библиотека семейства ProcessEngine для исполнения декларативных артефактов валидации.

Её роль в общей цепочке такая:

- `mappings` нормализуют и интерпретируют данные
- `rules` проверяет данные и возвращает структурированный результат с issues
- `decisions` выбирает outcome по facts
- `flows` управляет длительным бизнес-процессом

## Канонический API

```js
import {
  validateRules,
  prepareRules,
  evaluateRules,
  RulesCompileError,
  RulesRuntimeError,
  formatRulesDiagnostics,
  formatRulesRuntimeError,
} from '@processengine/rules';
```

## Быстрый старт

```js
import { prepareRules, evaluateRules } from '@processengine/rules';

const source = {
  artifacts: [
    {
      id: 'library.person.first_name_required',
      type: 'rule',
      description: 'Имя обязательно',
      role: 'check',
      operator: 'not_empty',
      field: 'person.firstName',
      level: 'ERROR',
      code: 'PERSON.FIRST_NAME.REQUIRED',
      message: 'Имя обязательно',
    },
    {
      id: 'entry.registration',
      type: 'pipeline',
      description: 'Проверка регистрации',
      entrypoint: true,
      strict: false,
      flow: [{ rule: 'library.person.first_name_required' }],
    },
  ],
};

const artifact = prepareRules(source);
const result = evaluateRules(artifact, {
  pipelineId: 'entry.registration',
  payload: { person: { firstName: '' } },
});
```

## Validate / prepare / evaluate

- `validateRules(source, options?)` возвращает `{ ok, diagnostics }` и не бросает исключение на невалидном source.
- `prepareRules(source, options?)` возвращает prepared artifact или бросает `RulesCompileError`.
- `evaluateRules(artifact, input, options?)` работает только с prepared artifact и не делает скрытую compile-фазу.

## Контракт runtime-результата

`evaluateRules(...)` возвращает предметный результат проверки:

- `status`: `OK | OK_WITH_WARNINGS | ERROR | EXCEPTION | ABORT`
- `control`: `CONTINUE | STOP`
- `issues`: массив структурированных нарушений
- `trace?`: трассировка, если она была включена
- `error`: runtime error только для `ABORT`

## Trace

Поддерживаются режимы:

- `false`
- `'basic'`
- `'verbose'`

По умолчанию trace выключен. `basic` даёт компактную картину исполнения. `verbose` дополнительно может включать `input/output` trace-событий после редактирования через `traceRedactor`.

## Custom operators

Кастомные operator packs являются частью всей канонической цепочки:

```js
import { validateRules, prepareRules, evaluateRules } from '@processengine/rules';

const operators = {
  check: {
    always_fail() {
      return { status: 'FAIL' };
    },
  },
};

const validation = validateRules(source, { operators });
const artifact = prepareRules(source, { operators });
const result = evaluateRules(artifact, input);
```

## Границы и non-goals

`@processengine/rules`:

- не выбирает бизнес-исходы вместо `decisions`
- не оркестрирует длительные процессы вместо `flows`
- не выполняет внешние вызовы и побочные эффекты
- не заменяет слой facts между валидацией и decisions

## Документация

- `docs/SPEC.md`
- `docs/SPEC_RU.md`
- `docs/COMPATIBILITY.md`
- `docs/MIGRATION.md`
- `CHANGELOG.md`
- `examples/`
