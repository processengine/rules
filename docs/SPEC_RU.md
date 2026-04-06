# Спецификация: @processengine/rules

## 1. Назначение документа

Этот документ нормативно определяет форму декларативного артефакта и runtime semantics библиотеки `@processengine/rules`.

`@processengine/rules` — библиотека семейства ProcessEngine для проверки входных данных по декларативным артефактам правил и возврата структурированного результата валидации. Спецификация нужна для того, чтобы библиотекой можно было пользоваться без восстановления её поведения по исходному коду.

## 2. Что именно этот документ определяет нормативно

Этот документ нормативно определяет:

- формат source artifact
- типы артефактов и семантику их полей
- семантику ссылок и compile-time предположений о видимости
- участие built-in operators в compile/runtime semantics
- compile semantics для `validateRules(...)` и `prepareRules(...)`
- публичный контракт prepared artifact
- runtime semantics `evaluateRules(...)`
- контракт runtime-результата
- diagnostics, errors и trace contract на документированном уровне
- гарантии совместимости, важные для публичного контракта

Документ **не** определяет нормативно внутренние helper-структуры, внутренние runtime-cache и иные скрытые детали реализации, которые сознательно не входят в публичный контракт.

## 3. Роль библиотеки и её границы

`@processengine/rules` — validation-слой семейства ProcessEngine.

Её задача:

- проверять входные данные по декларативным validation artifacts
- накапливать структурированные issues
- возвращать runtime-result, пригодный для следующего слоя семейства

Библиотека **не**:

- выбирает бизнес-исходы вместо `decisions`
- нормализует сырые данные в facts вместо `mappings`
- оркестрирует длительные процессы вместо `flows`
- выполняет побочные эффекты и интеграции

Нормативная цепочка семейства выглядит так:

`rules -> mappings -> decisions`

Поэтому публичный runtime-result `rules` проектируется как transport-safe / JSON-safe и пригодный для прямой передачи дальше.

## 4. Канонический публичный API

Нормативный публичный API:

- `validateRules(source, options?)`
- `prepareRules(source, options?)`
- `evaluateRules(artifact, input, options?)`
- `RulesCompileError`
- `RulesRuntimeError`
- `formatRulesDiagnostics(...)`
- `formatRulesRuntimeError(...)`

Правила использования:

- `validateRules(...)` валидирует source и не бросает исключение из-за невалидного source
- `prepareRules(...)` готовит runtime artifact и бросает `RulesCompileError`, если есть compile failure
- `evaluateRules(...)` принимает только prepared artifact и не делает скрытую compile-фазу

## 5. Модель source artifact

Source artifact — JSON-совместимый объект следующей верхнеуровневой формы.

| Поле | Тип | Обязательно | Смысл |
|---|---|---:|---|
| `artifacts` | `array` | да | Список декларативных validation artifacts |

Общие правила для source:

- `artifacts` должен быть массивом
- каждый artifact должен быть JSON-совместимым объектом
- id артефактов должны быть уникальны внутри source
- неподдерживаемые значения `type` являются compile-ошибкой
- неразрешимые ссылки являются compile-ошибкой
- структурно невалидная форма артефакта попадает в compile diagnostics и блокирует prepare

## 6. Общие поля артефактов

Каждый artifact использует следующие общие поля.

| Поле | Тип | Обязательно | Смысл | Примечание |
|---|---|---:|---|---|
| `id` | `string` | да | Стабильный идентификатор артефакта | Должен быть уникален в source |
| `type` | `string` | да | Вид артефакта | Одно из `rule`, `condition`, `pipeline`, `dictionary` |
| `description` | `string` | да | Человекочитаемое описание | Часть source-контракта, но не управление исполнением |

Дополнительные поля зависят от типа артефакта.

## 7. Типы артефактов

### 7.1. `rule`

`rule` задаёт атомарную validation-проверку или predicate-based шаг валидации.

