#  GitHub → Telegram бот: уведомления о коммитах и статистика

**Цель проекта:** создать Telegram-бота на стеке Node.js + TypeScript с использованием [grammY](https://grammy.dev/), который:

- Отслеживает события коммитов в GitHub-репозиториях;
- Отправляет уведомления о коммитах в заданные темы Telegram-чата;
- Публикует еженедельный отчёт по активности участников.

---

##  Возможности

- Привязка GitHub-репозиториев к Telegram-темам
- Сопоставление Telegram-юзеров с их GitHub-аккаунтами
- Обработка webhook-событий `push` от GitHub
- Автоматическая публикация сообщений о новых коммитах
- Еженедельный отчёт по каждому участнику проекта

---

##  Команды бота

| Команда | Описание |
|--------|----------|
| `/start` | Начало работы. Отображает приветствие и справку. |
| `/help` | Список всех доступных команд. |
| `/addrepo <owner/repo>` | Привязать репозиторий к теме. |
| `/delrepo <owner/repo>` | Удалить привязку репозитория. |
| `/linkgithub <github_username>` | Привязать GitHub к Telegram-пользователю. |
| `/unlinkgithub` | Удалить свою привязку. |
| `/myrepo` | Показать мои репозитории. |

>  Все команды работают только в чате с ботом а не в топиках
---

##  Архитектура

- **Telegram-бот:** `grammY` (обработка команд и отправка сообщений)
- **HTTP-сервер:** `Express` (обработка GitHub Webhooks)
- **БД:** `SQLite` через `Prisma`
- **Планировщик:** `node-cron` — еженедельные отчёты
- **Конфигурация:** `.env` + переменные окружения

---

##  Переменные окружения

```env
BOT_TOKEN=токен_бота_из_BotFather
WEBHOOK_SECRET=секрет_для_GitHub
DATABASE_URL=file:/data/sqlite.db
PORT=3000
```

---

##  Установка и запуск через Docker

1. Клонируйте проект:

   ```bash
   git clone https://github.com/mixaron/git-tg-ptractice.git
   cd git-tg-ptractice
   ```

2. Заполните `.env` файл.

3. Соберите и запустите проект:

   ```bash
   docker-compose build
   docker-compose up -d
   ```

---

##  Настройка GitHub Webhook

1. Зайди в репозиторий на GitHub → **Settings** → **Webhooks**
2. Нажми **Add webhook**
3. Укажи:
   - **Payload URL:** `http://<твой-домен>/webhook`
   - **Content type:** `application/json`
   - **Secret:** тот же, что в `WEBHOOK_SECRET`
   - **Events:** `Just the push event`

---

## Пример уведомления

```text
 Новый коммит в mixaron/git-tg-ptractice [main]
 https://github.com/mixaron/git-tg-ptractice/commit/abc123

Автор: [mixaron](https://github.com/mixaron)
Сообщение: "fix: исправлена обработка webhook"
Изменения: 3 файла, +45 / -10 строк
```

---

## Пример еженедельного отчёта

```text
 Статистика за неделю:

1. @anton (mixaron): 12 коммитов
2. @qqgghhuuia (qqgghhuuia): 5 коммитов
```

---

##  Нефункциональные требования

- **Надёжность:** повторные webhook'и не ломают логику
- **Масштабируемость:** поддержка многих команд и репозиториев
- **Документация:** всё описано в этом README

---

## Технологии

- **Язык:** TypeScript
- **Фреймворки:** grammY, Express
- **ORM:** Prisma
- **БД:** SQLite
- **Планировщик:** node-cron
- **Контейнеризация:** Docker, Docker Compose

---

## 🧑‍💻 Авторы

- Telegram: [@mixaron](https://t.me/mixaron)
- GitHub: [mixaron](https://github.com/mixaron)

- Telegram: [@qqgghhuuia](https://t.me/qqgghhuuia)
- GitHub: [matvey1347srgtjh](https://github.com/matvey1347srgtjh)

