# Тетива CLI

`@tetiva/cli` — командная строка Тетивы. Пушишь свои i18n-файлы одной командой, получаешь их переведёнными — с целыми плейсхолдерами и всеми плюральными категориями, которые требует целевая локаль, — и забираешь обратно в репозиторий. Без правок руками, рядом с привычным git-флоу, а не вместо него.

## Установка

```sh
npm install -g @tetiva/cli
```

Пакет пока не опубликован в npm — команда заработает с первым релизом.

## Статус

Status: pre-alpha.

## Local development

The CLI talks to `https://api.tetiva.dev` by default. To point it at a backend
running on your machine, set `TETIVA_API_URL` before invoking any command:

```sh
TETIVA_API_URL=http://localhost:3000 tetiva login
```

The override applies to every backend HTTP call the CLI makes, including the
browser-redirect target used by `tetiva login`.