| Поле | Тип | Обязательно | Смысл | Примечание |
|---|---|---:|---|---|
| `id` | `string` | да | id артефакта | Общее поле |
| `type` | `'rule'` | да | Маркер типа | Общее поле |
| `description` | `string` | да | Человекочитаемое описание | Общее поле |
| `role` | `string` | да | Роль правила | Built-in роли: `check`, `predicate` |
| `operator` | `string` | да | Идентификатор оператора | Должен существовать в effective operator registry |
| `field` | `string` | зависит от role/operator | Основной путь в payload | Смысл зависит от оператора |
| `leftField` | `string` | зависит от оператора | Левый путь для field-to-field comparison | Нужен не всегда |
| `rightField` | `string` | зависит от оператора | Правый путь для field-to-field comparison | Нужен не всегда |
| `value` | JSON-значение | зависит от оператора | Константное значение для сравнения | Нужен не всегда |
| `dictionary` | `string` | зависит от оператора | id словаря | Нужен не всегда |
| `level` | `string` | только для check | Уровень issue | Обычно `ERROR`, `WARNING`, `EXCEPTION` |
| `code` | `string` | только для check | Стабильный код issue | Обязателен для issue-producing checks |
| `message` | `string` | только для check | Человекочитаемое сообщение | Обязательно для issue-producing checks |
| `onEmpty` | `string` | зависит от оператора | Политика пустого значения | Семантика зависит от оператора |

Нормативные замечания:

- `check`-правила создают validation issues при неуспехе
- `predicate`-правила дают булевоподобный смысл исполнения и обычно используются внутри conditions или flow-control
- обязательные поля, зависящие от оператора, входят в compile semantics
- правило с неизвестным оператором невалидно

### 7.2. `condition`

`condition` задаёт переиспользуемое булево условие на основе ссылок на rules и/или other conditions.

| Поле | Тип | Обязательно | Смысл | Примечание |
|---|---|---:|---|---|
| `id` | `string` | да | id артефакта | Общее поле |
| `type` | `'condition'` | да | Маркер типа | Общее поле |
| `description` | `string` | да | Человекочитаемое описание | Общее поле |
| `all` / `any` / `not` | array/object | зависит от формы condition | Тело условия | Декларативная структура condition |

Нормативные замечания:

- condition может ссылаться на rules и другие conditions согласно поддерживаемой форме
- невалидная вложенность или неразрешимые ссылки являются compile-ошибкой
- condition сама по себе не создаёт issues, а влияет на семантику исполнения

### 7.3. `pipeline`

`pipeline` задаёт исполняемый validation entry или переиспользуемую последовательность валидации.

| Поле | Тип | Обязательно | Смысл | Примечание |
|---|---|---:|---|---|
| `id` | `string` | да | id артефакта | Общее поле |
| `type` | `'pipeline'` | да | Маркер типа | Общее поле |
| `description` | `string` | да | Человекочитаемое описание | Общее поле |
| `entrypoint` | `boolean` | нет | Объявляет вызываемый top-level pipeline | Важно для выбора pipeline на runtime |
| `strict` | `boolean` | нет | Режим строгой эскалации | Если не передан, действует library/runtime behavior |
| `flow` | `array` | да | Упорядоченные исполняемые шаги | Обязательное поле |

`flow` — это упорядоченный список step-объектов. Step shapes декларативны и ссылаются на другие артефакты.

Типовые виды step references:

| Поле шага | Смысл |
|---|---|
| `rule` | Выполнить указанное правило |
| `condition` | Вычислить указанное condition |
| `pipeline` | Выполнить вложенный pipeline |

Нормативные замечания:

- порядок в `flow` является частью runtime semantics
- невалидная форма step-объекта попадает в compile diagnostics
- неразрешимые ссылки внутри `flow` являются compile-ошибкой
- `strict` влияет на эскалацию статуса и control при накоплении issues

### 7.4. `dictionary`

`dictionary` задаёт lookup-набор для dictionary-aware operators.

| Поле | Тип | Обязательно | Смысл | Примечание |
|---|---|---:|---|---|
| `id` | `string` | да | id артефакта | Общее поле |
| `type` | `'dictionary'` | да | Маркер типа | Общее поле |
| `description` | `string` | да | Человекочитаемое описание | Общее поле |
| `values` | `array` | да | Значения словаря | Должны быть JSON-совместимыми |

