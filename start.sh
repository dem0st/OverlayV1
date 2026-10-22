#!/usr/bin/env bash
# Запуск сервера оверлея на Linux / macOS
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js не найден. Установите Node.js 18+ (https://nodejs.org) и повторите." >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Устанавливаю зависимости..."
  npm install --omit=dev
fi

exec node server.js "$@"
