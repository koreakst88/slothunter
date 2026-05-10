import { AxiosInstance } from 'axios';
import { extractCsrfToken, randomDelay } from './http-client';

export async function login(
  client: AxiosInstance,
  email: string,
  password: string
): Promise<string> {
  console.log(`[AUTH] Logging in: ${email}`);

  // Шаг 1 — GET на главную страницу логина
  const baseUrl = client.defaults.baseURL || 'https://ais.usvisa-info.com';
  const loginUrl = `${baseUrl}/ru-kz/niv/users/sign_in`;
  console.log('[AUTH] Full login URL:', loginUrl);

  const getResponse = await client.get(loginUrl);
  console.log('[AUTH] GET response status:', getResponse.status);
  console.log('[AUTH] GET response URL:', getResponse.request?.res?.responseUrl || 'unknown');
  
  if (typeof getResponse.data !== 'string') {
    throw new Error('Unexpected response format from login page');
  }

  const csrfToken = extractCsrfToken(getResponse.data);
  if (!csrfToken) {
    throw new Error('CSRF token not found on login page');
  }

  // Антибан задержка
  await randomDelay(1000, 3000);

  // Шаг 2 — POST логин
  const params = new URLSearchParams();
  params.append('user[email]', email);
  params.append('user[password]', password);
  params.append('policy_confirmed', '1');
  params.append('commit', 'Войти');

  const postUrl = `${baseUrl}/ru-kz/niv/users/sign_in`;
  console.log('[AUTH] POST URL:', postUrl);
  console.log('[AUTH] CSRF token used:', csrfToken.substring(0, 20));

  const postResponse = await client.post(postUrl, params.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRF-Token': csrfToken,
      'Referer': 'https://ais.usvisa-info.com/ru-kz/niv/users/sign_in',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
      'Origin': 'https://ais.usvisa-info.com',
      'X-Requested-With': 'XMLHttpRequest'
    },
    validateStatus: (status: number) => status < 500
  });

  const postResponseUrl = postResponse.request?.res?.responseUrl || 'unknown';
  console.log('[AUTH] POST response status:', postResponse.status);
  console.log('[AUTH] POST response URL:', postResponseUrl);

  // Шаг 3 — Проверка успешности
  const isSuccessfulStatus = [200, 201, 302].includes(postResponse.status);
  const redirectedAwayFromSignIn = postResponseUrl !== 'unknown' && !postResponseUrl.includes('sign_in');
  if (!isSuccessfulStatus && !redirectedAwayFromSignIn) {
    throw new Error('Login failed');
  }

  let finalCsrf = csrfToken;
  if (typeof postResponse.data === 'string') {
    const freshCsrf = extractCsrfToken(postResponse.data);
    if (freshCsrf) {
      finalCsrf = freshCsrf;
    }
  }

  console.log('[AUTH] Login successful, CSRF token obtained');

  return finalCsrf;
}
