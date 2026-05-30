const express  = require('express');
const twilio   = require('twilio');
const fetch    = require('node-fetch');
const cron     = require('node-cron');
const app      = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ── CREDENTIALS ──────────────────────────────────────────────
const TWILIO_SID   = 'ACd16bb92010dbaab266e2a87c9659f0f7';
const TWILIO_TOKEN = '38d18839dfb6fff3285449c80ae5ffe0';
const TWILIO_FROM  = '+17029034963';
const AT_BASE      = 'appAGHU4to9AqRATG';
const AT_TOKEN     = 'patOp3rCaOhpm6Jf5.7bae7e8d5c2a7ac94e27495ea87b1fe3766654977d29abf481176b7ace84f35e';
const AT_TABLE     = 'Leads';
const EJS_SVC      = 'service_ulaa1l9';
const EJS_TPL      = 'template_ca0t3bd';
const EJS_KEY      = 'bjgVSOwZTlqbnAAI7';

const twilioClient = twilio(TWILIO_SID, TWILIO_TOKEN);

const AGENTS = {
  marcus: { name:'Marcus Berry',       phone:'8055709214', email:'berryhomeslv@gmail.com',       calendly:'https://calendly.com/mtberry7/new-meeting' },
  alan:   { name:'Alan Cruz',          phone:'8183392498', email:'cruzalan967@gmail.com',         calendly:'http://Calendly.com/Alan-nevadagroup' },
  daniel: { name:'Daniel Pittman',     phone:'7022372272', email:'Daniel@premierpropertynv.com',  calendly:'https://calendly.com/daniel-nevadagroup/schedule-a-call' },
  kim:    { name:'Kimberly James',     phone:'7022656329', email:'kimjames1204@gmail.com',        calendly:'https://calendly.com/kimjames1204/30min' },
  joan:   { name:'Joan Mitchell-Momoh',phone:'6123068856', email:'joans.estates@gmail.com',       calendly:'https://calendly.com/joan-nevadagroup/30min' },
};

// ── HELPERS ───────────────────────────────────────────────────
function daysSince(dateStr) {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr)) / 86400000);
}

function isBusinessHours() {
  const lv   = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const hour = lv.getHours();
  const day  = lv.getDay();
  return day !== 0 && hour >= 8 && hour < 20;
}

async function getLeads() {
  const url = `https://api.airtable.com/v0/${AT_BASE}/${encodeURIComponent(AT_TABLE)}?sort[0][field]=Timestamp&sort[0][direction]=asc`;
  const res  = await fetch(url, { headers: { Authorization: `Bearer ${AT_TOKEN}` } });
  const data = await res.json();
  return data.records || [];
}

async function patchLead(id, fields) {
  await fetch(`https://api.airtable.com/v0/${AT_BASE}/${encodeURIComponent(AT_TABLE)}/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${AT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
  });
}

async function sendText(to, msg) {
  const num = to.replace(/\D/g,'');
  const formatted = num.startsWith('1') ? `+${num}` : `+1${num}`;
  try {
    await twilioClient.messages.create({ body: msg, from: TWILIO_FROM, to: formatted });
    console.log(`✓ Text sent to ${formatted}`);
    return true;
  } catch(e) {
    console.error(`✗ Text failed ${formatted}:`, e.message);
    return false;
  }
}

async function sendEmail(to, subject, body, fromName) {
  try {
    await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EJS_SVC, template_id: EJS_TPL, user_id: EJS_KEY,
        template_params: {
          to_email: to, from_name: fromName, from_email: to,
          phone:'', buyer_type:'', assumption:'', barrier:'', credit:'',
          income:'', downpayment:'', debt:'', location:'', occupation:'',
          timeline:'', price:'', wantsReview:'', readiness_category:'',
          loan_type:'', programs:'', pay_without:'', pay_with:'',
          ai_insight: body, summary: subject,
          timestamp: new Date().toLocaleString('en-US')
        }
      })
    });
    console.log(`✓ Email sent to ${to}`);
  } catch(e) {
    console.error(`✗ Email failed ${to}:`, e.message);
  }
}

// ── MESSAGES (PENDING YOUR APPROVAL) ─────────────────────────
function getMsg(day, lead, agent) {
  const n = lead.firstName || 'there';
  const msgs = {
    0:  `Hey ${n}! ${agent.name} here from Maybe I Can Buy 🏠 You just completed your homebuyer check and your results showed some real options worth a quick look. Want me to walk you through what came up? Reply STOP to opt out.`,
    1:  `Hey ${n} — ${agent.name} from Maybe I Can Buy. Just making sure you saw your results from yesterday. There may be Nevada programs that apply to your situation. Worth a quick chat? Reply STOP to opt out.`,
    7:  `Hey ${n} — ${agent.name} here. I know life gets busy. Your homebuyer results are still saved. Whenever you're ready — even just to ask one question — I'm here. Reply STOP to opt out.`,
    30: `Hey ${n} — ${agent.name} from Maybe I Can Buy. Last check in for a while. If buying ever gets back on your radar, even 6-12 months out, reach out. Programs change and I'll be here. Reply STOP to opt out.`,
  };
  return msgs[day] || null;
}

