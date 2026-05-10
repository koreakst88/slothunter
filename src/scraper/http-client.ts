import 'dotenv/config';
import axios, { AxiosInstance } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

/**
 * Создаёт изолированный HTTP клиент с собственным хранилищем cookies (CookieJar).
 */
export function createHttpClient(): AxiosInstance {
  const jar = new CookieJar();
  const isMockMode = process.env.MOCK_MODE === 'true';
  const baseURL = isMockMode
    ? (process.env.MOCK_SERVER_URL ?? 'http://localhost:3001')
    : 'https://ais.usvisa-info.com';

  const client = axios.create({
    baseURL,
    jar,
    withCredentials: true,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'
    }
  });

  return wrapper(client);
}

/**
 * Ищет и извлекает CSRF-токен из HTML страницы.
 * Ожидает строку вида: <meta name="csrf-token" content="..." />
 */
export function extractCsrfToken(html: string): string | null {
  const match = html.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"\s*\/?>/i);
  return match ? match[1] : null;
}

/**
 * Создаёт искусственную паузу на случайное время (в миллисекундах) 
 * в диапазоне от minMs до maxMs.
 */
export function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, delay));
}
