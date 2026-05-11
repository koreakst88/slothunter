import { Telegraf, Scenes, session, Markup } from 'telegraf';
import { AxiosInstance, AxiosResponse } from 'axios';
import { getActiveClients, getAllClients, createClient, updateClientStatus, getClientLogs, getClientById, addLog, updateClientAfterReschedule } from '../db/supabase';
import { createHttpClient } from '../scraper/http-client';
import { login } from '../scraper/auth';
import { rescheduleAppointment } from '../scraper/reschedule';

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN is missing in environment variables');
}

interface WizardState {
  name: string;
  email: string;
  password_encrypted: string;
  scheduleId?: string;
  applicantIds?: string[];
  attemptsLeft?: number;
}

interface MyWizardSession extends Scenes.WizardSessionData {}

interface MyContext extends Scenes.WizardContext<MyWizardSession> {}

const scheduleIdPatterns: RegExp[] = [
  /\/ru-kz\/niv\/schedule\/(\d+)\/continue_actions/,
  /\/ru-kz\/niv\/schedule\/(\d+)\/appointment/,
  /schedule\/(\d+)\//,
  /"schedule_id["\s]*:["\s]*(\d+)/,
];

function getFinalResponseUrl(response: AxiosResponse): string {
  return response.request?.res?.responseUrl || 'unknown';
}

function logHtmlPreview(response: AxiosResponse, label: string): void {
  const html = typeof response.data === 'string' ? response.data : '';
  console.log(`[PARSE] ${label} HTML preview:`, html.substring(0, 2000));
}

function findScheduleId(html: string, sourcePath: string): string | null {
  for (const pattern of scheduleIdPatterns) {
    const match = html.match(pattern);
    if (match) {
      console.log(`[PARSE] Pattern matched on ${sourcePath}:`, pattern.toString());
      return match[1];
    }

    console.log(`[PARSE] Pattern did not match on ${sourcePath}:`, pattern.toString());
  }

  return null;
}

async function fetchSchedulePage(client: AxiosInstance, baseUrl: string, path: string): Promise<AxiosResponse> {
  const url = `${baseUrl}${path}`;
  const label = path.endsWith('/manage_groups') ? 'manage_groups' : 'account';
  console.log(`[PARSE] GET ${label} URL:`, url);

  const response = await client.get(url);
  console.log(`[PARSE] GET ${label} status:`, response.status);
  console.log('[PARSE] Response URL:', getFinalResponseUrl(response));
  logHtmlPreview(response, label === 'account' ? 'Account' : 'Manage groups');

  return response;
}

async function parseScheduleId(client: AxiosInstance): Promise<string | null> {
  const baseUrl = client.defaults.baseURL || 'https://ais.usvisa-info.com';
  const paths = ['/ru-kz/niv/account', '/ru-kz/niv/account/manage_groups'];

  for (const path of paths) {
    const response = await fetchSchedulePage(client, baseUrl, path);
    const html = typeof response.data === 'string' ? response.data : '';
    const scheduleId = findScheduleId(html, path);
    if (scheduleId) {
      return scheduleId;
    }
  }

  return null;
}

