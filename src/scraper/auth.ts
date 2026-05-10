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

  const initialCsrf = extractCsrfToken(getResponse.data);
  if (!initialCsrf) {
    throw new Error('CSRF token not found on login page');
  }

  // Антибан задержка
  await randomDelay(1000, 3000);

  // Шаг 2 — POST логин
  const loginData = new URLSearchParams();
  loginData.append('user[email]', email);
  loginData.append('user[password]', password);
  loginData.append('policy_confirmed', '1');
  loginData.append('commit', 'Войти');

  const postResponse = await client.post('/ru-kz/niv/users/sign_in', loginData.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-CSRF-Token': initialCsrf,
      'Referer': `${baseUrl}/ru-kz/niv/users/sign_in`
    },
    // Разрешаем и 200, и 302 статусы
    validateStatus: (status: number) => status === 200 || status === 302
  });

  // Шаг 3 — Проверка успешности
  if (postResponse.status !== 200 && postResponse.status !== 302) {
    throw new Error('Login failed');
  }

  let finalCsrf = initialCsrf;
  if (typeof postResponse.data === 'string') {
    const freshCsrf = extractCsrfToken(postResponse.data);
    if (freshCsrf) {
      finalCsrf = freshCsrf;
    }
  }

  console.log('[AUTH] Login successful, CSRF token obtained');

  return finalCsrf;
}
