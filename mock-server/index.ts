import express from 'express';

const app = express();
const PORT = 3001;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 6. Добавь специальный заголовок X-Mock-Mode: true во все ответы
// 7. Добавь логирование каждого входящего запроса в консоль: [MOCK] METHOD /url — timestamp
app.use((req, res, next) => {
  res.setHeader('X-Mock-Mode', 'true');
  console.log(`[MOCK] ${req.method} ${req.url} — ${new Date().toISOString()}`);
  next();
});

// 1. POST /ru-kz/niv/users/sign_in
// Also added GET because scraper needs initial CSRF
app.get('/ru-kz/niv/users/sign_in', (req, res) => {
  console.log('[MOCK] sign_in GET hit!');
  res.send(`<html><head><meta name="csrf-token" content="mock_csrf_token_12345"/></head><body></body></html>`);
});

app.post('/ru-kz/niv/users/sign_in', (req, res) => {
  console.log('[MOCK] sign_in POST hit!');
  res.status(200);
  res.cookie('_yatri_session', 'mock_session_token');
  res.send(`
    <html>
      <head>
        <meta name="csrf-token" content="mock_csrf_token_12345"/>
      </head>
      <body>Login Mock</body>
    </html>
  `);
});

// 2. GET /ru-kz/niv/schedule/:scheduleId/appointment/address/134
app.get('/ru-kz/niv/schedule/:scheduleId/appointment/address/134', (req, res) => {
  res.status(200).json({});
});

// 3. GET /ru-kz/niv/schedule/:scheduleId/appointment/days/134.json
app.get('/ru-kz/niv/schedule/:scheduleId/appointment/days/134.json', (req, res) => {
  res.status(200).json([
    { "date": "2026-08-15", "business_day": true },
    { "date": "2026-09-10", "business_day": true },
    { "date": "2026-10-05", "business_day": true }
  ]);
});

// 4. GET /ru-kz/niv/schedule/:scheduleId/appointment/times/134.json
app.get('/ru-kz/niv/schedule/:scheduleId/appointment/times/134.json', (req, res) => {
  const { date } = req.query;
  res.status(200).json({
    "available_times": ["08:00", "08:30", "09:00", "09:30"],
    "business_times": ["08:00", "08:30", "09:00", "09:30"]
  });
});

// 5. POST /ru-kz/niv/schedule/:scheduleId/appointment
app.post('/ru-kz/niv/schedule/:scheduleId/appointment', (req, res) => {
  res.status(200).json({ "success": true, "message": "Appointment rescheduled" });
});

// Mock endpoints for wizard schedule parsing
app.get('/ru-kz/niv/niv', (req, res) => {
  res.send(`
    <html><body>
      <a href="/ru-kz/niv/schedule/74233394/continue_actions">Continue</a>
    </body></html>
  `);
});

app.get('/ru-kz/niv/schedule/:scheduleId/users', (req, res) => {
  res.send(`
    <html><body>
      <input type="hidden" name="applicant_id[]" value="88823596">
      <input type="hidden" name="applicant_id[]" value="88823645">
    </body></html>
  `);
});

app.listen(PORT, () => {
  console.log(`Mock server is running on port ${PORT}`);
});
