import { Bot, InlineKeyboard } from 'grammy';
import config from '../config.js';
import logger from '../utils/logger.js';
import { findById, updateRewrite, updateStatus, getStats } from '../db/store.js';
import { rewritePost } from './ai-rewriter.js';
import { publishToThreads } from './threads.js';
import { processPipeline } from './scheduler.js';

const bot = new Bot(config.telegram.token);
const adminChatId = config.telegram.adminChatId;

// ─── Команды ────────────────────────────────────────────────

bot.command('start', async (ctx) => {
  if (String(ctx.chat.id) !== adminChatId) return;

  await ctx.reply(
    '👋 Привет! Я бот для автопостинга в Threads.\n\n' +
      'Доступные команды:\n' +
      '/force — найти новый пост прямо сейчас\n' +
      '/status — статистика постов\n' +
      '/setcron <выражение> — изменить расписание\n\n' +
      'Я автоматически ищу трендовые посты по расписанию и отправляю вам на модерацию.'
  );
});

bot.command('status', async (ctx) => {
  if (String(ctx.chat.id) !== adminChatId) return;

  const stats = getStats();
  await ctx.reply(
    '📊 Статистика:\n\n' +
      `📝 Всего постов: ${stats.total}\n` +
      `⏳ В ожидании: ${stats.pending + stats.rewritten}\n` +
      `✅ Опубликовано: ${stats.published}\n` +
      `❌ Отклонено: ${stats.rejected}\n\n` +
      `⏰ Расписание: ${config.cron.schedule}`
  );
});

bot.command('force', async (ctx) => {
  if (String(ctx.chat.id) !== adminChatId) return;

  await ctx.reply('🔍 Ищу трендовый пост...');

  try {
    await processPipeline();
  } catch (err) {
    logger.error(`Ошибка /force: ${err.message}`);
    await ctx.reply(`❌ Ошибка: ${err.message}`);
  }
});

