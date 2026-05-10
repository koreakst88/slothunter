import 'dotenv/config';
import { getActiveClients, updateClientStatus, addLog, updateClientAfterReschedule } from '../db/supabase';
import { createHttpClient, randomDelay } from '../scraper/http-client';
import { login } from '../scraper/auth';
import { checkClient } from '../monitor/checker';
import { rescheduleAppointment } from '../scraper/reschedule';
import { sendSuccessAlert, sendNotifyAlert } from '../bot/notifications';

export async function runMonitoringCycle(): Promise<void> {
  // Шаг 1
  const clients = await getActiveClients();
  
  if (clients.length === 0) {
    console.log('[SCHEDULER] No active clients, skipping cycle');
    return;
  }

  let processedCount = 0;

  // Шаг 2
  for (const client of clients) {
    console.log(`[SCHEDULER] Processing client: ${client.name} (${client.id})`);
    
    const httpClient = createHttpClient();

    let csrfToken: string;
    try {
      csrfToken = await login(httpClient, client.email, client.password_encrypted);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await addLog(client.id, 'error', `Login failed: ${errorMessage}`);
      await updateClientStatus(client.id, 'error');
      continue;
    }

    const checkResult = await checkClient(client, csrfToken, httpClient);

    // Шаг 2.5 — Обработать результат
    if (checkResult.action === 'skip') {
      await addLog(client.id, 'check', checkResult.reason);
      console.log(`[SCHEDULER] ${client.name}: skip — ${checkResult.reason}`);
    } else if (checkResult.action === 'notify') {
      const dateFound = checkResult.date_found ?? 'unknown_date';
      await addLog(client.id, 'notify', checkResult.reason, dateFound);
      console.log(`[SCHEDULER] ${client.name}: notify — ${dateFound}`);
      await sendNotifyAlert(client, dateFound);
    } else if (checkResult.action === 'reschedule') {
      const dateFound = checkResult.date_found ?? 'unknown_date';
      const rescheduleResult = await rescheduleAppointment(
        httpClient, 
        client.schedule_id, 
        client.applicant_ids, 
        dateFound, 
        csrfToken
      );
      
      if (rescheduleResult.success) {
        await updateClientAfterReschedule(client.id, rescheduleResult.date, client.attempts_left);
        await addLog(client.id, 'reschedule', 'success', dateFound, rescheduleResult.date);
        await sendSuccessAlert(client, rescheduleResult);
        console.log(`[SCHEDULER] ${client.name}: rescheduled to ${rescheduleResult.date}`);
      } else {
        const errorReason = rescheduleResult.error ?? 'Unknown error';
        await addLog(client.id, 'error', errorReason);
        console.log(`[SCHEDULER] ${client.name}: reschedule failed — ${errorReason}`);
      }
    } else if (checkResult.action === 'error') {
      await addLog(client.id, 'error', checkResult.reason);
      console.log(`[SCHEDULER] ${client.name}: error — ${checkResult.reason}`);
    }

    processedCount++;
    
    // Шаг 2.6 — randomDelay между клиентами
    await randomDelay(10000, 15000);
  }

  // Шаг 3
  console.log(`[SCHEDULER] Cycle complete. Processed ${processedCount} clients.`);
}
