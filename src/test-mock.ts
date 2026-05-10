import 'dotenv/config';
import { createHttpClient } from './scraper/http-client';
import { login } from './scraper/auth';
import { checkClient, Client } from './monitor/checker';

const testClient: Client = {
  id: 'test-001',
  name: 'Иванов Иван',
  email: 'test@example.com',
  password_encrypted: 'test_password',
  schedule_id: '74233394',
  applicant_ids: ['88823596', '88823645'],
  current_date: '2027-08-15',
  status: 'active',
  attempts_left: 3
};

async function runTest() {
  console.log('[TEST] Starting integration test...');
  console.log(`[TEST] MOCK_MODE: ${process.env.MOCK_MODE}`);

  const client = createHttpClient();

  try {
    // Шаг 2
    const csrfToken = await login(client, testClient.email, testClient.password_encrypted);
    console.log(`[TEST] Obtained CSRF Token: ${csrfToken}`);

    // Шаг 3
    const checkResult = await checkClient(testClient, csrfToken, client);
    console.log('[TEST] Full CheckResult:', checkResult);

    // Шаг 4
    if (checkResult.action === 'reschedule') {
      console.log(`[TEST] ✅ SUCCESS: Bot would reschedule to ${checkResult.date_found}`);
    } else if (checkResult.action === 'skip') {
      console.log(`[TEST] ⚠️ SKIP: ${checkResult.reason}`);
    } else if (checkResult.action === 'notify') {
      console.log(`[TEST] 🔔 NOTIFY: Last attempt warning for ${checkResult.date_found}`);
    } else if (checkResult.action === 'error') {
      console.log(`[TEST] ❌ ERROR: ${checkResult.reason}`);
    }

    // Шаг 5
    console.log('[TEST] Integration test complete.');
  } catch (error: any) {
    console.error(`[TEST] ❌ FATAL: ${error.message}`);
  }
}

runTest().catch((error: any) => {
  console.error(`[TEST] ❌ FATAL: ${error.message}`);
});
