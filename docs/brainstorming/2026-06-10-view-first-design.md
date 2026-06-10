# View-first: открытие заметки в режиме просмотра

**Дата:** 2026-06-10
**Статус:** утверждено

## Проблема

При открытии заметки из списка пользователь попадает сразу в редактор.
Чаще всего нужно просто прочитать заметку и, возможно, оставить комментарий — редактирование требуется редко.

## Решение

Клик на заметку в списке открывает её в режиме view + comment (через `/s/:shareId`).
Для редактирования — кнопка-карандаш переводит в editor (`/notes/:id`).

## Флоу

```
Список заметок → клик на заметку → /s/:shareId (view + comments)
                                      ↓ карандаш
                                 /notes/:id (editor)
                                      ↓ "View & Comment"
                                 /s/:shareId (view + comments)
```

- Back → `/` (список) — один путь назад из обоих режимов
- Новый note → `/notes/:id` (editor) — нужно заполнить содержимое

## Что меняется

### `public/app.js` — список заметок

Клик на строку заметки в списке:

1. Если `shareAccess === "none"` — `PUT /api/notes/:id` с `{ shareAccess: "comment" }`
2. Редирект на `/s/:shareId`

Сейчас: редирект на `/notes/:id`.

### `public/app.js` — новый note

Кнопка "+" создаёт заметку и открывает `/notes/:id` (editor) — без изменений.

### `src/server.ts` — без изменений

- `/notes/:id` — остаётся editor
- `/s/:shareId` — остаётся view/public

### Что НЕ меняется

- `/s/:shareId` — полностью без изменений
- CLI — без изменений
- Pi extension — без изменений
- Collab editor — без изменений

## Edge cases

- **shareAccess = "none":** при клике на заметку auto-set `"comment"`, затем редирект на `/s/:shareId`
- **shareAccess = "edit":** external users могут редактировать через shared page — это не меняется
- **Locked notes:** view mode доступен для locked notes (просмотр и комменты)
- **Owner на /s/:shareId:** уже обрабатывается — auto-identity "Owner", кнопка "Back to editor" видна

## Объём изменений

~10 строк в `public/app.js` (обработчик клика в списке заметок).
