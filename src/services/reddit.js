import config from '../config.js';
import logger from '../utils/logger.js';
import { findByRedditId } from '../db/store.js';

/**
 * Парсинг RSS (Atom) фида Reddit.
 * Reddit отдаёт RSS без авторизации.
 * @param {string} subreddit
 * @returns {Promise<Array>}
 */
async function fetchSubredditRSS(subreddit) {
  const url = `https://www.reddit.com/r/${subreddit}/hot.rss?limit=25`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'application/rss+xml, application/xml, text/xml',
    },
  });

  if (!response.ok) {
    logger.error(`Reddit RSS ошибка для r/${subreddit}: ${response.status}`);
    return [];
  }

  const xml = await response.text();
  return parseAtomFeed(xml, subreddit);
}

/**
 * Простой парсинг Atom XML без внешних зависимостей.
 * Извлекает title, link, content из <entry>.
 */
function parseAtomFeed(xml, subreddit) {
  const entries = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];

    const title = extractTag(entry, 'title') || '';
    const link = extractAttr(entry, 'link', 'href') || '';
    const content = extractTag(entry, 'content') || '';
    const id = extractTag(entry, 'id') || '';

    // Извлекаем Reddit post ID из ссылки (t3_xxxxx)
    const idMatch = link.match(/comments\/([a-z0-9]+)\//i);
    const redditId = idMatch ? `t3_${idMatch[1]}` : id;

    // Очищаем HTML из content, извлекаем текст
    const cleanText = content
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Извлекаем score из content если есть
    const scoreMatch = content.match(/(\d+)\s*(?:points?|upvotes?)/i);
    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;

    if (title && redditId) {
      entries.push({
        redditId,
        subreddit,
        title,
        text: cleanText.slice(0, 2000),
        url: link,
        score,
      });
    }
  }

  return entries;
}

/**
 * Извлечь содержимое XML-тега.
 */
function extractTag(xml, tag) {
  // Пробуем CDATA
  const cdataRegex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, 'i');
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();

  // Обычный тег
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * Извлечь атрибут из XML-тега.
 */
function extractAttr(xml, tag, attr) {
  const regex = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, 'i');
  const match = xml.match(regex);
  return match ? match[1] : null;
}

/**
 * Найти один трендовый пост, которого ещё нет в базе.
 * @returns {Promise<object|null>}
 */
export async function findTrendingPost() {
  const allCandidates = [];

  for (const sub of config.subreddits) {
    try {
      const posts = await fetchSubredditRSS(sub.name);

      const filtered = posts.filter((post) => {
        // Проверяем минимальный score (если удалось извлечь)
        // RSS не всегда содержит score, поэтому пропускаем посты с score=0
        // только для крупных сабов
        if (post.score > 0 && post.score < sub.minScore) return false;

        // Нужен хотя бы заголовок
        if (post.title.length < 20) return false;

        // Не дубли
        if (findByRedditId(post.redditId)) return false;

        return true;
      });

      for (const post of filtered) {
        allCandidates.push({
          redditId: post.redditId,
          subreddit: post.subreddit,
          originalTitle: post.title,
          originalText: post.text,
          originalUrl: post.url,
          score: post.score,
        });
      }

      logger.info(`r/${sub.name}: ${posts.length} постов, ${filtered.length} прошли фильтр`);

      // Пауза между запросами (Reddit rate limiting)
      await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      logger.error(`Ошибка при парсинге r/${sub.name}: ${err.message}`);
    }
  }

  if (allCandidates.length === 0) {
    logger.warn('Не найдено подходящих постов ни в одном сабреддите');
    return null;
  }

  // Сортируем по score (убывание), посты без score — в конец
  allCandidates.sort((a, b) => b.score - a.score);

  logger.info(`Найдено ${allCandidates.length} кандидатов`);
  return allCandidates[0];
}
