import { JSONFilePreset } from 'lowdb/node';
import { randomUUID } from 'node:crypto';
import config from '../config.js';
import logger from '../utils/logger.js';

/** @type {import('lowdb').Low<{ posts: Array }>} */
let db;

/**
 * Инициализация базы данных.
 * Создаёт файл data/posts.json если не существует.
 */
export async function initStore() {
  db = await JSONFilePreset(config.paths.db, { posts: [] });
  logger.info(`База данных загружена: ${db.data.posts.length} постов`);
}

/**
 * Получить экземпляр БД (для прямого доступа если нужно).
 */
export function getDb() {
  return db;
}

/**
 * Найти пост по Reddit ID.
 * @param {string} redditId — ID поста на Reddit (например "t3_1abc")
 * @returns {object|undefined}
 */
export function findByRedditId(redditId) {
  return db.data.posts.find((p) => p.redditId === redditId);
}

/**
 * Найти пост по внутреннему ID.
 * @param {string} id
 * @returns {object|undefined}
 */
export function findById(id) {
  return db.data.posts.find((p) => p.id === id);
}

/**
 * Добавить новый пост в базу.
 * Возвращает null если дубль (redditId уже есть).
 * @param {object} postData
 * @returns {Promise<object|null>}
 */
export async function addPost(postData) {
  // Проверка на дубли
  if (findByRedditId(postData.redditId)) {
    logger.warn(`Дубль: ${postData.redditId} уже в базе`);
    return null;
  }

  const post = {
    id: randomUUID(),
    redditId: postData.redditId,
    subreddit: postData.subreddit,
    originalTitle: postData.originalTitle,
    originalText: postData.originalText || '',
    originalUrl: postData.originalUrl,
    rewrittenText: '',
    score: postData.score,
    status: 'pending', // pending | rewritten | approved | rejected | published
    threadsPostId: null,
    createdAt: new Date().toISOString(),
    publishedAt: null,
  };

  db.data.posts.push(post);
  await db.write();
  logger.info(`Добавлен пост: ${post.id} (r/${post.subreddit})`);
  return post;
}

/**
 * Обновить переписанный текст поста.
 * @param {string} id
 * @param {string} rewrittenText
 */
export async function updateRewrite(id, rewrittenText) {
  const post = findById(id);
  if (!post) return null;

  post.rewrittenText = rewrittenText;
  post.status = 'rewritten';
  await db.write();
  return post;
}

/**
 * Обновить статус поста.
 * @param {string} id
 * @param {string} status
 * @param {object} [extra] — дополнительные поля (threadsPostId, publishedAt)
 */
export async function updateStatus(id, status, extra = {}) {
  const post = findById(id);
  if (!post) return null;

  post.status = status;
  Object.assign(post, extra);
  await db.write();
  logger.info(`Пост ${id}: статус → ${status}`);
  return post;
}

/**
 * Получить статистику по постам.
 */
export function getStats() {
  const posts = db.data.posts;
  return {
    total: posts.length,
    pending: posts.filter((p) => p.status === 'pending').length,
    rewritten: posts.filter((p) => p.status === 'rewritten').length,
    published: posts.filter((p) => p.status === 'published').length,
    rejected: posts.filter((p) => p.status === 'rejected').length,
  };
}