Нормативные замечания:

- содержимое словаря видно compile-фазе и доступно runtime через dictionary-aware operators
- id словаря, на который ссылается правило, должен существовать в source

## 8. Семантика ссылок

Ссылки разрешаются на фазах compile/prepare.

Нормативные правила:

- id артефактов — источник истины для ссылок
- неразрешимые ссылки являются compile-ошибками
- дублирующиеся id являются compile-ошибками
- runtime не делает late reference resolution вместо compile failure
- prepared artifact содержит результат успешного binding ссылок и runtime-ready assumptions

Библиотека не публикует отдельный public API для ref-resolution. Публичная гарантия поведенческая: валидный source успешно prepare-ится, а невалидные ссылки приводят к compile diagnostics или `RulesCompileError` на фазе prepare.

## 9. Effective operator registry

Effective operator registry строится на фазах validate/prepare.

Он состоит из:

- built-in operators библиотеки
- внешних операторов из `options.operators`, если они переданы

Нормативные правила:

- compile-time проверка операторов использует тот же effective registry, что и runtime execution
- runtime не может подменить реестр, отличный от того, который был связан в prepared artifact
- неизвестные операторы являются compile failure
- внешние packs расширяют effective registry, а не заменяют каноническую prepare/evaluate model

## 10. Семантика built-in operators

Библиотека содержит built-in operators для проверки пустоты, равенства/неравенства, field-to-field comparison, length-checks, regex matching, numeric comparison, collection membership и dictionary membership.

Примеры built-in operator ids:

- `not_empty`
- `is_empty`
- `equals`
- `not_equals`
- `contains`
- `matches_regex`
- `greater_than`
- `less_than`
- `field_equals_field`
- `field_not_equals_field`
- `field_greater_or_equal_than_field`
- `field_less_or_equal_than_field`
- `in_dictionary`
- `any_filled`

Нормативные правила для операторов:

- id оператора является частью artifact-контракта
- обязательные для оператора поля валидируются на compile-фазе
- dictionary-aware operators требуют разрешимого dictionary reference
- field-to-field operators требуют соответствующих field references
- mismatch между семантикой оператора и формой артефакта является compile failure
- runtime behavior при отсутствии поля или пустом значении определяется семантикой оператора и optional-флагами вроде `onEmpty`

Спецификация не обещает все внутренние детали реализации каждого оператора, но рассматривает built-in operator ids, их участие в compile/runtime semantics и требования к их конфигурации как публичное, compatibility-relevant поведение.

## 11. Compile semantics

### 11.1. `validateRules(source, options?)`

`validateRules(...)` выполняет compile-time валидацию и возвращает:

- `ok`
- `diagnostics`

Нормативное поведение:

- функция не бросает исключение только потому, что source невалиден
- она валидирует структурные предположения о source и artifacts
- она валидирует семантические предположения: id, refs, artifact types, step shapes, доступность операторов
- она возвращает машинно-читаемые diagnostics
- `ok = true` означает, что compile-blocking diagnostics не обнаружены

### 11.2. `prepareRules(source, options?)`

`prepareRules(...)` проходит тот же validation path и дополнительно:

- связывает effective operator registry
- разрешает ссылки, нужные для runtime execution
- строит prepared artifact

Нормативное поведение:

- функция бросает `RulesCompileError`, если есть compile failure
- она не возвращает prepared artifact при невалидном compile-state
- это нормативный production-path для получения runtime-ready artifact

### 11.3. Compile diagnostics

Diagnostics — это машинно-читаемые объекты минимум с полями:

| Поле | Обязательно | Смысл |
|---|---:|---|
| `code` | да | Стабильный diagnostic code |
| `level` | да | Уровень серьёзности |
| `message` | да | Человекочитаемое сообщение |
| `path` | да | Путь к месту в source |
| `details` | нет | Дополнительные структурированные детали |

Compile diagnostics могут описывать:

- невалидную форму source
- дублирующиеся id
- неразрешимые ссылки
- невалидные поля артефакта
- неизвестные операторы
- невалидную конфигурацию оператора
- невалидную форму `flow`

## 12. Контракт prepared artifact