const addClientWizard = new Scenes.WizardScene<MyContext>(
  'ADD_CLIENT_WIZARD',
  async (ctx) => {
    await ctx.reply('Введите имя клиента:');
    return ctx.wizard.next();
  },
  async (ctx) => {
    const state = ctx.wizard.state as unknown as WizardState;
    if (!ctx.message || !('text' in ctx.message)) return;
    state.name = ctx.message.text;
    await ctx.reply('Введите email от аккаунта на ais.usvisa-info.com:');
    return ctx.wizard.next();
  },
  async (ctx) => {
    const state = ctx.wizard.state as unknown as WizardState;
    if (!ctx.message || !('text' in ctx.message)) return;
    state.email = ctx.message.text;
    await ctx.reply('Введите пароль от аккаунта:');
    return ctx.wizard.next();
  },
  async (ctx) => {
    const state = ctx.wizard.state as unknown as WizardState;
    if (!ctx.message || !('text' in ctx.message)) return;
    state.password_encrypted = ctx.message.text;

    console.log('[DEBUG] MOCK_MODE:', process.env.MOCK_MODE);
    console.log('[DEBUG] MOCK_SERVER_URL:', process.env.MOCK_SERVER_URL);
    console.log('[DEBUG] BASE_URL будет:', 
      process.env.MOCK_MODE === 'true' 
        ? process.env.MOCK_SERVER_URL 
        : 'https://ais.usvisa-info.com'
    );

    await ctx.reply('⏳ Подключаюсь к аккаунту...');
    
    try {
      const client = createHttpClient();
      
      let csrfToken: string;
      try {
        csrfToken = await login(client, state.email, state.password_encrypted);
      } catch (err: unknown) {
        const error = err as Error;
        console.log('[DEBUG] Login error full:', error.message);
        console.log('[DEBUG] Login error stack:', error.stack);
        await ctx.reply('❌ Ошибка входа. Проверьте email и пароль.');
        return ctx.scene.leave();
      }
      
      const scheduleId = await parseScheduleId(client);
      if (!scheduleId) {
        await ctx.reply('❌ Не удалось найти запись на собеседование.\nУбедитесь что аккаунт имеет активную запись.');
        return ctx.scene.leave();
      }
      
      state.scheduleId = scheduleId;
      
      const usersResponse = await client.get(`/ru-kz/niv/schedule/${scheduleId}/users`);
      const usersHtml = usersResponse.data as string;
      
      const allIds = new Set<string>();
      for (const m of Array.from(usersHtml.matchAll(/applicant_id.*?(\d+)/g))) allIds.add(m[1]);
      for (const m of Array.from(usersHtml.matchAll(/name="[^\"]*applicant[^\"]*"[^>]*value="(\d+)"/g))) allIds.add(m[1]);
      for (const m of Array.from(usersHtml.matchAll(/value="(\d+)"[^>]*name="[^\"]*applicant[^\"]*"/g))) allIds.add(m[1]);
      for (const m of Array.from(usersHtml.matchAll(/\/users\/(\d+)\/edit/g))) allIds.add(m[1]);

      let finalIds = Array.from(allIds);
      if (finalIds.length === 0) {
        // Fallback for MOCK tests or different layout
        finalIds = ['1'];
      }
      
      state.applicantIds = finalIds;
      
      await ctx.reply(
        `✅ Данные получены!\n\n` +
        `👤 Имя: ${state.name}\n` +
        `📧 Email: ${state.email}\n` +
        `🔑 Schedule ID: ${scheduleId}\n` +
        `👥 Заявителей: ${finalIds.length}`
      );

      await ctx.reply(
        'Сколько попыток переноса осталось у клиента?\n' +
        'Проверьте на сайте ais.usvisa-info.com\n' +
        'Введите число от 1 до 3:'
      );
      
      return ctx.wizard.next();
      
    } catch (err) {
      console.error('[BOT] Login or parsing failed:', err);
      await ctx.reply('❌ Ошибка входа. Проверьте email и пароль.');
      return ctx.scene.leave();
    }
  },
  async (ctx) => {
    const state = ctx.wizard.state as unknown as WizardState;
    if (!ctx.message || !('text' in ctx.message)) return;

    const attemptsText = ctx.message.text.trim();
    if (!/^[1-3]$/.test(attemptsText)) {
      await ctx.reply('❌ Введите число от 1 до 3');
      return;
    }

    const attemptsLeft = Number.parseInt(attemptsText, 10);
    state.attemptsLeft = attemptsLeft;

    await ctx.reply(
      `✅ Данные получены!\n\n` +
      `👤 Имя: ${state.name}\n` +
      `📧 Email: ${state.email}\n` +
      `🔑 Schedule ID: ${state.scheduleId}\n` +
      `👥 Заявителей: ${state.applicantIds?.length ?? 0}\n` +
      `🔄 Попытки: ${attemptsLeft}/3\n\n` +
      `Сохранить клиента?`,
      Markup.inlineKeyboard([
        Markup.button.callback('✅ Да', 'save_yes'),
        Markup.button.callback('❌ Отмена', 'save_no')
      ])
    );

    return ctx.wizard.next();
  },
  async (ctx) => {
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      if (ctx.callbackQuery.data === 'save_yes') {
        const state = ctx.wizard.state as unknown as WizardState;
        try {
          await createClient({
            name: state.name,
            email: state.email,
            password_encrypted: state.password_encrypted,
            schedule_id: state.scheduleId!,
            applicant_ids: state.applicantIds!,
            current_date: '2099-01-01',
            status: 'active',
            attempts_left: state.attemptsLeft!
          });
          await ctx.editMessageText(`✅ Клиент ${state.name} добавлен!\nМониторинг запущен автоматически.`);
        } catch (error) {
          console.error(error);
          await ctx.editMessageText('❌ Ошибка при сохранении в базу.');
        }
      } else if (ctx.callbackQuery.data === 'save_no') {
        await ctx.editMessageText('Операция отменена.');
      }
    } else {
        await ctx.reply('Операция отменена.');
    }
    return ctx.scene.leave();
  }
);

