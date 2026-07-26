import config from '../config.js';
import logger from '../utils/logger.js';
import { findByRedditId } from '../db/store.js';

const REDDIT_BASE = 'https://www.reddit.com';

/**
 * Получить трендовые посты из одного сабреддита.
 * @param {string} subreddit
 * @param {string} sort — hot | top | rising
 * @param {number} limit
 * @returns {Promise<Array>}
 */
async function fetchSubreddit(subreddit, sort = 'hot', limit = 25) {
  const url = `${REDDIT_BASE}/r/${subreddit}/${sort}.json?limit=${limit}&raw_json=1`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': config.reddit.userAgent,
    },
  });

  if (!response.ok) {
    logger.error(`Reddit API ошибка для r/${subreddit}: ${response.status}`);
    return [];
  }

  const data = await response.json();
  return data.data.children.map((child) => child.data);
}

/**
 * Найти один трендовый пост, которого ещё нет в базе.
 * Обходит все сабреддиты из конфига, фильтрует по порогу upvotes и дублям.
 * @returns {Promise<object|null>} — пост-кандидат или null если ничего не нашли
 */
export async function findTrendingPost() {
  const allCandidates = [];

  for (const sub of config.subreddits) {
    try {
      const posts = await fetchSubreddit(sub.name, config.reddit.sort, config.reddit.limit);

      const filtered = posts.filter((post) => {
        // Только посты с достаточным количеством upvotes
        if (post.score < sub.minScore) return false;

        // Не NSFW
        if (post.over_18) return false;

        // Только посты с содержимым (selftext или хотя бы заголовок)
        // Пропускаем чисто медиа-посты без текста
        if (!post.selftext && post.title.length < 20) return false;

        // Не дубли
        if (findByRedditId(post.name)) return false;

        return true;
      });

      for (const post of filtered) {
        allCandidates.push({
          redditId: post.name,
          subreddit: sub.name,
          originalTitle: post.title,
          originalText: post.selftext || '',
          originalUrl: `${REDDIT_BASE}${post.permalink}`,
          score: post.score,
        });
      }

      logger.info(`r/${sub.name}: ${posts.length} постов, ${filtered.length} прошли фильтр`);
    } catch (err) {
      logger.error(`Ошибка при парсинге r/${sub.name}: ${err.message}`);
    }
  }

  if (allCandidates.length === 0) {
    logger.warn('Не найдено подходящих постов ни в одном сабреддите');
    return null;
  }

  // Сортируем по score (убывание) и берём лучший
  allCandidates.sort((a, b) => b.score - a.score);

  logger.info(`Найдено ${allCandidates.length} кандидатов, лучший: ${allCandidates[0].score} upvotes`);
  return allCandidates[0];
}
