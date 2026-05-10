import 'dotenv/config';
import { AxiosInstance } from 'axios';
import { randomDelay } from './http-client';

export interface AvailableDate {
  date: string;
  business_day: boolean;
}

export interface AvailableTimes {
  available_times: string[];
  business_times: string[];
}

function getBaseUrl(): string {
  const isMockMode = process.env.MOCK_MODE === 'true';
  return isMockMode
    ? (process.env.MOCK_SERVER_URL ?? 'http://localhost:3001')
    : 'https://ais.usvisa-info.com';
}

export async function getAvailableDates(
  client: AxiosInstance,
  scheduleId: string,
  applicantIds: string[],
  csrfToken: string
): Promise<AvailableDate[]> {
  const baseUrl = getBaseUrl();

  try {
    // 1. Запрос адреса посольства (обязательно перед запросом дат)
    await client.get(`/ru-kz/niv/schedule/${scheduleId}/appointment/address/134`, {
      headers: {
        'X-CSRF-Token': csrfToken,
        'Referer': `${baseUrl}/ru-kz/niv/schedule/${scheduleId}/appointment`
      }
    });

    // 2. Антибан задержка
    await randomDelay(1000, 2000);

    // Динамическое формирование Referer на основе applicantIds
    const queryApplicants = applicantIds.map(id => `applicants[]=${encodeURIComponent(id)}`).join('&');
    const refererParams = queryApplicants ? `?${queryApplicants}` : '';

    // 3. Запрос доступных дат
    const daysResponse = await client.get(`/ru-kz/niv/schedule/${scheduleId}/appointment/days/134.json`, {
      params: {
        'appointments[expedite]': 'false'
      },
      headers: {
        'X-CSRF-Token': csrfToken,
        'Referer': `${baseUrl}/ru-kz/niv/schedule/${scheduleId}/appointment${refererParams}`,
        'Accept': 'application/json, text/javascript'
      }
    });

    const dates = daysResponse.data;
    
    // Проверка, что сервер вернул именно массив
    if (!Array.isArray(dates)) {
      console.log(`[SLOTS] Found 0 dates for schedule ${scheduleId}`);
      return [];
    }

    console.log(`[SLOTS] Found ${dates.length} dates for schedule ${scheduleId}`);
    return dates as AvailableDate[];
  } catch (error: unknown) {
    console.error(`[SLOTS] Error getting dates for schedule ${scheduleId}`);
    return [];
  }
}

export async function getAvailableTimes(
  client: AxiosInstance,
  scheduleId: string,
  date: string,
  csrfToken: string
): Promise<AvailableTimes> {
  try {
    // Запрос доступного времени
    const timesResponse = await client.get(`/ru-kz/niv/schedule/${scheduleId}/appointment/times/134.json`, {
      params: {
        date: date,
        'appointments[expedite]': 'false'
      },
      headers: {
        'X-CSRF-Token': csrfToken,
        'Accept': 'application/json, text/javascript'
      }
    });

    const data = timesResponse.data as Partial<AvailableTimes>;
    const result: AvailableTimes = {
      available_times: Array.isArray(data.available_times) ? data.available_times : [],
      business_times: Array.isArray(data.business_times) ? data.business_times : []
    };

    console.log(`[SLOTS] Found ${result.available_times.length} times for date ${date}`);
    return result;
  } catch (error: unknown) {
    console.error(`[SLOTS] Error getting times for date ${date}`);
    return { available_times: [], business_times: [] };
  }
}
