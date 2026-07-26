import OpenAI from 'openai';
import config from '../config.js';
import logger from '../utils/logger.js';

const client = new OpenAI({
  apiKey: config.ai.apiKey,
  baseURL: config.ai.baseUrl,
});

/**
 * Переписать пост своими словами на русском языке.
 * @param {string} title — оригинальный заголовок
 * @param {string} text — оригинальный текст (selftext)
 * @returns {Promise<string>} — переписанный текст на русском
 */
export async function rewritePost(title, text) {
  // Формируем контент для рерайта
  let userContent = `Заголовок: ${title}`;
  if (text && text.trim().length > 0) {
    // Обрезаем слишком длинные тексты (экономим токены)
    const trimmedText = text.length > 1500 ? text.slice(0, 1500) + '...' : text;
    userContent += `\n\nТекст: ${trimmedText}`;
  }

  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const completion = await client.chat.completions.create({
        model: config.ai.model,
        messages: [
          { role: 'system', content: config.ai.systemPrompt },
          { role: 'user', content: userContent },
        ],
        max_tokens: config.ai.maxTokens,
        temperature: 0.8,
      });

      const result = completion.choices[0]?.message?.content?.trim();

      if (!result) {
        throw new Error('Пустой ответ от ИИ');
      }

      logger.info(`Рерайт готов (${result.length} символов, попытка ${attempt})`);
      return result;
    } catch (err) {
      lastError = err;
      logger.warn(`Ошибка рерайта (попытка ${attempt}/${maxRetries}): ${err.message}`);

      if (attempt < maxRetries) {
        // Exponential backoff: 2с, 4с, 8с
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Рерайт не удался после ${maxRetries} попыток: ${lastError.message}`);
}
