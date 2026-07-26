import config from '../config.js';
import logger from '../utils/logger.js';
import { findByRedditId } from '../db/store.js';

/**
 * Парсинг RSS (Atom) фида Reddit для одного или нескольких сабреддитов (multireddit).
 * Пример multireddit: r/technology+programming+ChatGPT/hot.rss
 * @param {string} subPath — 'sub1+sub2' или 'sub1'
 * @param {number} retries
 * @returns {Promise<Array>}
 */
async function fetchMultiredditRSS(subPath, retries = 2) {
  const url = `https://www.reddit.com/r/${subPath}/hot.rss?limit=50`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml',
        },
      });

      if (response.status === 429 && attempt < retries) {
        const waitMs = (attempt + 1) * (config.reddit.delayMs || 4000);
        logger.warn(`Reddit RSS 429 (Rate limit). Повтор через ${waitMs / 1000}сек...`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      if (!response.ok) {
        logger.error(`Reddit RSS ошибка HTTP ${response.status} для ${subPath}`);
        return [];
      }

      const xml = await response.text();
      return parseAtomFeed(xml);
    } catch (err) {
      logger.error(`Ошибка сетевого запроса к Reddit RSS: ${err.message}`);
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  return [];
}

/**
 * Простой парсинг Atom XML без внешних зависимостей.
 * Извлекает title, link, content, subreddit из <entry>.
 */
function parseAtomFeed(xml) {
  const entries = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];

    const title = extractTag(entry, 'title') || '';
    const link = extractAttr(entry, 'link', 'href') || '';
    const content = extractTag(entry, 'content') || '';
    const id = extractTag(entry, 'id') || '';

    // Определяем сабреддит из ссылки: /r/subreddit_name/comments/...
    const subMatch = link.match(/\/r\/([a-zA-Z0-9_]+)\/comments\//i);
    const subreddit = subMatch ? subMatch[1] : 'unknown';

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
 * Объединяет все сабреддиты в один запрос r/sub1+sub2+sub3/hot.rss
 * @returns {Promise<object|null>}
 */
export async function findTrendingPost() {
  const subConfigMap = new Map();
  for (const sub of config.subreddits) {
    subConfigMap.set(sub.name.toLowerCase(), sub.minScore);
  }

  const subNamesJoined = config.subreddits.map((s) => s.name).join('+');
  logger.info(`Запрашиваю посты из сабреддитов [${subNamesJoined}] в 1 запрос...`);

  const posts = await fetchMultiredditRSS(subNamesJoined);

  if (posts.length === 0) {
    logger.warn('Не получено постов от Reddit RSS');
    return null;
  }

  const allCandidates = [];

  for (const post of posts) {
    const minScore = subConfigMap.get(post.subreddit.toLowerCase()) ?? 500;

    // Проверяем минимальный score (если удалось извлечь)
    if (post.score > 0 && post.score < minScore) continue;

    // Нужен хотя бы заголовок от 20 символов
    if (post.title.length < 20) continue;

    // Не дубли
    if (findByRedditId(post.redditId)) continue;

    allCandidates.push({
      redditId: post.redditId,
      subreddit: post.subreddit,
      originalTitle: post.title,
      originalText: post.text,
      originalUrl: post.url,
      score: post.score,
    });
  }

  if (allCandidates.length === 0) {
    logger.warn('Все полученные посты являются дублями или не прошли по порогу upvotes');
    return null;
  }

  // Сортируем по score (убывание)
  allCandidates.sort((a, b) => b.score - a.score);

  logger.info(`Найдено ${allCandidates.length} кандидатов, лучший из r/${allCandidates[0].subreddit}`);
  return allCandidates[0];
}
