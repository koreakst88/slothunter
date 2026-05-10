import 'dotenv/config';
import { AxiosInstance } from 'axios';
import { getAvailableDates, getAvailableTimes } from '../scraper/slots';
import { sendSlotSkippedAlert } from '../bot/notifications';

export interface Client {
  id: string;
  name: string;
  email: string;
  password_encrypted: string;
  schedule_id: string;
  applicant_ids: string[];
  current_date: string; // YYYY-MM-DD
  status: string;
  attempts_left: number;
}

export interface CheckResult {
  action: 'reschedule' | 'notify' | 'skip' | 'error';
  date_found?: string;
  reason: string;
}

export function isDateSuitable(
  foundDateStr: string,
  currentDateStr: string,
  minBufferMonths: number
): boolean {
  const foundDate = new Date(foundDateStr);
  const currentDate = new Date(currentDateStr);
  
  const bufferDate = new Date();
  bufferDate.setMonth(bufferDate.getMonth() + minBufferMonths);
  
  // Обнуляем время для корректного сравнения по дням
  bufferDate.setHours(0, 0, 0, 0);
  foundDate.setHours(0, 0, 0, 0);
  currentDate.setHours(0, 0, 0, 0);

  const isEarlierThanCurrent = foundDate < currentDate;
  const isLaterThanBuffer = foundDate > bufferDate;
  const isSuitable = isEarlierThanCurrent && isLaterThanBuffer;

  console.log(`[CHECKER] isDateSuitable: found=${foundDateStr}, current=${currentDateStr}, buffer=${bufferDate.toISOString().split('T')[0]}, result=${isSuitable}`);

  return isSuitable;
}

export async function checkClient(
  client: Client,
  csrfToken: string,
  axiosClient: AxiosInstance
): Promise<CheckResult> {
  console.log(`[CHECKER] Checking client: ${client.name}`);

  try {
    // Шаг 1 — получить доступные даты
    const dates = await getAvailableDates(axiosClient, client.schedule_id, client.applicant_ids, csrfToken);
    
    if (dates.length === 0) {
      const reason = 'No dates available';
      console.log(`[CHECKER] Action: skip - ${reason}`);
      return { action: 'skip', reason };
    }

    // Шаг 2 — отфильтровать только business_day === true
    const businessDates = dates.filter(d => d.business_day === true);

    // Шаг 3 — найти первую подходящую дату
    const minBufferMonthsStr = process.env.MIN_DATE_BUFFER_MONTHS ?? '2';
    const minBufferMonths = parseInt(minBufferMonthsStr, 10);
    
    let suitableDateStr: string | null = null;
    for (const d of businessDates) {
      if (isDateSuitable(d.date, client.current_date, minBufferMonths)) {
        suitableDateStr = d.date;
        break;
      } else {
        const reason = 'Дата ближе чем 2 месяца от сегодня';
        await sendSlotSkippedAlert(client, d.date, reason);
      }
    }

    if (!suitableDateStr) {
      const reason = 'No suitable dates found';
      console.log(`[CHECKER] Action: skip - ${reason}`);
      return { action: 'skip', reason };
    }

    console.log(`[CHECKER] Found suitable date: ${suitableDateStr}`);

    // Шаг 4 — получить доступное время для этой даты
    const times = await getAvailableTimes(axiosClient, client.schedule_id, suitableDateStr, csrfToken);
    
    if (times.available_times.length === 0) {
      const reason = `No times available for date ${suitableDateStr}`;
      console.log(`[CHECKER] Action: skip - ${reason}`);
      return { action: 'skip', reason };
    }

    // Шаг 5 — проверить attempts_left
    if (client.attempts_left <= 1) {
      const reason = 'Last attempt warning';
      console.log(`[CHECKER] Action: notify - ${reason}`);
      return { action: 'notify', date_found: suitableDateStr, reason };
    } else {
      const reason = 'Date found, rescheduling';
      console.log(`[CHECKER] Action: reschedule - ${reason}`);
      return { action: 'reschedule', date_found: suitableDateStr, reason };
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const reason = `Error during check: ${errorMessage}`;
    console.error(`[CHECKER] Action: error - ${reason}`);
    return { action: 'error', reason };
  }
}
