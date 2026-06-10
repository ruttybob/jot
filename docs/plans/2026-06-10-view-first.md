# View-first: открытие заметки в режиме просмотра

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** При клике на заметку в списке открывать её в режиме view + comment (`/s/:shareId`) вместо editor (`/notes/:id`).

**Architecture:** Переиспользуем существующий shared-view (`/s/:shareId`) как default. Editor (`/notes/:id`) — только при явном переходе через кнопку-карандаш. Список заметок получает `shareAccess` в данных для авто-включения sharing при `shareAccess: "none"`.

**Tech Stack:** Vanilla JS (frontend), Express (backend), существующие jot UI components.

---

### Task 1: Добавить `shareAccess` в список заметок

**Files:**
- Modify: `src/server.ts:89` (тип `NoteSummary`)
- Modify: `src/server.ts:1639` (функция `summarizeNote`)

Чтобы при клике на заметку из списка frontend знал `shareAccess`, нужно включить его в `NoteSummary`.

- [ ] **Step 1: Добавить `shareAccess` в тип `NoteSummary`**

В `src/server.ts`, строка ~89:

```typescript
type NoteSummary = {
  id: string;
  title: string;
  updatedAt: string;
  shareId: string;
  shareAccess: ShareAccess;
  snippet: string;
  locked: boolean;
};
```

- [ ] **Step 2: Добавить `shareAccess` в `summarizeNote`**

В `src/server.ts`, строка ~1639:

```typescript
function summarizeNote(note: NoteRecord, needle: string): NoteSummary {
  return {
    id: note.id,
    title: note.title,
    updatedAt: note.updatedAt,
    shareId: note.shareId,
    shareAccess: note.shareAccess,
    snippet: buildSnippet(note, needle),
    locked: note.locked,
  };
}
```

- [ ] **Step 3: Проверить сборку**

Run: `cd /Users/sergeykostrov/pets/jot && npx tsc --noEmit`
Expected: без ошибок

- [ ] **Step 4: Commit**

```bash
git add src/server.ts
git commit -m "feat(api): include shareAccess in NoteSummary for list endpoint"
```

---

### Task 2: Изменить клик по заметке в списке на view-first

**Files:**
- Modify: `public/app.js:228-230` (обработчик клика в списке)

Сейчас клик на заметку редиректит на `/notes/:id`. Нужно: если `shareAccess === "none"` — сначала включить `"comment"`, затем редирект на `/s/:shareId`.

- [ ] **Step 1: Сохранить `shareAccess` в data-атрибут строки заметки**

В функции `loadNotes` (~строка 340), в шаблоне `note-row`:

```html
<div class="note-row${note.locked ? " note-row--locked" : ""}" data-note-id="${escapeHtml(note.id)}" data-share-id="${escapeHtml(note.shareId)}" data-share-access="${escapeHtml(note.shareAccess)}">
```

Заменить текущую строку:
```html
<div class="note-row${note.locked ? " note-row--locked" : ""}" data-note-id="${escapeHtml(note.id)}">
```

- [ ] **Step 2: Изменить обработчик клика в `noteList`**

Заменить блок (~строки 228-230):

```javascript
const row = event.target.closest("[data-note-id]");
if (!row) return;
window.location.href = `/notes/${row.dataset.noteId}`;
```

На:

```javascript
const row = event.target.closest("[data-note-id]");
if (!row) return;
const { noteId, shareId, shareAccess } = row.dataset;
if (shareAccess === "none") {
  await api(`/api/notes/${noteId}`, {
    method: "PUT",
    body: { shareAccess: "comment" },
  });
}
window.location.href = `/s/${shareId}`;
```

- [ ] **Step 3: Проверить вручную**

1. Запустить сервер: `node cli/jot.mjs self serve`
2. Открыть `http://localhost:3000` в браузере
3. Кликнуть на заметку → должен открыться view-режим (`/s/:shareId`) с preview + comments
4. Нажать карандаш → должен открыться editor (`/notes/:id`)
5. Нажать "View & Comment" в editor → вернуться в view (`/s/:shareId`)
6. Создать новую заметку → должен открыться editor (`/notes/:id`)
7. Проверить заметку с `shareAccess: "none"` → при клике auto-set `"comment"`, открывается view

- [ ] **Step 4: Commit**

```bash
git add public/app.js
git commit -m "feat(ui): open notes in view & comment mode by default from list"
```

---

### Task 3: Убедиться что новый note открывает editor

**Files:**
- Modify: `public/app.js:168` (кнопка "new note" в topbar)
- Modify: `public/app.js:331` (кнопка "new note" в empty state)

Обработчики создания нового note должны редиректить на `/notes/:id` (editor) — проверить что это уже так.

- [ ] **Step 1: Проверить текущие редиректы**

Строка ~168:
```javascript
window.location.href = `/notes/${payload.note.id}`;
```

Строка ~331:
```javascript
window.location.href = `/notes/${payload.note.id}`;
```

Оба редиректа ведут на `/notes/:id` (editor). Это правильное поведение — новые заметки должны открываться в editor.

**Никаких изменений не требуется.** Этот шаг — верификация.

- [ ] **Step 2: Проверить вручную**

1. Создать новую заметку кнопкой "+"
2. Должен открыться editor (textarea виден, можно печатать)
3. После написания текста нажать "View & Comment" → view-режим

---

### Task 4: Проверить навигацию "View & Comment" из editor

**Files:**
- Modify: `public/app.js:440-451` (обработчик `viewCommentButton`)

Сейчас кнопка "View & Comment" в editor делает `PUT shareAccess: "comment"` и редиректит на `/s/:shareId`. Это уже правильное поведение — при новом flow это и есть путь из editor в view.

- [ ] **Step 1: Проверить текущий обработчик**

Строки ~440-451:
```javascript
if (viewCommentButton) {
  viewCommentButton.addEventListener("click", async () => {
    if (!state.note) return;
    const access = state.note.shareAccess;
    if (access !== "comment" && access !== "edit") {
      await api(`/api/notes/${noteId}`, {
        method: "PUT",
        body: { shareAccess: "comment" },
      });
    }
    window.location.href = `/s/${state.note.shareId}`;
  });
}
```

Редирект на `/s/:shareId` — правильное поведение, совпадает с новым flow.

**Никаких изменений не требуется.** Этот шаг — верификация.

- [ ] **Step 2: Проверить вручную**

1. Открыть заметку через список (→ view mode)
2. Нажать карандаш (→ editor)
3. Нажать "View & Comment" → вернуться в view
4. Цикл view ↔ editor работает без проблем
