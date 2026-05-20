# Changelog

## [Unreleased]

### Added
- Промпт `/sync-jot`: просмотр комментариев в плане, reply → подтверждение пользователя → resolve + правка плана
- Команда `read-threads` (CLI + API): получить только комментарии без тела заметки

### Changed

- Промпты (plan, plan-detailed, explain, modernize, self-note): heredoc во временный файл + `$(cat /tmp/file)` вместо инлайна большого контента в shell-команды
- Промпт sync-jot: обобщена формулировка с «plan» на «note»
- Промпт plan-detailed: убрано поле Status ⏳ Not implemented
- Промпты (explain, modernize, plan, plan-detailed, self-note): навык jot читается только перед сохранением, а не в начале работы
- Кнопка change имени комментатора теперь доступна и для owner (раньше блокировалась)
- Промпт sync-jot: упрощён — убраны лишние строки, команда `read` заменена на `read-threads`

### Chore

- Добавлен `.pi/` в .gitignore

- Архивация заметок: статус `archived`, табы Active/Archive в UI, команды CLI `archive`/`unarchive`, иконки архива
- Persist имён комментаторов между сессиями (commenters.json), кнопка "change" для смены имени
- Кнопка «Back to editor» на shared-странице для owner; авто-identity «Owner» без модального окна
- Кнопка «View & Comment» в topbar редактора: переход в режим просмотра с комментированием (shared-страница, та же вкладка)

### Changed

- Промпты переименованы: убран префикс `jot-`, `explore` → `explain`
- Промпты обновлены: делегирование subagents, `ask_user_question`, дедупликация планов
- SKILL.md сжат и упрощён (команды, multiline, workflow)
- Промпты plan и plan-detailed: добавлено указание языка (русский) и guardrail «Plan only» (без реализации)

### Fixed

- Треды комментариев на публичной странице, расположенные ниже контента, теперь доступны при скролле

### Changed

- В SKILL.md добавлено указание использовать русский язык для jot-заметок

- Имя основного инстанса в промптах заменено с `home` на `main`
- Подавление баннера «Disconnected» при навигации между заметками
- Многострочный контент в промптах: замена inline `\n` на файловый метод (cat → переменная → update), чтобы избежать проблем с экранированием спецсимволов
- В skill добавлены гайдлайны по многострочному контенту

### Added

- Custom favicon: сервер автоматически подхватывает `favicon.svg`, `favicon.png` или `favicon.ico` из data-директории
- CLI: флаг `--description` для `jot register`, описание выводится в `jot instances`
- Промпт jot-self-note для сохранения личных заметок в self-инстанс (порт 3211)
- Отображение frontmatter (YAML-шапки) в заметках — парсинг и стилизованный вывод ключей/значений
- Промпты для pi: jot-plan, jot-plan-detailed, jot-explore, jot-discuss — создание планов, исследований и обсуждений с сохранением в jot
- Промпт jot-modernize для модернизации кода
- Skill для интеграции jot CLI с pi

### Removed

- Промпт jot-discuss удалён (больше не используется)

### Changed

- Промпты jot-discuss и jot-explore переработаны: теперь генерируют 5 разнообразных перспектив/находок с синтезом и выводами
- Открытие заметок из промптов через shared view (comment-доступ) вместо прямого editor-линка
- Промпт jot-discuss больше не сохраняет результат в jot — только выводит обсуждение