// ── MAIN RUN ──────────────────────────────────────────────────
async function runFollowUp() {
  console.log('\n=== MICB Run ===', new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));

  if (!isBusinessHours()) {
    console.log('Outside business hours — skipping');
    return;
  }

  const leads = await getLeads();
  console.log(`Processing ${leads.length} leads`);

  for (const rec of leads) {
    const f       = rec.fields;
    const id      = rec.id;
    const agentId = f['Agent'] || 'marcus';
    const agent   = AGENTS[agentId] || AGENTS.marcus;
    const status  = f['Status'] || 'New';
    const seqDay  = parseInt(f['Sequence Day'] || '0', 10);
    const phone   = (f['Phone'] || '').replace(/\D/g,'');
    const email   = f['Email'] || '';
    const ts      = f['Timestamp'] || '';
    const lastAuto= f['Last Auto Contact'] || '';
    const daysSinceSubmit = daysSince(ts);
    const daysSinceAuto   = daysSince(lastAuto);
    const firstName = f['First Name'] || 'there';
    const lastName  = f['Last Name']  || '';

    const lead = { firstName, lastName, agentId,
      programs: f['Programs'] || '', loanPath: f['Possible Loan'] || '',
      location: f['Target Location'] || '', payWith: f['Est With Assistance'] || '' };

    // Skip opted out
    if ((f['Sequence Status'] || '') === 'Opted Out') continue;

    // Lender follow up reminder
    if (status === 'Sent to Lender') {
      if (daysSince(f['Last Lender Reminder'] || ts) >= 2) {
        await sendText(agent.phone, `MICB: Follow up with lender on ${firstName} ${lastName} — sent 48hrs ago. leads.maybeicanbuy.com?agent=${agentId}`);
        await patchLead(id, { 'Last Lender Reminder': new Date().toLocaleDateString('en-US') });
      }
      continue;
    }

    // Engaged lead reminder to agent
    if (status === 'Contacted' || status === 'Replied') {
      if (daysSince(f['Last Contacted'] || ts) >= 3) {
        await sendText(agent.phone, `MICB REMINDER: ${firstName} ${lastName} hasn't heard from you in 3+ days. leads.maybeicanbuy.com?agent=${agentId}`);
        await sendEmail(agent.email, `Follow up needed — ${firstName} ${lastName}`, `${firstName} ${lastName} hasn't been contacted in 3+ days.\n\nleads.maybeicanbuy.com?agent=${agentId}`, 'MICB System');
      }
      continue;
    }

    // Skip pipeline leads
    if (['Sent to Lender','Path Being Built','Pre-Approved','Closed'].includes(status)) continue;
    if ((f['Sequence Status'] || '') === 'Paused') continue;

    // Long term nurture monthly
    if (status === 'Long Term Nurture') {
      if (daysSinceAuto >= 30 && phone.length >= 10) {
        await sendText(phone, `Hey ${firstName}! ${agent.name} from Maybe I Can Buy — quick check in. Whenever you're ready to look at buying again, I'm here. Programs and market change — your situation may be different now. Reply STOP to opt out.`);
        await patchLead(id, { 'Last Auto Contact': new Date().toLocaleDateString('en-US') });
      }
      if (daysSinceAuto >= 90) {
        await patchLead(id, { 'Status':'New','Sequence Status':'Active','Sequence Day':'0','Last Auto Contact':'' });
        console.log(`Restarted sequence for ${firstName} ${lastName}`);
      }
      continue;
    }

    // New lead sequence
    const checkDays = [0, 1, 7, 30];
    for (const d of checkDays) {
      if (seqDay > d) continue;
      if (daysSinceSubmit < d) break;
      if (daysSinceAuto < 1 && lastAuto) break;

      const msg = getMsg(d, lead, agent);
      if (!msg) continue;

      if (phone.length >= 10) {
        const sent = await sendText(phone, msg);
        if (sent) {
          await patchLead(id, {
            'Sequence Day': String(d + 1),
            'Last Auto Contact': new Date().toLocaleDateString('en-US'),
            'Sequence Status': 'Active'
          });
          console.log(`Day ${d} text → ${firstName} ${lastName}`);
          break;
        }
      }
    }

    // Move to nurture after day 30
    if (daysSinceSubmit > 31 && seqDay >= 30) {
      await patchLead(id, { 'Status':'Long Term Nurture','Sequence Status':'Nurture','Sequence Day':'0' });
      console.log(`${firstName} ${lastName} → Long Term Nurture`);
    }
  }

  console.log('=== Run complete ===\n');
}

