import 'dotenv/config';

const config = {
  // Сабреддиты (из .env или по умолчанию)
  subreddits: (process.env.SUBREDDITS || 'technology:1000,programming:1000,ChatGPT:1000,MachineLearning:500,artificial:500,LocalLLaMA:500')
    .split(',')
    .map((item) => {
      const [name, scoreStr] = item.trim().split(':');
      return {
        name,
        minScore: scoreStr ? parseInt(scoreStr, 10) : 500,
      };
    }),

  // Reddit
  reddit: {
    sort: 'hot',           // hot | top | rising
    limit: 25,             // постов за запрос
    userAgent: 'ThreadsAutoPoster/1.0.0',
    delayMs: parseInt(process.env.REDDIT_DELAY_MS || '4000', 10),
  },

  // AnyModel (OpenAI-compatible)
  ai: {
    apiKey: process.env.ANYMODEL_API_KEY,
    baseUrl: 'https://anymodel.org/v1',
    model: process.env.ANYMODEL_MODEL || 'am/deepseek-v4-flash',
    maxTokens: 600,
    systemPrompt: `Ты — профессиональный копирайтер для социальных сетей.
Перепиши следующий пост своими словами на русском языке.
Сохрани ключевую мысль, но сделай текст уникальным и интересным.
Текст должен быть лаконичным (до 500 символов), подходящим для Threads.
НЕ используй хештеги. НЕ добавляй ссылки. НЕ упоминай Reddit или источник.
Если пост на английском — переведи и адаптируй для русскоязычной аудитории.
Пиши живым, разговорным языком. Можно использовать эмодзи (умеренно).
Отвечай ТОЛЬКО текстом поста, без пояснений и комментариев.`,
  },

  // Telegram
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    adminChatId: process.env.TELEGRAM_ADMIN_CHAT_ID,
  },

  // Threads (Meta)
  threads: {
    accessToken: process.env.THREADS_ACCESS_TOKEN,
    userId: process.env.THREADS_USER_ID,
    appSecret: process.env.THREADS_APP_SECRET,
    apiBase: 'https://graph.threads.net/v1.0',
  },

  // Планировщик
  cron: {
    schedule: process.env.CRON_SCHEDULE || '0 */3 * * *',
  },

  // Пути к данным
  paths: {
    db: './data/posts.json',
  },
};

export default config;
