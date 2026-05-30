// ============================================================
// MAYBE I CAN BUY — Webhook Server
// Handles incoming texts from Twilio (opt-outs + responses)
// Deploy this alongside index.js on Render
// ============================================================

const express  = require('express');
const app      = express();
const { handleIncomingText, runFollowUp } = require('./index');

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Health check — Render needs this to know the service is alive
app.get('/', (req, res) => {
  res.send('MICB Follow Up System is running.');
});

// Twilio webhook — incoming texts
app.post('/incoming', async (req, res) => {
  console.log('Incoming text from:', req.body.From, '—', req.body.Body);
  await handleIncomingText(req, res);
});

// Manual trigger — hit this URL to run the sequence immediately
app.get('/run', async (req, res) => {
  const key = req.query.key;
  if (key !== 'micb2026') {
    return res.status(401).send('Unauthorized');
  }
  await runFollowUp();
  res.send('Follow up run complete.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MICB webhook server running on port ${PORT}`);
});