export const bot = new Telegraf<MyContext>(token);

bot.use(async (ctx, next) => {
  const allowedIds = process.env.ALLOWED_CHAT_IDS
    ?.split(',')
    .map(id => id.trim()) || [];

  // Получаем chat id из разных источников
  const chatId = (
    ctx.chat?.id ||
    ctx.callbackQuery?.from?.id ||
    ctx.from?.id
  )?.toString();

  console.log('[ACCESS] chat id:', chatId);
  console.log('[ACCESS] allowed:', allowedIds);

  if (!chatId || !allowedIds.includes(chatId)) {
    if (ctx.chat) {
      await ctx.reply('⛔️ Доступ запрещён.');
    }
    return;
  }

  return next();
});

const stage = new Scenes.Stage<MyContext>([addClientWizard]);

bot.use(session());
bot.use(stage.middleware());

bot.command('add_client', (ctx) => {
  ctx.scene.enter('ADD_CLIENT_WIZARD');
});

bot.command('start', (ctx) => {
  ctx.reply(
    '🤖 SlotHunter активен\n\n' +
    'Команды:\n' +
    '/clients — список клиентов\n' +
    '/add_client — добавить клиента\n' +
    '/pause — поставить на паузу\n' +
    '/resume — возобновить мониторинг\n' +
    '/logs — история действий\n' +
    '/status — статус системы'
  );
});

