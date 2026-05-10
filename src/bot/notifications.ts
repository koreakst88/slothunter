import { Markup } from 'telegraf';
import type { Client } from '../monitor/checker';
import type { RescheduleResult } from '../scraper/reschedule';
import { bot } from './index';

function getAllowedChatIds(): string[] {
  return process.env.ALLOWED_CHAT_IDS
    ?.split(',')
    .map(id => id.trim())
    .filter(Boolean) || [];
}

async function sendMessageToAllowedChats(message: string): Promise<void> {
  const allowedIds = getAllowedChatIds();
  if (allowedIds.length === 0) {
    console.error('[NOTIFY] ALLOWED_CHAT_IDS is not set');
    return;
  }

  for (const chatId of allowedIds) {
    try {
      await bot.telegram.sendMessage(chatId, message);
    } catch (error) {
      console.error(`[NOTIFY] Error sending message to ${chatId}:`, error);
    }
  }
}

export async function sendSuccessAlert(client: Client, result: RescheduleResult): Promise<void> {
  const allowedIds = getAllowedChatIds();
  if (allowedIds.length === 0) {
    console.error('[NOTIFY] ALLOWED_CHAT_IDS is not set');
    return;
  }

  const message = `✅ Перенос выполнен!\n\n` +
    `👤 Клиент: ${client.name}\n` +
    `📧 ${client.email}\n\n` +
    `📅 Было: ${client.current_date}\n` +
    `🎯 Стало: ${result.date} в ${result.time || 'неизвестно'}\n\n` +
    `🔄 Осталось попыток: ${client.attempts_left - 1}/3`;

  for (const chatId of allowedIds) {
    try {
      await bot.telegram.sendMessage(chatId, message);
    } catch (error) {
      console.error(`[NOTIFY] Error sending success alert to ${chatId}:`, error);
    }
  }
}

export async function sendSlotFoundAlert(client: Client, foundDate: string): Promise<void> {
  const message = `🔍 Найден слот для ${client.name}\n` +
    `📅 Дата: ${foundDate}\n` +
    `⏱ Попытка переноса через 30 секунд...`;

  await sendMessageToAllowedChats(message);
}

export async function sendRescheduleErrorAlert(
  client: Client,
  foundDate: string,
  errorMsg: string,
  attemptsLeft: number
): Promise<void> {
  const message = `❌ Ошибка переноса для ${client.name}\n` +
    `📅 Дата: ${foundDate}\n` +
    `⚠️ Причина: ${errorMsg}\n` +
    `🎯 Попыток осталось: ${attemptsLeft}/3`;

  await sendMessageToAllowedChats(message);
}

export async function sendSlotSkippedAlert(
  client: Client,
  foundDate: string,
  reason: string
): Promise<void> {
  const message = `⚠️ Найдена дата для ${client.name}\n` +
    `📅 ${foundDate}\n` +
    `ℹ️ Не подходит: ${reason}`;

  await sendMessageToAllowedChats(message);
}

export async function sendNotifyAlert(client: Client, dateFound: string): Promise<void> {
  const allowedIds = getAllowedChatIds();
  if (allowedIds.length === 0) {
    console.error('[NOTIFY] ALLOWED_CHAT_IDS is not set');
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

  for (const chatId of allowedIds) {
    try {
      await bot.telegram.sendMessage(chatId, message, keyboard);
    } catch (error) {
      console.error(`[NOTIFY] Error sending notify alert to ${chatId}:`, error);
    }
  }
}
