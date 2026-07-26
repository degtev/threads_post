import logger from './utils/logger.js';
import { initStore } from './db/store.js';
import { startBot, stopBot } from './services/telegram-bot.js';
import { startScheduler, stopScheduler } from './services/scheduler.js';

async function main() {
  logger.info('═══════════════════════════════════════');
  logger.info('  Threads Auto-Poster запускается...');
  logger.info('═══════════════════════════════════════');

  // 1. Инициализация базы данных
  await initStore();

  // 2. Запуск Telegram бота
  startBot();

  // 3. Запуск cron-планировщика
  startScheduler();

  logger.info('✅ Все сервисы запущены');

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Завершение работы...');
    stopScheduler();
    stopBot();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error(`Фатальная ошибка: ${err.message}`);
  process.exit(1);
});