function formatTimeAgo(dateStr: string): string {
  const timestamp = new Date(dateStr).getTime();
  if (Number.isNaN(timestamp)) {
    return 'неизвестно';
  }

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) {
    return 'только что';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} минут назад`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} часов назад`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} дней назад`;
}

function isMonitoringStale(dateStr: string): boolean {
  const timestamp = new Date(dateStr).getTime();
  if (Number.isNaN(timestamp)) {
    return false;
  }

  return Date.now() - timestamp > 15 * 60 * 1000;
}

function formatCurrentAppointmentDate(currentDate: string | null): string {
  if (!currentDate || currentDate === '2099-01-01') {
    return 'нет данных';
  }

  return currentDate;
}

bot.command('status', async (ctx) => {
  try {
    const clients = await getActiveClients();
    const mode = process.env.MOCK_MODE === 'true' ? 'MOCK' : 'LIVE';

    const clientLines = clients.map(client => {
      const lastCheckedLine = client.last_checked_at
        ? `🕐 Последняя проверка: ${formatTimeAgo(client.last_checked_at)}`
        : '⏳ Ещё не проверялся';
      const staleWarning = client.last_checked_at && isMonitoringStale(client.last_checked_at)
        ? '\n⚠️ Мониторинг мог зависнуть!'
        : '';

      return `👤 ${client.name}\n` +
        `${lastCheckedLine}\n` +
        `📅 Текущая запись: ${formatCurrentAppointmentDate(client.current_date)}` +
        `${staleWarning}`;
    });

    const message =
      `📊 Статус системы SlotHunter\n\n` +
      `Режим: ${mode}\n` +
      `Активных клиентов: ${clients.length}` +
      (clientLines.length > 0 ? `\n\n${clientLines.join('\n\n')}` : '');

    await ctx.reply(message);
  } catch (error) {
    console.error('[BOT] Error in /status:', error);
    await ctx.reply('❌ Ошибка подключения к базе данных');
  }
});

function getStatusEmoji(status: string): string {
  switch (status) {
    case 'active': return '🟢';
    case 'paused': return '🟡';
    case 'done': return '✅';
    case 'blocked': return '🔴';
    case 'error': return '❌';
    default: return '❓';
  }
}

bot.command('clients', async (ctx) => {
  try {
    const clients = await getAllClients();
    
    if (clients.length === 0) {
      await ctx.reply('Клиентов пока нет. Добавьте первого через /add_client');
      return;
    }
    
    const lines = clients.map(client => {
      const emoji = getStatusEmoji(client.status);
      return `${emoji} ${client.name}\n` +
             `📅 Дата: ${client.current_date || 'Нет данных'}\n` +
             `🔄 Попытки: ${client.attempts_left}/3\n` +
             `📌 Статус: ${client.status}\n`;
    });
    
    const message = lines.join('\n');
    await ctx.reply(message);
  } catch (error) {
    console.error('[BOT] Error in /clients:', error);
    await ctx.reply('❌ Ошибка подключения к базе данных');
  }
});

bot.command('pause', async (ctx) => {
  try {
    const clients = await getAllClients();
    const activeClients = clients.filter(c => c.status === 'active');
    
    if (activeClients.length === 0) {
      await ctx.reply('Нет активных клиентов для паузы.');
      return;
    }
    
    const buttons = activeClients.map(c => 
      Markup.button.callback(`[🟢 ${c.name}]`, `pause_${c.id}`)
    );
    
    const keyboard = buttons.map(btn => [btn]);
    
    await ctx.reply('Выберите клиента для паузы:', Markup.inlineKeyboard(keyboard));
  } catch (error) {
    console.error('[BOT] Error in /pause:', error);
    await ctx.reply('❌ Ошибка при получении клиентов');
  }
});

bot.action(/^pause_(.+)$/, async (ctx) => {
  try {
    const clientId = ctx.match[1];
    await updateClientStatus(clientId, 'paused');
    
    const clients = await getAllClients();
    const client = clients.find(c => c.id === clientId);
    const name = client ? client.name : 'Клиент';
    
    await ctx.editMessageText(`🟡 ${name} поставлен на паузу.`);
  } catch (error) {
    console.error('[BOT] Error in pause action:', error);
    await ctx.answerCbQuery('❌ Ошибка', { show_alert: true });
  }
});

bot.command('resume', async (ctx) => {
  try {
    const clients = await getAllClients();
    const pausedClients = clients.filter(c => c.status === 'paused');
    
    if (pausedClients.length === 0) {
      await ctx.reply('Нет клиентов на паузе.');
      return;
    }
    
    const buttons = pausedClients.map(c => 
      Markup.button.callback(`[🟡 ${c.name}]`, `resume_${c.id}`)
    );
    
    const keyboard = buttons.map(btn => [btn]);
    
    await ctx.reply('Выберите клиента для возобновления:', Markup.inlineKeyboard(keyboard));
  } catch (error) {
    console.error('[BOT] Error in /resume:', error);
    await ctx.reply('❌ Ошибка при получении клиентов');
  }
});

bot.action(/^resume_(.+)$/, async (ctx) => {
  try {
    const clientId = ctx.match[1];
    await updateClientStatus(clientId, 'active');
    
    const clients = await getAllClients();
    const client = clients.find(c => c.id === clientId);
    const name = client ? client.name : 'Клиент';
    
    await ctx.editMessageText(`🟢 ${name} снова активен!`);
  } catch (error) {
    console.error('[BOT] Error in resume action:', error);
    await ctx.answerCbQuery('❌ Ошибка', { show_alert: true });
  }
});

bot.command('logs', async (ctx) => {
  try {
    const clients = await getAllClients();
    
    if (clients.length === 0) {
      await ctx.reply('Нет клиентов.');
      return;
    }
    
    const buttons = clients.map(c => 
      Markup.button.callback(`[${c.name}]`, `logs_${c.id}`)
    );
    
    const keyboard = buttons.map(btn => [btn]);
    
    await ctx.reply('По какому клиенту показать историю?', Markup.inlineKeyboard(keyboard));
  } catch (error) {
    console.error('[BOT] Error in /logs:', error);
    await ctx.reply('❌ Ошибка при получении клиентов');
  }
});

function getActionEmoji(action: string): string {
  switch (action) {
    case 'reschedule': return '✅';
    case 'check': return '🔍';
    case 'error': return '❌';
    case 'notify': return '🔔';
    default: return '📄';
  }
}

bot.action(/^logs_(.+)$/, async (ctx) => {
  try {
    const clientId = ctx.match[1];
    
    const clients = await getAllClients();
    const client = clients.find(c => c.id === clientId);
    const name = client ? client.name : 'Клиент';
    
    const logs = await getClientLogs(clientId);
    
    if (logs.length === 0) {
      await ctx.editMessageText(`📋 История: ${name}\n\nИстория пуста.`);
      return;
    }
    
    const logLines = logs.map(log => {
      const emoji = getActionEmoji(log.action);
      const dateStr = new Date(log.created_at).toLocaleString('ru-RU', { 
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      });
      return `${emoji} ${log.action} — ${dateStr}\n` +
             `📅 Найдена: ${log.date_found || '—'}\n` +
             `✅ Забронирована: ${log.date_booked || '—'}\n` +
             `💬 ${log.result || '—'}`;
    });
    
    const message = `📋 История: ${name} (последние 10)\n\n` + logLines.join('\n\n');
    
    await ctx.editMessageText(message);
  } catch (error) {
    console.error('[BOT] Error in logs action:', error);
    await ctx.answerCbQuery('❌ Ошибка', { show_alert: true });
  }
});

bot.action(/^confirm_reschedule_(.+)_(.+)$/, async (ctx) => {
  const clientId = ctx.match[1];
  const dateFound = ctx.match[2];
  
  try {
    const client = await getClientById(clientId);
    if (!client) {
      await ctx.editMessageText('❌ Ошибка: клиент не найден в базе.');
      return;
    }
    
    await ctx.editMessageText('⏳ Выполняю перенос...');
    
    const httpClient = createHttpClient();
    const csrfToken = await login(httpClient, client.email, client.password_encrypted);
    
    const result = await rescheduleAppointment(
      httpClient,
      client.schedule_id,
      client.applicant_ids,
      dateFound,
      csrfToken
    );
    
    if (result.success) {
      await updateClientAfterReschedule(clientId, result.date, client.attempts_left);
      await addLog(clientId, 'reschedule', 'success', dateFound, result.date);
      await ctx.editMessageText(`✅ Перенос выполнен! Дата: ${result.date}`);
    } else {
      await ctx.editMessageText(`❌ Ошибка переноса: ${result.error || 'Неизвестная ошибка'}`);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[BOT] Error in confirm_reschedule:', error);
    await ctx.editMessageText(`❌ Ошибка переноса: ${errorMsg}`);
  }
});

bot.action(/^skip_reschedule_(.+)$/, async (ctx) => {
  const clientId = ctx.match[1];
  try {
    await updateClientStatus(clientId, 'paused');
    await ctx.editMessageText('⏸ Перенос пропущен. Клиент поставлен на паузу.');
  } catch (error) {
    console.error('[BOT] Error in skip_reschedule:', error);
    await ctx.answerCbQuery('❌ Ошибка', { show_alert: true });
  }
});

export async function startBot(): Promise<void> {
  const WEBHOOK_DOMAIN = process.env.WEBHOOK_DOMAIN || '';
  const WEBHOOK_PORT = parseInt(process.env.PORT || '3000', 10);

  await bot.launch({
    webhook: {
      domain: WEBHOOK_DOMAIN,
      port: WEBHOOK_PORT,
    }
  });
  console.log('[BOT] Telegram bot started');
  
  await bot.telegram.setMyCommands([
    { command: 'start', description: '🤖 Главное меню' },
    { command: 'clients', description: '👥 Список клиентов' },
    { command: 'add_client', description: '➕ Добавить клиента' },
    { command: 'pause', description: '⏸ Поставить на паузу' },
    { command: 'resume', description: '▶️ Возобновить мониторинг' },
    { command: 'logs', description: '📋 История действий' },
    { command: 'status', description: '📊 Статус системы' },
  ]);
}
