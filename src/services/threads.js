import config from '../config.js';
import logger from '../utils/logger.js';

const API_BASE = config.threads.apiBase;

/**
 * Опубликовать текстовый пост в Threads.
 * Двухшаговый процесс: создать контейнер → опубликовать.
 *
 * @param {string} text — текст поста (на русском)
 * @returns {Promise<string>} — ID опубликованного поста
 */
export async function publishToThreads(text) {
  const { userId, accessToken } = config.threads;

  // Шаг 1: Создание media container
  logger.info('Threads: создаю контейнер...');

  const createResponse = await fetch(`${API_BASE}/${userId}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_type: 'TEXT',
      text: text,
      access_token: accessToken,
    }),
  });

  if (!createResponse.ok) {
    const error = await createResponse.json().catch(() => ({}));
    throw new Error(
      `Threads: ошибка создания контейнера (${createResponse.status}): ${JSON.stringify(error)}`
    );
  }

  const { id: creationId } = await createResponse.json();
  logger.info(`Threads: контейнер создан — ${creationId}`);

  // Небольшая пауза перед публикацией (рекомендация Meta)
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Шаг 2: Публикация контейнера
  logger.info('Threads: публикую...');

  const publishResponse = await fetch(`${API_BASE}/${userId}/threads_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: creationId,
      access_token: accessToken,
    }),
  });

  if (!publishResponse.ok) {
    const error = await publishResponse.json().catch(() => ({}));
    throw new Error(
      `Threads: ошибка публикации (${publishResponse.status}): ${JSON.stringify(error)}`
    );
  }

  const { id: postId } = await publishResponse.json();
  logger.info(`Threads: пост опубликован — ${postId}`);
  return postId;
}