Prepared artifact — единственный допустимый вход для `evaluateRules(...)`.

Документированная публичная форма намеренно минимальна:

| Поле | Смысл |
|---|---|
| `kind` | Константный маркер: `'prepared-rules'` |
| `artifactType` | Константный маркер: `'rules'` |
| `version` | Маркер версии runtime/artifact |
| `diagnostics` | Compile diagnostics, прикреплённые к artifact-контракту |

Нормативные правила:

- публично artifact ведёт себя как иммутабельный
- внутренняя runtime-ready модель намеренно не является частью публичного контракта
- runtime опирается на prepare-time binding, уже зафиксированный внутри artifact
- скрытая compile-фаза внутри `evaluateRules(...)` запрещена

## 13. Модель runtime input

`evaluateRules(...)` принимает:

- prepared artifact
- input-объект следующей формы

| Поле | Тип | Обязательно | Смысл |
|---|---|---:|---|
| `pipelineId` | `string` | нет | Явный выбор pipeline/entrypoint |
| `payload` | `object` | да | Runtime payload |
| `context` | `object` | нет | Дополнительный runtime context |

Правила выбора pipeline на runtime:

- если явно передан `pipelineId`, runtime использует его
- иначе runtime может использовать `input.context.pipelineId`
- если в source есть только один пригодный entrypoint, runtime может использовать этот единственный entrypoint
- если runtime не может определить валидный pipeline, это приводит к runtime failure или abort path согласно runtime contract

## 14. Runtime semantics

Нормативное runtime-поведение:

- исполнение начинается с выбранного pipeline
- `flow` pipeline обрабатывается в объявленном порядке
- вложенные pipelines и conditions вычисляются через prepared runtime model
- issues накапливаются в runtime-result согласно исполненным checks
- strict и связанные control-настройки pipeline могут влиять на эскалацию status/control
- runtime не мутирует prepared artifact
- runtime не делает hidden compile, ref repair или operator rebinding

Правила для special cases:

- отсутствие runtime payload fields обрабатывается семантикой operator/rule, а не скрытым переписыванием payload
- отсутствие optional context не является compile-проблемой; оно важно только если нужно для pipeline selection или runtime logic
- transport-safe нормализация публичного результата — обязанность библиотеки, а не хост-сервиса

## 15. Контракт runtime-результата

Публичный runtime-result является transport-safe / JSON-safe по нормативному shape.

Это означает:

- в публичном результате нет `undefined`
- нет функций, классов, `Symbol`, `BigInt` и циклических структур
- документированные поля имеют детерминированную форму
- смысл результата сохраняется после JSON-сериализации и обратного чтения
- результат пригоден для прямой передачи в следующий слой ProcessEngine без ручной очистки в хост-коде

Нормативные поля результата:

| Поле | Обязательно | Смысл |
|---|---:|---|
| `status` | да | Статус выполнения валидации |
| `control` | да | Runtime control signal |
| `issues` | да | Массив структурированных issues |
| `trace` | нет | Структурированная trace, если она включена |
| `error` | только для abort | Payload runtime abort/error |

Документированные значения `status`:

- `OK`
- `OK_WITH_WARNINGS`
- `ERROR`
- `EXCEPTION`
- `ABORT`

Документированные значения `control`:

- `CONTINUE`
- `STOP`

Нормативные правила:

- поля, которые логически отсутствуют, либо опускаются, либо нормализуются в contract-safe значения
- `issues` всегда является частью публичного контракта runtime-result
- `error` появляется только в abort-like runtime failure contract
- downstream-библиотеки не должны требовать `JSON.parse(JSON.stringify(...))` или любой другой технической очистки перед использованием этого результата

## 16. Форма issue-объектов

Каждый элемент в `issues` — структурированный validation issue. Точная vocabulary зависит от source artifact, но публичная модель issues ожидаемо включает поля вида:

- `level`
- `code`
- `message`
- `field` или эквивалентный target path, если применимо
- `ruleId` или эквивалентная ссылка на источник, если применимо

Issue-объекты являются частью runtime-result и тоже должны быть JSON-safe.

## 17. Ошибки

