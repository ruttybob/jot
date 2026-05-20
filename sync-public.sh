#!/bin/bash
# Синхронизация публичного remote без папок prompts/ и skills/
# Использование: ./sync-public.sh <PUBLIC_REMOTE_URL>
# Пример: ./sync-public.sh git@github.com:user/jot.git
#
# Требования: git-filter-repo (brew install git-filter-repo)

set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <PUBLIC_REMOTE_URL>"
  exit 1
fi

PUBLIC_REMOTE_URL="$1"
PRIVATE_REPO="/Users/sergeykostrov/pets/jot"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

echo "==> Клонирую приватный репо..."
git clone "$PRIVATE_REPO" "$TMPDIR/jot-public"

cd "$TMPDIR/jot-public"

echo "==> Вырезаю prompts/ и skills/ из истории..."
git filter-repo --path prompts/ --path skills/ --invert-paths --force

echo "==> Пушу в публичный remote..."
git remote add public "$PUBLIC_REMOTE_URL"
git push public main --force

echo "==> Готово. Публичный remote обновлён."
