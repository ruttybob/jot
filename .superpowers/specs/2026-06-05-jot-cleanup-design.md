# jot: cleanup расширения и workflow-промпт в UI

## Цель

Убрать из репо `jot` авто-синхронизацию `.superpowers/{plans,specs}/` с jot — функционал не используется.
Оставить в расширении только команды `/jot`, `/jot:public`, `/jot:open`.
Переименовать `extensions/jot-autosync/` → `extensions/jot/`, удалить dead-code helpers.
Добавить в модалку робота (`openAgentModal`) табы: текущий generic CLI-промпт + новый workflow-промпт (копия `prompts/sync-jot.md`).

## Что удаляется

| Файл / блок | Причина |
|---|---|
| `pi.on("tool_call", …)` в `extensions/jot-autosync/index.ts` | Auto-sync не нужен |
| `/jot:pull` command | Использовался только для pull из autosync-сессии |
| `classifyPath`, `syncFile`, `SyncState`, `state` | Infra для autosync |
| `updateNote`, `readNoteBody`, `uploadBody` | Dead-code после удаления autosync + pull |
| `.superpowers/plans/2025-05-28-jot-autosync-plan.md` | План удалённой фичи |
| `.superpowers/specs/2025-05-28-jot-autosync-design.md` | Спека удалённой фичи |
| `.superpowers/plans/2025-05-28-test-autosync.md` | Тестовая заметка для autosync |

## Что переименовывается

`extensions/jot-autosync/` → `extensions/jot/`.
Имя `jot-autosync` больше не отражает суть расширения — в нём нет autosync.
Pi сканирует подпапки из `package.json: pi.extensions: ["./extensions"]`, имя папки на загрузку не влияет.

## Architecture после изменений

```text
extensions/
└── jot/
    └── index.ts          ← 3 команды + instance-config + createNote

public/
└── app.js
    └── openAgentModal    ← табы: CLI / Sync threads

prompts/
└── sync-jot.md           ← не трогается, источник workflow-промпта
```

### Компоненты расширения

| Блок | Что делает | Зависимости |
|---|---|---|
| Instance config | `safeInstanceName`, `save/loadGlobalInstance`, `restoreInstanceFromSession`, `getActiveInstance`, `getInstances`, `getInstanceUrl`, `parseInstances`, `JotInstance` | `node:fs`, `node:os`, `node:child_process` |
| Note writers | `createNote(instance, title, content)` — единственный писатель, используется `/jot:public` | jot CLI |
| Commands | `/jot`, `/jot:public`, `/jot:open` | instance config + note writers |

`createNote` упрощается: вместо двух вызовов (create + uploadBody) — один `execSync` с `CONTENT=$(cat tmpFile)` подстановкой.

## Модалка робота — UI

`public/app.js: openAgentModal(refs)` разбивается на:

| Блок | Ответственность |
|---|---|
| `buildCliPrompt(isOwnerView, ctx)` | Возвращает текущий generic CLI-промпт (вынос существующего кода в функцию без изменений текста) |
| `buildSyncPrompt(isOwnerView, ctx)` | Возвращает workflow-промпт |
| `renderTabs(active)` | HTML табов; активный по умолчанию `"cli"` |
| `openAgentModal(refs)` | Оркестрация: модалка, табы, copy button |

State таба — локальная переменная в замыкании `openAgentModal`, не в глобальном `state`.

### HTML-каркас

```html
<div class="modal agent-modal">
  <div class="settings-header">
    <h2 class="settings-title">Agent setup</h2>
    <jot-icon-button icon="close" label="Close" id="agentModalClose"></jot-icon-button>
  </div>
  <p class="agent-hint">{hint}</p>
  <div class="agent-tabs">
    <button data-tab="cli" class="active">Agent CLI</button>
    <button data-tab="sync">Sync threads</button>
  </div>
  <pre class="agent-instructions"><code>…</code></pre>
  <jot-button variant="ghost" size="sm" id="agentCopyBtn">copy to clipboard</jot-button>
</div>
```

### Sync-промпт — содержание

Owner (точная копия `prompts/sync-jot.md` с подставленными переменными):

```text
- `jot $instance read-threads $noteId` — read unresolved threads
- For each unresolved thread: `reply` with a proposed change,
  tell the user what you proposed, **wait for confirmation**
- After confirmation: `resolve` the thread, `edit` the note if the thread requires changes

## Rules

- No confirmation → don't resolve, don't edit
- All replies and edits in Russian
```

Shared (адаптация — без `resolve` и `edit`, они недоступны;
`reply` и `comment` работают через share-API):

```text
- `jot read` — read the note with threads (shared-mode, no instance)
- For each unresolved thread: propose a `reply`,
  tell the user what you proposed, **wait for confirmation**
- After confirmation: `reply` to the thread

## Rules

- No confirmation → don't reply
- All replies in Russian
```

### Подстановка переменных

- `$instance` — фиксированное `my-jot` (для консистентности с CLI-табом, где тоже используется `my-jot`)
- `$noteId` — `state.note?.id || "<note-id>"`

## Что НЕ меняется

- `prompts/sync-jot.md` — остаётся как pi-prompt-template для команды `/sync-jot`
- `prompts/pub.md`, `prompts/explain.md`, `prompts/modernize.md` — не трогаются
- Команды `/jot`, `/jot:public`, `/jot:open` — поведение не меняется
- Стили `.agent-modal`, `.agent-instructions`, `.agent-hint` — переиспользуются
- Добавится только минимальный CSS для `.agent-tabs` (строка кнопок + active-состояние)

## Тестирование

Ручное:

1. Запустить `npm run dev`
2. Открыть заметку, кликнуть иконку робота
3. Проверить оба таба: переключение, copy-to-clipboard копирует содержимое активного таба
4. В owner-view оба таба содержат разные промпты
5. В shared-view оба таба содержат адаптированные промпты

Pi-команды:

1. Запустить pi в репо jot
2. `/jot` — выбор инстанса работает
3. `/jot:public .superpowers/plans/<file>.md` — публикация работает
4. `/jot:open` — браузер открывается
5. `/jot:pull` — больше не существует (команда не найдена)

## Не входит в скоуп

- Удаление `.superpowers/plans/2026-05-26-jot-orphaned-anchors.md` — это другая фича
- Синхронизация `prompts/sync-jot.md` с промптом в модалке — два источника истины сознательны
- CSS-рефакторинг модалки
