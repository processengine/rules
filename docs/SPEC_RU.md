# Нормативная спецификация @processengine/rules

`@processengine/rules` это декларативный движок валидационных правил. Сценарий проверки (pipeline) собирает их в детерменированный поток выполнения. Движок компилирует их один раз, после чего может запускать на любом payload.

## Архитектурная роль

- `mappings` готовит данные
- `rules` проверяет данные и возвращает issues
- `decisions` принимает решение
- `flows` управляет процессом во времени

`rules` не исполняет действия, не ходит во внешние системы и не заменяет слой решений.

## Основной контракт

Компиляция:

```js
compiled = engine.compile({ artifacts });
```

Исполнение:

```js
result = engine.runPipeline(compiled, pipelineId, payload, options?)
```

Compiled artifact иммутабелен и отделён от исходных артефактов.

## Артефакты DSL

Поддерживаются четыре типа артефактов:

- `rule`
- `condition`
- `pipeline`
- `dictionary`

### rule

Обязательные поля:

- `id`
- `type = "rule"`
- `description`
- `role = "check" | "predicate"`
- `operator`

Для `check` обязательны `level`, `code`, `message`.

### condition

Содержит `when` и `steps`.

### pipeline

Содержит `flow`, `entrypoint`, `strict`.

### dictionary

Содержит `entries`.

## Compile-time diagnostics

При ошибках компиляции бросается `CompilationError`.

Каждый diagnostic содержит:

- `severity`
- `code`
- `message`
- `phase`
- `artifactId`
- `path`
- `details`

Warnings отделены от errors и входят в контракт.

## Runtime result

Статусы:

- `OK`
- `OK_WITH_WARNINGS`
- `ERROR`
- `EXCEPTION`
- `ABORT`

`ABORT` означает сбой движка или недопустимый runtime input. Это не бизнес-результат проверки.

## Runtime error contract

Для `ABORT` возвращается объект:

- `code`
- `message`
- `phase`
- `pipelineId`
- `details`

## Trace contract

Trace — публичная часть контракта. Элемент trace содержит:

- `kind = "TRACE"`
- `message`
- `data`
- `ts`

Порядок trace соответствует реальному порядку исполнения шагов.

## Ограничения v1

- нет встроенного языка выражений
- нет side effects
- нет nested decisions
- нет долгоживущего состояния
- compile-time warnings носят эвристический характер и не доказывают полную достижимость или полноту правил

## Безопасность

Недопустимы:

- опасные ключи `__proto__`, `prototype`, `constructor`
- циклические структуры
- non-JSON-safe значения (`Date`, `Map`, `Set`, `BigInt`, `NaN`, `Infinity`, функции и т.п.)
- конфликт flat/nested путей payload
