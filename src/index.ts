import 'dotenv/config';
import cron from 'node-cron';
import { runMonitoringCycle } from './scheduler';
import { randomDelay } from './scraper/http-client';
import { startBot, bot } from './bot/index';

const MIN_MINUTES = parseInt(process.env.CHECK_INTERVAL_MIN ?? '5', 10);
const MAX_MINUTES = parseInt(process.env.CHECK_INTERVAL_MAX ?? '8', 10);

let isRunning = false;

async function executeCycle(withDelay: boolean) {
  if (isRunning) {
    return;
  }
  
  isRunning = true;
  try {
    if (withDelay) {
      await randomDelay(MIN_MINUTES * 60 * 1000, MAX_MINUTES * 60 * 1000);
    }
    await runMonitoringCycle();
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[SLOTHUNTER] Critical error during cycle: ${errorMessage}`);
  } finally {
    isRunning = false;
  }
}

async function main(): Promise<void> {
  console.log('[SLOTHUNTER] Bot started');
  console.log(`[SLOTHUNTER] MOCK_MODE: ${process.env.MOCK_MODE}`);
  console.log(`[SLOTHUNTER] Check interval: ${MIN_MINUTES}-${MAX_MINUTES} minutes`);

  await startBot();

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  // Запустить первый цикл сразу при старте не дожидаясь cron
  executeCycle(false);

  // Интервал: каждую минуту проверять — запускать цикл с рандомной задержкой
  cron.schedule('* * * * *', () => {
    // Флаг isRunning защитит нас от наслоения циклов друг на друга.
    // Первая вошедшая сюда минута запустит задержку на 5-8 минут, а остальные будут пропущены.
    executeCycle(true);
  });
}

main().catch((error: unknown) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(`[SLOTHUNTER] Failed to start: ${errorMessage}`);
  process.exit(1);
});