### 17.1. `RulesCompileError`

`RulesCompileError` бросается только `prepareRules(...)`, когда source нельзя подготовить.

Он содержит:

- `code`
- `message`
- `diagnostics`
- optional `cause`

### 17.2. `RulesRuntimeError`

`RulesRuntimeError` используется для runtime failures.

Он содержит:

- `code`
- `message`
- optional `details`
- optional `cause`

Нормативное правило:

- compile-problems не возвращаются как success-path runtime-result
- runtime failures не подменяют собой defects compile-validation слоя

## 18. Trace semantics

Поддерживаются режимы:

- `false`
- `'basic'`
- `'verbose'`

| Режим | Смысл |
|---|---|
| `false` | Trace отсутствует |
| `basic` | Компактные execution events без сырых payload-fragments |
| `verbose` | Расширенные execution events и optional event `input/output` |

Trace events следуют документированному family-level contract shape и могут включать:

- `kind`
- `artifactType`
- `artifactId`
- `step`
- `at`
- `outcome`
- optional `details`
- optional `input`
- optional `output`

Хост может передать `traceRedactor(value, mode)` для редактирования значений до попадания в verbose trace.

## 19. Специальные и граничные случаи

Библиотека явно считает важными следующие boundary cases:

- невалидный или отсутствующий pipeline selection
- отсутствие payload fields, требуемых operator semantics
- пустые значения и пустые коллекции
- неразрешимые ссылки на compile-фазе
- неизвестные операторы
- невалидная конфигурация операторов
- отсутствие optional context
- strict pipeline escalation behavior
- transport-safe нормализация финального публичного runtime-result

Если поведение materially влияет на compile/runtime semantics, оно должно быть описано здесь или в соответствующем разделе про artifact/operator, а не оставаться знанием только из исходников.

## 20. Нормативные примеры

### 20.1. Минимальный валидный source

```json
{
  "artifacts": [
    {
      "id": "library.person.first_name_required",
      "type": "rule",
      "description": "Имя должно быть заполнено",
      "role": "check",
      "operator": "not_empty",
      "field": "person.firstName",
      "level": "ERROR",
      "code": "PERSON.FIRST_NAME.REQUIRED",
      "message": "Имя обязательно"
    },
    {
      "id": "entry.registration",
      "type": "pipeline",
      "description": "Проверка регистрации",
      "entrypoint": true,
      "strict": false,
      "flow": [
        { "rule": "library.person.first_name_required" }
      ]
    }
  ]
}
```

### 20.2. Минимальный runtime-вызов

```js
const artifact = prepareRules(source);
const result = evaluateRules(artifact, {
  pipelineId: 'entry.registration',
  payload: { person: { firstName: '' } },
});
```

### 20.3. Типовая форма runtime-result

```json
{
  "status": "ERROR",
  "control": "STOP",
  "issues": [
    {
      "level": "ERROR",
      "code": "PERSON.FIRST_NAME.REQUIRED",
      "message": "Имя обязательно",
      "field": "person.firstName",
      "ruleId": "library.person.first_name_required"
    }
  ]
}
```

### 20.4. Прямой downstream handoff

Следующий семейный путь является нормативным и не должен требовать технической очистки в хост-сервисе:

```js
const rulesResult = evaluateRules(rulesArtifact, input);
const factsOutput = executeMappings(mappingsArtifact, { payload: rulesResult });
```

Результат `evaluateRules(...)` должен быть transport-safe для такого прямого handoff.

## 21. Ограничения и non-goals

`@processengine/rules` не:

- заменяет слой нормализации данных и построения facts
- выбирает финальные бизнес-исходы
- оркестрирует длительные шаги процесса
- определяет весь downstream-смысл issues сверх документированного runtime-result contract

## 22. Гарантии совместимости

Публичная поверхность совместимости включает:

- имена и сигнатуры exports
- поля source artifact, документированные в этой спецификации
- публичный контракт prepared artifact
- форму runtime-result
- форму diagnostics
- документированный trace contract
- transport-safe / JSON-safe поведение runtime-result

Breaking change — это несовместимое изменение любой из этих документированных публичных гарантий.
