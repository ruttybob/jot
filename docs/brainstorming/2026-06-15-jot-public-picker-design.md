# Дизайн: `/jot:public` picker финальных ответов агента

**Дата:** 2026-06-15
**Статус:** одобрен (в чате)
**Репо:** `@mariozechner/jot`, расширение `extensions/jot/`

## Проблема

Команда `/jot:public` сейчас работает только с файлом: `/jot:public <path>`.
Хочется: при вызове **без аргументов** открыть picker overlay финальных ответов
агента (agent_end, а не каждый промежуточный turn), выбрать один и сразу
запушить в jot + открыть заметку в браузере — по аналогии с `/preview`
из ruttybob.

## Ключевое техническое ограничение

В session log **нет явного маркера agent_end**. `SessionMessageEntry` — это
просто `{ type: "message", message: AgentMessage }`. Отличить финальный ответ
от промежуточного (где агент вызвал tool и выдал кусок текста) можно только по
`content`: assistant message **без** блоков `type: "tool_use"` = финальный ответ.

## Решение: фильтр по отсутствию tool_use

Выбран подход «Filter: без tool_use» (вариант 1 из брейншторма).

Чистая функция читает `sessionManager.getBranch()` и фильтрует:

```ts
getAgentEndMessages(branch: SessionEntry[]): AgentEndMessage[]
  for entry of branch:
    if entry.type !== "message": skip
    if entry.message.role !== "assistant": skip
    content = entry.message.content
    // КЛЮЧЕВОЙ ФИЛЬТР: сообщение с tool_use — промежуточный step
    if content.some(c => c.type === "tool_use"): skip
    text = content.filter(c => c.type === "text").join("\n\n")
    if !text.trim(): skip
    → финальный ответ { index, markdown, preview }
```

**Плюсы:** читает sessionManager (персистентно), переживает `/reload` и
рестарт, не добавляет мусор в session log.
**Минус (приемлемый):** assistant message с `text + tool_use` вместе
(«мысли вслух» перед tool call) считается промежуточным — обычно верно, так
как финальный ответ идёт отдельным сообщением без tool_use.

## Команды

```
/jot:public              → picker overlay финальных agent_end ответов
                           → выбрать → create note → открыть в браузере
/jot:public <path>       → как сейчас: файл → jot note
```

## Компоненты (один файл `extensions/jot/index.ts`)

| Компонент | Назначение |
|---|---|
| `getAgentEndMessages(branch)` | **Чистая.** Фильтрует assistant без tool_use → `[{ index, markdown, preview }]`. |
| `buildNoteTitle(markdown, now)` | **Чистая.** Первая meaningful строка (без `#`), обрез ~50 симв + ` HH:MM`. |
| `pickAgentEndMessage(ctx)` | Overlay `ctx.ui.custom` + `SelectList` + `frameBox`, anchor center, width 80. Старт на последнем. ↑↓/Enter/Esc. Если 1 сообщение — без picker. |
| `openJotUrl(ctx, url)` | Вынесенная логика открытия (cmux `--pane` через `cmux identify` или системный `open`). Переиспользуется `/jot:open`. |
| handler `/jot:public` | Пустой arg → picker → `createNote` → `openJotUrl`. |

## Data flow

```
/jot:public (пусто)
  → ctx.waitForIdle()
  → messages = getAgentEndMessages(ctx.sessionManager.getBranch())
  → if 0: notify "No agent responses found"; return
  → md = (len===1) ? messages[0].markdown : pickAgentEndMessage(ctx)
  → if !md: return (отменён)
  → title = buildNoteTitle(md, new Date())
  → id = createNote(instance, title, md)
  → openJotUrl(ctx, `${baseUrl}/notes/${id}?view`)
  → notify + pi.sendMessage({ customType: "jot-published", ... })
```

## Тестовая инфраструктура (новая для jot репо)

jot репо не имеет vitest и `tests/`. Создаём минимальный stub-паттерн
(по образцу ruttybob):

```
jot/
├── extensions/jot/index.ts
├── tests/
│   ├── extensions/jot/index.test.ts   ← NEW
│   └── stubs/
│       ├── @earendil-works/pi-coding-agent.ts   ← ExtensionAPI, SessionManager
│       └── @earendil-works/pi-tui.ts            ← SelectList, Container, Text, Theme
├── vitest.config.ts    ← NEW (aliases → stubs)
├── tsconfig.test.json  ← NEW (path aliases)
└── package.json        ← + "test": "vitest run", + vitest devDep
```

### Что под TDD (чистые функции)

1. **`getAgentEndMessages`** —
   - assistant без tool_use → включить
   - assistant с tool_use → пропустить (промежуточный)
   - assistant с text + tool_use → пропустить
   - не-assistant (user/tool) → пропустить
   - пустой content → пропустить

2. **`buildNoteTitle`** —
   - первая meaningful строка без `#`, обрез ~50 симв
   - суффикс ` HH:MM`
   - пустой markdown → fallback по времени

Overlay picker и `openJotUrl` — ручная проверка (как в preview).

## Что НЕ делаем (YAGNI)

- ❌ `/jot:auto-public` toggle (нет запроса)
- ❌ Персистенция picker state
- ❌ Рефакторинг существующего `/jot:open` (только вынос `openJotUrl` в общую функцию)

## Зависимости

- pi SDK (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`) — не в
  `dependencies` (предоставляется рантаймом), только в devDeps через stubs.
- `vitest` — новый devDep.
- jot CLI (уже используется).
