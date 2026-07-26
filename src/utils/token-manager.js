import config from '../config.js';
import logger from '../utils/logger.js';

/**
 * Обновить long-lived Threads access token.
 * Токен действует 60 дней, обновлять можно после 24 часов с момента получения.
 *
 * @returns {Promise<string>} — новый access token
 */
export async function refreshThreadsToken() {
  const { accessToken } = config.threads;

  logger.info('Обновляю Threads access token...');

  const url = new URL('https://graph.threads.net/refresh_access_token');
  url.searchParams.set('grant_type', 'th_refresh_token');
  url.searchParams.set('access_token', accessToken);

  const response = await fetch(url.toString());

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      `Ошибка обновления токена (${response.status}): ${JSON.stringify(error)}`
    );
  }

  const data = await response.json();

  logger.info(`Threads токен обновлён, истекает через ${Math.round(data.expires_in / 86400)} дней`);
  logger.warn('ВАЖНО: Обновите THREADS_ACCESS_TOKEN в .env файле на новый токен:');
  logger.warn(data.access_token);

  return data.access_token;
}
