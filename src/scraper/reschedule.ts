import 'dotenv/config';
import { AxiosInstance } from 'axios';
import { getAvailableTimes } from './slots';
import { randomDelay } from './http-client';

export interface RescheduleResult {
  success: boolean;
  date: string;
  time: string;
  error?: string;
}

function getBaseUrl(): string {
  const isMockMode = process.env.MOCK_MODE === 'true';
  return isMockMode
    ? (process.env.MOCK_SERVER_URL ?? 'http://localhost:3001')
    : 'https://ais.usvisa-info.com';
}

export async function rescheduleAppointment(
  client: AxiosInstance,
  scheduleId: string,
  applicantIds: string[],
  date: string,
  csrfToken: string
): Promise<RescheduleResult> {
  console.log(`[RESCHEDULE] Attempting reschedule for schedule ${scheduleId}`);

  try {
    // Шаг 1 — получить доступные времена
    const timesResult = await getAvailableTimes(client, scheduleId, date, csrfToken);
    
    if (timesResult.available_times.length === 0) {
      const error = 'No times available';
      console.error(`[RESCHEDULE] Failed: ${error}`);
      return { success: false, date, time: '', error };
    }

    const time = timesResult.available_times[0];
    console.log(`[RESCHEDULE] Selected date: ${date}, time: ${time}`);

    // Шаг 2 — антибан задержка
    await randomDelay(2000, 4000);

    // Шаг 3 — выполнить POST перенос
    const baseUrl = getBaseUrl();
    const payload = new URLSearchParams();
    
    payload.append('authenticity_token', csrfToken);
    payload.append('confirmed_limit_message', '1');
    payload.append('use_consulate_appointment_capacity', 'true');
    payload.append('appointments[consulate_appointment][facility_id]', '134');
    payload.append('appointments[consulate_appointment][date]', date);
    payload.append('appointments[consulate_appointment][time]', time);
    
    for (const id of applicantIds) {
      payload.append('applicants[]', id);
    }

    const response = await client.post(`/ru-kz/niv/schedule/${scheduleId}/appointment`, payload.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-CSRF-Token': csrfToken,
        'Referer': `${baseUrl}/ru-kz/niv/schedule/${scheduleId}/appointment`
      },
      // Чтобы Axios не кидал ошибку на редирект
      validateStatus: (status: number) => status === 200 || status === 302
    });

    // Шаг 4 — Проверка ответа
    if (response.status === 200 || response.status === 302) {
      console.log(`[RESCHEDULE] Success: rescheduled to ${date} ${time}`);
      return { success: true, date, time };
    } else {
      const error = `Unexpected status: ${response.status}`;
      console.error(`[RESCHEDULE] Failed: ${error}`);
      return { success: false, date, time, error };
    }
  } catch (error: unknown) {
    // Шаг 5
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[RESCHEDULE] Failed: ${errorMessage}`);
    return { success: false, date, time: '', error: errorMessage };
  }
}
