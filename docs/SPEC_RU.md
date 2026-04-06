# Спецификация: @processengine/rules

## Назначение и границы

`@processengine/rules` — runtime библиотеки семейства ProcessEngine для декларативных артефактов валидации. Библиотека проверяет входные данные по артефактам `rule`, `condition`, `pipeline`, `dictionary` и возвращает структурированный результат проверки. Библиотека не выбирает бизнес-исход и не заменяет слой facts или decisions.

## Модель source

Исходный артефакт — объект с полем `artifacts: []`. Каждый артефакт обязан иметь `id`, `type` и `description`. Поддерживаются типы `rule`, `condition`, `pipeline`, `dictionary`.

## Compile semantics

`validateRules(...)` выполняет валидацию структуры и семантики и возвращает диагностический результат. `prepareRules(...)` прогоняет ту же compile-цепочку, строит prepared artifact, связывает effective operator registry и бросает `RulesCompileError`, если есть compile-ошибки.

## Контракт prepared artifact

Публичная форма prepared artifact намеренно минимальна:

- `kind = 'prepared-rules'`
- `artifactType = 'rules'`
- `version`
- `diagnostics`

Внутренняя runtime-ready модель скрыта. Артефакт считается иммутабельным по публичному контракту и является единственным допустимым входом для `evaluateRules(...)`.

## Effective operator registry

Effective operator registry строится на фазах validate/prepare и объединяет built-in operators и внешние packs из `options.operators`. Один и тот же реестр используется и на compile-фазе, и на runtime-фазе.

## Runtime semantics

`evaluateRules(...)` принимает prepared artifact и входной объект вида:

- `pipelineId?`
- `payload`
- `context?`

Если `pipelineId` не передан, runtime может взять его из `input.context.pipelineId` или из единственного доступного entrypoint.

Скрытой compile-фазы внутри runtime нет.

## Контракт runtime-результата

Успешный путь исполнения возвращает:

- `status`
- `control`
- `issues`
- `trace?`

Для `ABORT` дополнительно возвращается `error`.

## Diagnostics and errors

Диагностики — машинно-читаемые объекты минимум с полями:

- `code`
- `level`
- `message`
- `path`
- `details?`

`RulesCompileError` используется только на prepare-фазе. `RulesRuntimeError` используется для нештатных ситуаций runtime. Formatter'ы дополняют структурированные объекты, а не заменяют их.

## Trace semantics

Поддерживаются режимы `false | 'basic' | 'verbose'`.

- `false`: trace отсутствует
- `basic`: компактные события исполнения без сырых `input/output`
- `verbose`: расширенные события и при необходимости `input/output`

Хост-приложение может передать `traceRedactor(value, mode)` для редактирования значений.

## Ограничения и non-goals

Библиотека не:

- оркестрирует длительные процессы
- выполняет побочные эффекты
- выбирает бизнес-исходы
- заменяет слой facts между validation и decisions

## Гарантии совместимости

Публичная совместимость оценивается по:

- именам и сигнатурам exports
- форме diagnostic-объектов
- форме runtime-результата
- trace contract на документированном уровне
- документированным публичным полям artifact


## Transport-safe runtime-result

Публичный runtime-result библиотеки является transport-safe / JSON-safe по нормативному shape: в нём нет `undefined` и иных нестабильных JS-значений, а смысл результата сохраняется после JSON-сериализации и обратного чтения.
