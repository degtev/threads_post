# Threads Auto-Poster

Автоматизированная система для поиска трендовых IT/AI постов в Reddit, переписывания через ИИ, модерации через Telegram-бота и публикации в Threads.

## Как это работает

1. **Каждые 3 часа** (настраиваемо) бот ищет трендовые посты в Reddit
2. **ИИ (DeepSeek)** переписывает пост своими словами на русском
3. **Telegram бот** отправляет вам превью с кнопками
4. Вы нажимаете **✅ Подтвердить** — пост публикуется в Threads
5. Или **❌ Отменить** — бот ищет другой пост
6. Или **✏️ Перегенерировать** — ИИ пишет новый вариант

## Быстрый старт

### 1. Установка зависимостей

```bash
npm install
```

### 2. Настройка переменных окружения

Скопируйте `.env.example` в `.env` и заполните:

```bash
copy .env.example .env
```

Заполните следующие переменные:

| Переменная | Описание | Как получить |
|:---|:---|:---|
| `TELEGRAM_BOT_TOKEN` | Токен Telegram бота | [@BotFather](https://t.me/BotFather) → `/newbot` |
| `TELEGRAM_ADMIN_CHAT_ID` | Ваш Chat ID в Telegram | [@userinfobot](https://t.me/userinfobot) |
| `SUBREDDITS` | Список сабреддитов через запятую (`имя:порог`) | `technology:1000,programming:1000,ChatGPT:1000` |
| `REDDIT_DELAY_MS` | Пауза между запросами к сабреддитам в мс | `4000` (по умолчанию 4 сек) |
| `ANYMODEL_API_KEY` | API-ключ AnyModel | [anymodel.org](https://anymodel.org) → Личный кабинет |
| `ANYMODEL_MODEL` | Модель ИИ | `deepseek-chat` (по умолчанию) |
| `THREADS_ACCESS_TOKEN` | Threads access token | См. раздел ниже |
| `THREADS_USER_ID` | Ваш Threads User ID | См. раздел ниже |
| `THREADS_APP_SECRET` | App Secret из Meta | [developers.facebook.com](https://developers.facebook.com/) |
| `CRON_SCHEDULE` | Расписание cron | `0 */3 * * *` (каждые 3 часа) |

### 3. Настройка Threads API

1. Зайдите на [developers.facebook.com](https://developers.facebook.com/)
2. Создайте новое приложение
3. Добавьте Use Case: **"Access the Threads API"**
4. Настройте Callback URLs (можно `https://localhost/callback`)
5. Перейдите в **App Roles > Roles** и добавьте свой аккаунт как тестера
6. Пройдите OAuth-авторизацию для получения short-lived token
7. Обменяйте на long-lived token (60 дней)

### 4. Запуск

```bash
npm start
```

Или с автоматической перезагрузкой при изменениях:

```bash
npm run dev
```

## Команды Telegram бота

| Команда | Описание |
|:---|:---|
| `/start` | Приветствие и список команд |
| `/force` | Найти новый пост прямо сейчас |
| `/status` | Статистика постов |
| `/setcron <выражение>` | Изменить расписание |

### Примеры cron-расписаний

| Выражение | Описание |
|:---|:---|
| `0 */3 * * *` | Каждые 3 часа |
| `0 */4 * * *` | Каждые 4 часа |
| `0 9,15,21 * * *` | В 9:00, 15:00, 21:00 |
| `0 */1 * * *` | Каждый час |
| `*/30 * * * *` | Каждые 30 минут |

## Сабреддиты

По умолчанию бот парсит:
- `r/technology` (порог: 1000+ upvotes)
- `r/programming` (порог: 1000+ upvotes)
- `r/ChatGPT` (порог: 1000+ upvotes)
- `r/MachineLearning` (порог: 500+ upvotes)
- `r/artificial` (порог: 500+ upvotes)
- `r/LocalLLaMA` (порог: 500+ upvotes)

Изменить список можно в `src/config.js`.

## Структура проекта

```
threads_post/
├── src/
│   ├── index.js              # Точка входа
│   ├── config.js             # Конфигурация
│   ├── services/
│   │   ├── reddit.js          # Парсинг Reddit
│   │   ├── ai-rewriter.js     # Рерайт через DeepSeek
│   │   ├── threads.js         # Публикация в Threads
│   │   ├── telegram-bot.js    # Telegram бот
│   │   └── scheduler.js       # Cron-планировщик
│   ├── db/
│   │   └── store.js           # lowdb обёртка
│   └── utils/
│       ├── logger.js          # Логирование
│       └── token-manager.js   # Обновление Threads токена
├── data/
│   └── posts.json             # База данных (JSON)
├── .env.example
├── .gitignore
├── package.json
└── README.md
```
