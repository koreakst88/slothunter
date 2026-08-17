import 'dotenv/config';
import axios, { AxiosInstance } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { createCookieAgent } from 'http-cookie-agent/http';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { CookieJar } from 'tough-cookie';

const CookieHttpsProxyAgent = createCookieAgent(HttpsProxyAgent);
const CookieSocksProxyAgent = createCookieAgent(SocksProxyAgent);
let hasLoggedProxyConfiguration = false;

function getProxyHost(proxyUrl: string): string {
  const parsedUrl = new URL(proxyUrl);
  return `${parsedUrl.hostname}${parsedUrl.port ? `:${parsedUrl.port}` : ''}`;
}

function logProxyConfiguration(proxyUrl: string | undefined): void {
  if (hasLoggedProxyConfiguration) {
    return;
  }

  if (proxyUrl) {
    console.log(`[HTTP] Using proxy: ${getProxyHost(proxyUrl)}`);
  } else {
    console.log('[HTTP] No proxy configured — direct connection');
  }

  hasLoggedProxyConfiguration = true;
}

function createProxyAgent(proxyUrl: string, jar: CookieJar) {
  const protocol = new URL(proxyUrl).protocol;

  if (protocol.startsWith('socks')) {
    return new CookieSocksProxyAgent(proxyUrl, { cookies: { jar } });
  }

  return new CookieHttpsProxyAgent(proxyUrl, { cookies: { jar } });
}

/**
 * Создаёт изолированный HTTP клиент с собственным хранилищем cookies (CookieJar).
 */
export function createHttpClient(): AxiosInstance {
  const jar = new CookieJar();
  const proxyUrl = process.env.PROXY_URL;
  const isMockMode = process.env.MOCK_MODE === 'true';
  const baseURL = isMockMode
    ? (process.env.MOCK_SERVER_URL ?? 'http://localhost:3001')
    : 'https://ais.usvisa-info.com';

  logProxyConfiguration(proxyUrl);

  if (proxyUrl) {
    const agent = createProxyAgent(proxyUrl, jar);

    return axios.create({
      baseURL,
      httpAgent: agent,
      httpsAgent: agent,
      proxy: false,
      maxRedirects: 5,
      validateStatus: (status: number) => status < 500,
      withCredentials: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'
      }
    });
  }

  const client = axios.create({
    baseURL,
    jar,
    maxRedirects: 5,
    validateStatus: (status: number) => status < 500,
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