bot.command('setcron', async (ctx) => {
  if (String(ctx.chat.id) !== adminChatId) return;

  const newSchedule = ctx.match?.trim();
  if (!newSchedule) {
    await ctx.reply(
      '⚙️ Использование: /setcron <cron выражение>\n\n' +
        'Примеры:\n' +
        '`0 */3 * * *` — каждые 3 часа\n' +
        '`0 */4 * * *` — каждые 4 часа\n' +
        '`0 9,15,21 * * *` — в 9:00, 15:00, 21:00\n\n' +
        `Текущее: \`${config.cron.schedule}\``,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Импортируем и обновляем расписание динамически
  const { updateSchedule } = await import('./scheduler.js');
  const success = updateSchedule(newSchedule);

  if (success) {
    await ctx.reply(`✅ Расписание обновлено: \`${newSchedule}\``, { parse_mode: 'Markdown' });
  } else {
    await ctx.reply('❌ Некорректное cron-выражение. Попробуйте снова.');
  }
});

// ─── Callback кнопки ────────────────────────────────────────

bot.callbackQuery(/^approve:(.+)$/, async (ctx) => {
  const postId = ctx.match[1];
  const post = findById(postId);

  if (!post) {
    await ctx.answerCallbackQuery({ text: '❌ Пост не найден' });
    return;
  }

  await ctx.answerCallbackQuery({ text: '⏳ Публикую в Threads...' });

  try {
    const threadsPostId = await publishToThreads(post.rewrittenText);

    await updateStatus(postId, 'published', {
      threadsPostId,
      publishedAt: new Date().toISOString(),
    });

    await ctx.editMessageText(
      ctx.callbackQuery.message.text + '\n\n✅ ОПУБЛИКОВАНО В THREADS',
      { reply_markup: undefined }
    );

    logger.info(`Пост ${postId} опубликован в Threads: ${threadsPostId}`);
  } catch (err) {
    logger.error(`Ошибка публикации: ${err.message}`);
    await ctx.editMessageText(
      ctx.callbackQuery.message.text + `\n\n❌ ОШИБКА: ${err.message}`,
      { reply_markup: undefined }
    );
  }
});

bot.callbackQuery(/^reject:(.+)$/, async (ctx) => {
  const postId = ctx.match[1];
  const post = findById(postId);

  if (!post) {
    await ctx.answerCallbackQuery({ text: '❌ Пост не найден' });
    return;
  }

  await updateStatus(postId, 'rejected');
  await ctx.answerCallbackQuery({ text: '❌ Отклонено' });

  await ctx.editMessageText(
    ctx.callbackQuery.message.text + '\n\n❌ ОТКЛОНЕНО',
    { reply_markup: undefined }
  );

  // Ищем следующий пост
  await ctx.reply('🔍 Ищу следующий пост...');
  try {
    await processPipeline();
  } catch (err) {
    logger.error(`Ошибка поиска после отклонения: ${err.message}`);
    await sendToAdmin('❌ Не удалось найти следующий пост: ' + err.message);
  }
});

bot.callbackQuery(/^regen:(.+)$/, async (ctx) => {
  const postId = ctx.match[1];
  const post = findById(postId);

  if (!post) {
    await ctx.answerCallbackQuery({ text: '❌ Пост не найден' });
    return;
  }

  await ctx.answerCallbackQuery({ text: '✏️ Перегенерирую...' });

  try {
    const newText = await rewritePost(post.originalTitle, post.originalText);
    await updateRewrite(postId, newText);

    // Обновляем сообщение с новым текстом
    const keyboard = new InlineKeyboard()
      .text('✅ Подтвердить', `approve:${postId}`)
      .text('❌ Отменить', `reject:${postId}`)
      .row()
      .text('✏️ Перегенерировать', `regen:${postId}`);

    const messageText = formatPreview(post.subreddit, post.originalTitle, post.originalText, post.originalUrl, post.score, newText);

    await ctx.editMessageText(messageText, {
      reply_markup: keyboard,
      parse_mode: 'HTML',
    });
  } catch (err) {
    logger.error(`Ошибка перегенерации: ${err.message}`);
    await sendToAdmin(`❌ Ошибка перегенерации: ${err.message}`);
  }
});

// ─── Вспомогательные функции ────────────────────────────────

/**
 * Форматировать превью поста для Telegram.
 */
function formatPreview(subreddit, title, originalText, url, score, rewrittenText) {
  // Обрезаем оригинальный текст если слишком длинный
  let trimmedOriginal = originalText || '';
  if (trimmedOriginal.length > 300) {
    trimmedOriginal = trimmedOriginal.slice(0, 300) + '...';
  }

  let msg = `📝 <b>Новый пост для Threads</b>\n\n`;
  msg += `📰 <b>Оригинал (Reddit):</b>\n`;
  msg += `<b>${escapeHtml(title)}</b>\n`;
  if (trimmedOriginal) {
    msg += `${escapeHtml(trimmedOriginal)}\n`;
  }
  msg += `🔗 <a href="${url}">Ссылка на Reddit</a>\n`;
  msg += `⬆️ ${score} upvotes | r/${subreddit}\n\n`;
  msg += `✍️ <b>Переписанный текст:</b>\n`;
  msg += `${escapeHtml(rewrittenText)}`;

  return msg;
}

/**
 * Экранирование HTML для Telegram.
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Отправить превью поста админу с кнопками модерации.
 * @param {object} post — объект поста из БД
 */
export async function sendPreview(post) {
  const keyboard = new InlineKeyboard()
    .text('✅ Подтвердить', `approve:${post.id}`)
    .text('❌ Отменить', `reject:${post.id}`)
    .row()
    .text('✏️ Перегенерировать', `regen:${post.id}`);

  const messageText = formatPreview(
    post.subreddit,
    post.originalTitle,
    post.originalText,
    post.originalUrl,
    post.score,
    post.rewrittenText
  );

  await bot.api.sendMessage(adminChatId, messageText, {
    reply_markup: keyboard,
    parse_mode: 'HTML',
  });

  logger.info(`Превью отправлено в Telegram для поста ${post.id}`);
}

/**
 * Отправить текстовое сообщение админу.
 */
export async function sendToAdmin(text) {
  await bot.api.sendMessage(adminChatId, text);
}

/**
 * Запустить Telegram бота (long polling).
 */
export function startBot() {
  bot.catch((err) => {
    logger.error(`Telegram bot ошибка: ${err.message}`);
  });

  bot.start({
    onStart: () => {
      logger.info('Telegram бот запущен');
    },
  });
}

/**
 * Остановить бота.
 */
export function stopBot() {
  bot.stop();
}

export default bot;
