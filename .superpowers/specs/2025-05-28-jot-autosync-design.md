# jot-autosync: автоматическая публикация specs/plans в jot

## Цель

Pi-расширение, которое автоматически публикует файлы из `.superpowers/plans/` и `.superpowers/specs/` как заметки в jot. Публикация происходит без участия агента или пользователя — при создании файла заметка создаётся, при изменении — обновляется.

## Архитектура

```
~/.pi/agent/extensions/
└── jot-autosync/
    └── index.ts          ← Всё расширение: watcher + команды + autosync

~/.config/jot/
└── pi-default-instance   ← Глобальный выбор инстанса (одна строка — имя)
```

### Компоненты

| Компонент | Ответственность |
|---|---|
| File watcher | `fs.watch` на `.superpowers/plans/` и `.superpowers/specs/`, debounce 500ms |
| Publisher | Создание и обновление заметок через jot CLI |
| `/jot` | Выбор инстанса, сохранение в глобальный конфиг |
| `/jot:public` | Ручная публикация файла (из существующего `/jot-public`) |
| `/jot:open` | Открытие инстанса в браузере |

## Глобальное состояние инстанса

- Файл `~/.config/jot/pi-default-instance` — одна строка с именем инстанса
- `/jot` пишет в этот файл при выборе
- Autosync и все команды читают из него
- Fallback на `self` если файл отсутствует

## Команды

### `/jot` — выбор инстанса

1. Вызывает `jot instances`, парсит список
2. Показывает `ctx.ui.select()` с инстансами
3. Сохраняет выбранное имя:
   - В `~/.config/jot/pi-default-instance` (глобально)
   - В session entry через `pi.appendEntry()` (для совместимости)
4. Уведомляет `ctx.ui.notify()`

### `/jot:public <path>` — ручная публикация

1. Берёт инстанс из глобального конфига или session entry
2. Читает файл по указанному пути
3. Title: `<relDir>/<fileBase>-<hh:mm>`
4. Создаёт заметку: `jot <inst> create "title"` → noteId
5. Загружает body: `jot <inst> update <id> markdown` (через tmp-файл)
6. Отправляет `pi.sendMessage()` с информацией о публикации
7. Автокомплит путей (как в текущей реализации)

### `/jot:open` — открыть в браузере

1. Читает инстанс из глобального конфига
2. Парсит URL из `jot instances`
3. Вызывает `open <url>` (macOS)

## File watching и синхронизация

### Запуск watcher'а

При `session_start`:
1. Проверяет наличие `{cwd}/.superpowers/plans/` и `{cwd}/.superpowers/specs/`
2. Для каждой существующей директории — `fs.watch()`
3. Фильтрует только `.md` файлы
4. Debounce 500ms на каждый файл

### Обработка событий

```
fs.watch event → debounce 500ms
  │
  ├── Новый файл (нет в Map)
  │   ├── title = basename(cwd) + "/" + "plans"|"specs" + "/" + filename
  │   ├── jot <inst> create "title" → noteId
  │   ├── jot <inst> update <id> markdown <content>
  │   └── Map.set(absPath, noteId)
  │
  ├── Существующий файл (есть в Map, noteId известен)
  │   ├── jot <inst> read <id> → проверяем archived status
  │   ├── Если archived → Map.delete(absPath), skip
  │   └── Если active → jot <inst> update <id> markdown <content>
  │
  └── Файл удалён/перемещён
      └── Map.delete(absPath) — заметка в jot не трогается
```

### Title заметки

Формат: `<project-name>/<plans-or-specs>/<file-name>`

- `project-name` = `basename(cwd)` — корень проекта
- `plans-or-specs` = поддиректория (`plans` или `specs`)
- `file-name` = имя файла

Пример: `jot/plans/2025-05-28-jot-autosync-design.md`

### Body заметки

Полное содержимое файла.

### Маппинг файл → заметка

- `Map<absPath, noteId>` — в памяти расширения
- Не персистится между сессиями
- При перезапуске — существующие файлы не триггерят публикацию (fs.watch эмитит только новые события)

### Очистка

При `session_shutdown`:
- Закрыть все `fs.FSWatcher` инстансы
- Очистить все debounce-таймеры
- Очистить Map

## Технические детали

- jot CLI: `jot <inst> create`, `jot <inst> update <id> markdown`, `jot <inst> read <id>`
- Многострочный контент через tmp-файл + `CONTENT=$(cat file) && jot <inst> update <id> markdown "$CONTENT"`
- `execSync` для синхронных вызовов jot CLI (как в текущем расширении)
- Debounce: `setTimeout` + `clearTimeout` per file path
- Fallback инстанс: `self`

## Отношение к существующему коду

- Текущий `extensions/jot.ts` в проекте jot — **заменяется** глобальным расширением
- Новое расширение включает все команды из старого (`/jot`, `/jot:public`) плюс `/jot:open` и autosync
- Старый файл можно удалить после миграции
