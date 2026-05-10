import { Markup } from 'telegraf';
import { Client } from '../monitor/checker';
import { RescheduleResult } from '../scraper/reschedule';
import { bot } from './index';

export async function sendSuccessAlert(client: Client, result: RescheduleResult): Promise<void> {
  const chatId = process.env.TELEGRAM_AGENT_CHAT_ID;
  if (!chatId) {
    console.error('[NOTIFY] TELEGRAM_AGENT_CHAT_ID is not set');
    return;
  }

  const message = `✅ Перенос выполнен!\n\n` +
    `👤 Клиент: ${client.name}\n` +
    `📧 ${client.email}\n\n` +
    `📅 Было: ${client.current_date}\n` +
    `🎯 Стало: ${result.date} в ${result.time || 'неизвестно'}\n\n` +
    `🔄 Осталось попыток: ${client.attempts_left - 1}/3`;

  try {
    await bot.telegram.sendMessage(chatId, message);
  } catch (error) {
    console.error('[NOTIFY] Error sending success alert:', error);
  }
}

export async function sendNotifyAlert(client: Client, dateFound: string): Promise<void> {
  const chatId = process.env.TELEGRAM_AGENT_CHAT_ID;
  if (!chatId) {
    console.error('[NOTIFY] TELEGRAM_AGENT_CHAT_ID is not set');
    return;
  }

  const message = `⚠️ Найдена дата — последняя попытка!\n\n` +
    `👤 Клиент: ${client.name}\n` +
    `📧 ${client.email}\n` +
    `📅 Текущая запись: ${client.current_date}\n` +
    `🎯 Найдена дата: ${dateFound}\n\n` +
    `⚡️ Осталась 1 попытка переноса.\n` +
    `Подтвердите действие:`;

  const keyboard = Markup.inlineKeyboard([
    Markup.button.callback('✅ Перенести', `confirm_reschedule_${client.id}_${dateFound}`),
    Markup.button.callback('❌ Пропустить', `skip_reschedule_${client.id}`)
  ]);

  try {
    await bot.telegram.sendMessage(chatId, message, keyboard);
  } catch (error) {
    console.error('[NOTIFY] Error sending notify alert:', error);
  }
}
