import cron from 'node-cron';
import config from '../config.js';
import logger from '../utils/logger.js';
import { findTrendingPost } from './reddit.js';
import { rewritePost } from './ai-rewriter.js';
import { addPost, updateRewrite } from '../db/store.js';
import { sendPreview, sendToAdmin } from './telegram-bot.js';

/** @type {import('node-cron').ScheduledTask | null} */
let scheduledTask = null;

/**
 * Основной пайплайн: найти пост → рерайт → отправить на модерацию.
 * Вызывается как по cron, так и вручную через /force.
 */
export async function processPipeline() {
  logger.info('🚀 Запуск пайплайна...');

  // 1. Найти трендовый пост
  const candidate = await findTrendingPost();
  if (!candidate) {
    await sendToAdmin('🤷 Не нашёл подходящих постов. Попробую позже.');
    return;
  }

  // 2. Сохранить в базу
  const post = await addPost(candidate);
  if (!post) {
    // Маловероятно, но на всякий случай (гонка)
    await sendToAdmin('⚠️ Пост уже был в базе. Попробую позже.');
    return;
  }

  // 3. Рерайт через ИИ
  try {
    const rewrittenText = await rewritePost(post.originalTitle, post.originalText);
    await updateRewrite(post.id, rewrittenText);
    post.rewrittenText = rewrittenText;
  } catch (err) {
    logger.error(`Ошибка рерайта: ${err.message}`);
    await sendToAdmin(`❌ Ошибка рерайта: ${err.message}`);
    return;
  }

  // 4. Отправить превью в Telegram
  await sendPreview(post);
}

/**
 * Запустить cron-планировщик.
 */
export function startScheduler() {
  const schedule = config.cron.schedule;

  if (!cron.validate(schedule)) {
    logger.error(`Некорректное cron-выражение: ${schedule}`);
    return;
  }

  scheduledTask = cron.schedule(schedule, async () => {
    logger.info(`⏰ Cron сработал: ${new Date().toISOString()}`);
    try {
      await processPipeline();
    } catch (err) {
      logger.error(`Ошибка пайплайна (cron): ${err.message}`);
    }
  });

  logger.info(`Планировщик запущен: ${schedule}`);
}

/**
 * Обновить расписание cron.
 * @param {string} newSchedule — cron-выражение
 * @returns {boolean} — успешно или нет
 */
export function updateSchedule(newSchedule) {
  if (!cron.validate(newSchedule)) {
    logger.warn(`Некорректное cron-выражение: ${newSchedule}`);
    return false;
  }

  // Остановить текущий таск
  if (scheduledTask) {
    scheduledTask.stop();
  }

  // Обновить конфиг
  config.cron.schedule = newSchedule;

  // Запустить с новым расписанием
  scheduledTask = cron.schedule(newSchedule, async () => {
    logger.info(`⏰ Cron сработал: ${new Date().toISOString()}`);
    try {
      await processPipeline();
    } catch (err) {
      logger.error(`Ошибка пайплайна (cron): ${err.message}`);
    }
  });

  logger.info(`Расписание обновлено: ${newSchedule}`);
  return true;
}

/**
 * Остановить планировщик.
 */
export function stopScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    logger.info('Планировщик остановлен');
  }
}