// ── ROUTES ────────────────────────────────────────────────────
app.get('/', (req, res) => res.send('MICB Follow Up System is running ✓'));

app.get('/run', async (req, res) => {
  if (req.query.key !== 'micb2026') return res.status(401).send('Unauthorized');
  await runFollowUp();
  res.send('Follow up run complete.');
});

app.post('/incoming', async (req, res) => {
  const from = req.body.From || '';
  const body = (req.body.Body || '').trim().toUpperCase();
  console.log(`Incoming text from ${from}: ${body}`);

  if (['STOP','UNSUBSCRIBE','CANCEL','QUIT','END'].includes(body)) {
    const leads = await getLeads();
    const match = leads.find(r => {
      const p = (r.fields['Phone'] || '').replace(/\D/g,'');
      const f = from.replace(/\D/g,'');
      return p === f.slice(-10) || f.slice(-10) === p;
    });
    if (match) {
      await patchLead(match.id, { 'Status':'Opted Out', 'Sequence Status':'Opted Out' });
      console.log(`Opted out: ${from}`);
    }
    return res.send('<Response><Message>You have been unsubscribed. Reply START to resubscribe.</Message></Response>');
  }

  // Response — pause sequence and notify agent
  const leads = await getLeads();
  const match = leads.find(r => {
    const p = (r.fields['Phone'] || '').replace(/\D/g,'');
    const f = from.replace(/\D/g,'');
    return p === f.slice(-10);
  });

  if (match) {
    const agentId = match.fields['Agent'] || 'marcus';
    const agent   = AGENTS[agentId] || AGENTS.marcus;
    const name    = `${match.fields['First Name'] || ''} ${match.fields['Last Name'] || ''}`.trim();
    await patchLead(match.id, { 'Sequence Status':'Paused', 'Status':'Replied' });
    await sendText(agent.phone, `MICB ALERT: ${name} just replied to your text! leads.maybeicanbuy.com?agent=${agentId}`);
    await sendEmail(agent.email, `MICB: ${name} replied`, `${name} replied: "${req.body.Body}"\n\nleads.maybeicanbuy.com?agent=${agentId}`, 'MICB System');
    if (agentId !== 'marcus') {
      await sendEmail('berryhomeslv@gmail.com', `MICB: ${name} replied to ${agent.name}`, `${name} replied to ${agent.name}: "${req.body.Body}"`, 'MICB System');
    }
    console.log(`Response from ${from} — ${agent.name} notified`);
  }

  res.send('<Response></Response>');
});

// ── SCHEDULE ──────────────────────────────────────────────────
// Every hour Mon-Sat
cron.schedule('0 * * * 1-6', runFollowUp, { timezone: 'America/Los_Angeles' });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MICB server running on port ${PORT}`));
