# Автодополнение заметок в /jot:open

**Дата:** 2026-06-12
**Статус:** утверждено

## Проблема

`/jot:open` сейчас открывает только главную страницу инстанса. Нет возможности открыть конкретную заметку из чата.

## Решение

Расширить `/jot:open` поддержкой необязательного аргумента — noteId:

- **Без аргумента** → открывает главную страницу инстанса (как сейчас)
- **С noteId** → открывает `baseUrl/notes/:noteId?view`

### getArgumentCompletions

Вызывает `jot <instance> list`, парсит TSV-вывод (`id\ttitle\tdate`), фильтрует по prefix, возвращает `{ value: noteId, label: title, description: date }`.

### handler

Если `args.trim()` непустой — считается noteId. URL = `${baseUrl}/notes/${noteId}?view`. Если пустой — `${baseUrl}` (корень, список заметок).

## Объём изменений

- `extensions/jot/index.ts`: ~25 строк (getArgumentCompletions + обновлённый handler)
