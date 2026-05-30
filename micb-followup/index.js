// ============================================================
// MAYBE I CAN BUY — Automated Follow Up System
// Runs daily at 9am Las Vegas time
// Texts via Twilio, emails via EmailJS
// Reads/writes from Airtable
// ============================================================

const twilio    = require('twilio');
const fetch     = require('node-fetch');
const cron      = require('node-cron');

// ── CREDENTIALS ──────────────────────────────────────────────
const TWILIO_SID   = 'ACd16bb92010dbaab266e2a87c9659f0f7';
const TWILIO_TOKEN = '38d18839dfb6fff3285449c80ae5ffe0';
const TWILIO_FROM  = '+17029034963';

const AT_BASE    = 'appAGHU4to9AqRATG';
const AT_TOKEN   = 'patOp3rCaOhpm6Jf5.7bae7e8d5c2a7ac94e27495ea87b1fe3766654977d29abf481176b7ace84f35e';
const AT_TABLE   = 'Leads';

const EJS_SVC    = 'service_ulaa1l9';
const EJS_TPL    = 'template_ca0t3bd';
const EJS_KEY    = 'bjgVSOwZTlqbnAAI7';

const twilioClient = twilio(TWILIO_SID, TWILIO_TOKEN);

// ── AGENT REGISTRY ───────────────────────────────────────────
const AGENTS = {
  marcus: { name: 'Marcus Berry',      phone: '(805) 570-9214', email: 'berryhomeslv@gmail.com',        calendly: 'https://calendly.com/mtberry7/new-meeting' },
  alan:   { name: 'Alan Cruz',         phone: '(818) 339-2498', email: 'cruzalan967@gmail.com',          calendly: 'http://Calendly.com/Alan-nevadagroup' },
  daniel: { name: 'Daniel Pittman',    phone: '(702) 237-2272', email: 'Daniel@premierpropertynv.com',   calendly: 'https://calendly.com/daniel-nevadagroup/schedule-a-call' },
  kim:    { name: 'Kimberly James',    phone: '(702) 265-6329', email: 'kimjames1204@gmail.com',         calendly: 'https://calendly.com/kimjames1204/30min' },
  joan:   { name: 'Joan Mitchell-Momoh', phone: '(612) 306-8856', email: 'joans.estates@gmail.com',     calendly: 'https://calendly.com/joan-nevadagroup/30min' },
};

// ── MESSAGE SEQUENCES ────────────────────────────────────────
// PENDING MARCUS APPROVAL — these fire once approved
// To approve: change approved: false to approved: true for each message
const SEQUENCES = {

  // ── NEW LEAD SEQUENCE ────────────────────────────────────
  new_lead: [
    {
      day: 0, type: 'text', approved: true,
      message: (lead, agent) =>
        `Hey ${lead.firstName}! ${agent.name} here from Maybe I Can Buy 🏠 You just completed your homebuyer check and your results showed some real options worth a quick look. Want me to walk you through what came up? Takes 15 mins — no pressure. Reply STOP to opt out.`
    },
    {
      day: 1, type: 'text', approved: true,
      message: (lead, agent) =>
        `Hey ${lead.firstName} — ${agent.name} from Maybe I Can Buy again. Just want to make sure you saw your results. ${lead.programs ? `Looks like ${lead.programs.split(',').length} Nevada program${lead.programs.split(',').length > 1 ? 's' : ''} may apply to your situation.` : 'There may be options worth reviewing.'} Worth a quick chat? Reply STOP to opt out.`
    },
    {
      day: 3, type: 'email', approved: true,
      subject: (lead, agent) => `Your Maybe I Can Buy results — ${lead.firstName}`,
      message: (lead, agent) =>
        `Hey ${lead.firstName},\n\nMarcus Berry here from Maybe I Can Buy — just following up on your homebuyer check from a few days ago.\n\nHere's a quick recap of what came up:\n\n` +
        `Possible Loan Path: ${lead.loanPath || 'FHA Loan'}\n` +
        `Possible Programs: ${lead.programs || 'Nevada assistance programs'}\n` +
        `Est. Monthly With Programs: ${lead.payWith || 'See results'}\n\n` +
        `${lead.location ? `You mentioned you're looking in ${lead.location}` : 'Based on your answers'} — there may be more possible than you think.\n\n` +
        `Book a free 15-minute review here:\n${agent.calendly}\n\n` +
        `No pressure either way.\n\n— ${agent.name}\nLPT Realty | Maybe I Can Buy\n${agent.phone}\n\nReply STOP to opt out.`
    },
    {
      day: 7, type: 'text', approved: true,
      message: (lead, agent) =>
        `Hey ${lead.firstName} — ${agent.name} here. I know life gets busy. Just want to make sure this doesn't fall through the cracks for you. Your homebuyer results are still saved. Whenever you're ready — even just to ask one question — I'm here. Reply STOP to opt out.`
    },
    {
      day: 14, type: 'email', approved: true,
      subject: (lead, agent) => `Quick update on Nevada programs — ${lead.firstName}`,
      message: (lead, agent) =>
        `Hey ${lead.firstName},\n\n${agent.name} from Maybe I Can Buy checking in.\n\nJust a heads up — Nevada's down payment assistance programs are first-come first-served and funding can run out. A couple of the programs that matched your profile are still active right now.\n\n` +
        `If you've been on the fence, now is actually a good time to at least have the conversation.\n\n` +
        `Book a free call here:\n${agent.calendly}\n\n` +
        `Takes 15 minutes. No obligation.\n\n— ${agent.name}\nMaybe I Can Buy | ${agent.phone}\n\nReply STOP to opt out.`
    },
    {
      day: 30, type: 'text', approved: true,
      message: (lead, agent) =>
        `Hey ${lead.firstName} — ${agent.name} from Maybe I Can Buy. Last check in for a while — I don't want to bug you. But if buying a home ever gets back on your radar, even 6-12 months from now, reach out. Your results are saved and programs change. I'll be here. Reply STOP to opt out.`
    },
  ],

  // ── LONG TERM NURTURE (monthly) ──────────────────────────
  nurture: [
    {
      day: 0, type: 'text', approved: true,
      message: (lead, agent) =>
        `Hey ${lead.firstName}! ${agent.name} from Maybe I Can Buy — just a quick check in. Las Vegas market has some movement right now and a few Nevada programs have been updated. Whenever you're ready to take another look — even just a quick question — I'm here. Reply STOP to opt out.`
    },
  ],

  // ── AGENT REMINDERS (internal — sent to agent not buyer) ─
  agent_reminders: [
    {
      trigger: 'responded',    // lead responded — agent needs to follow up
      delay_hours: 1,
      type: 'text_agent',
      message: (lead, agent) =>
        `MICB ALERT: ${lead.firstName} ${lead.lastName} just responded to your follow up text. Log into your dashboard to see their message and follow up: leads.maybeicanbuy.com?agent=${lead.agentId}`
    },
    {
      trigger: 'engaged_no_contact', // agent hasn't touched engaged lead in 3 days
      delay_days: 3,
      type: 'text_agent',
      message: (lead, agent) =>
        `MICB REMINDER: You haven't contacted ${lead.firstName} ${lead.lastName} in 3+ days. They responded to your outreach — don't let them go cold. leads.maybeicanbuy.com?agent=${lead.agentId}`
    },
    {
      trigger: 'lender_followup', // lead sent to lender — check in with lender
      delay_hours: 48,
      type: 'text_agent',
      message: (lead, agent) =>
        `MICB REMINDER: Follow up with the lender on ${lead.firstName} ${lead.lastName}. They were sent to lender 48 hours ago. Time to check on their status. leads.maybeicanbuy.com?agent=${lead.agentId}`
    },
  ],
};

// ── AIRTABLE HELPERS ─────────────────────────────────────────
async function getLeads() {
  const url = `https://api.airtable.com/v0/${AT_BASE}/${encodeURIComponent(AT_TABLE)}?sort[0][field]=Timestamp&sort[0][direction]=asc`;
  const res  = await fetch(url, { headers: { Authorization: `Bearer ${AT_TOKEN}` } });
  const data = await res.json();
  return data.records || [];
}

async function patchLead(id, fields) {
  await fetch(`https://api.airtable.com/v0/${AT_BASE}/${encodeURIComponent(AT_TABLE)}/${id}`, {
    method:  'PATCH',
    headers: { Authorization: `Bearer ${AT_TOKEN}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ fields })
  });
}

// ── SEND TEXT ─────────────────────────────────────────────────
async function sendText(to, message) {
  // Format phone number
  const cleaned = to.replace(/\D/g, '');
  const formatted = cleaned.startsWith('1') ? `+${cleaned}` : `+1${cleaned}`;

  try {
    const msg = await twilioClient.messages.create({
      body: message,
      from: TWILIO_FROM,
      to:   formatted,
    });
    console.log(`✓ Text sent to ${formatted}: ${msg.sid}`);
    return true;
  } catch(e) {
    console.error(`✗ Text failed to ${formatted}:`, e.message);
    return false;
  }
}

// ── SEND EMAIL ────────────────────────────────────────────────
async function sendEmail(to, subject, body, fromName) {
  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id:  EJS_SVC,
        template_id: EJS_TPL,
        user_id:     EJS_KEY,
        template_params: {
          to_email:   to,
          from_name:  fromName,
          from_email: to,
          phone:      '',
          buyer_type: '', assumption: '', barrier: '', credit: '',
          income: '', downpayment: '', debt: '', location: '',
          occupation: '', timeline: '', price: '', wantsReview: '',
          readiness_category: '', loan_type: '', programs: '',
          pay_without: '', pay_with: '', ai_insight: body,
          summary: subject, timestamp: new Date().toLocaleString('en-US')
        }
      })
    });
    console.log(`✓ Email sent to ${to}: ${res.status}`);
    return res.ok;
  } catch(e) {
    console.error(`✗ Email failed to ${to}:`, e.message);
    return false;
  }
}

// ── DAY CALCULATOR ────────────────────────────────────────────
function daysSince(dateStr) {
  if (!dateStr) return 999;
  const date = new Date(dateStr);
  const now  = new Date();
  return Math.floor((now - date) / (1000 * 60 * 60 * 24));
}

function isBusinessHours() {
  // 8am - 8pm Las Vegas time (Pacific)
  const now = new Date();
  const lv  = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const hour = lv.getHours();
  const day  = lv.getDay(); // 0=Sun, 6=Sat
  if (day === 0) return false; // No Sunday
  return hour >= 8 && hour < 20;
}

function isOptedOut(lead) {
  return (lead.fields['Sequence Status'] || '') === 'Opted Out';
}

function isDoNotContact(lead) {
  const status = lead.fields['Status'] || '';
  return ['Opted Out','Do Not Contact'].includes(status);
}

// ── MAIN SCHEDULER ────────────────────────────────────────────
async function runFollowUp() {
  if (!isBusinessHours()) {
    console.log('Outside business hours — skipping run');
    return;
  }

  console.log('\n═══════════════════════════════════════');
  console.log('MICB Follow Up Run —', new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  console.log('═══════════════════════════════════════');

  const leads = await getLeads();
  console.log(`Found ${leads.length} total leads`);

  for (const record of leads) {
    const f          = record.fields;
    const id         = record.id;
    const agentId    = f['Agent'] || 'marcus';
    const agent      = AGENTS[agentId] || AGENTS.marcus;
    const status     = f['Status'] || 'New';
    const seqStatus  = f['Sequence Status'] || 'Active';
    const seqDay     = parseInt(f['Sequence Day'] || '0', 10);
    const firstName  = f['First Name'] || 'there';
    const lastName   = f['Last Name']  || '';
    const phone      = (f['Phone'] || '').replace(/\D/g, '');
    const email      = f['Email'] || '';
    const timestamp  = f['Timestamp'] || '';
    const lastAuto   = f['Last Auto Contact'] || '';
    const daysSinceSubmit = daysSince(timestamp);
    const daysSinceAuto   = daysSince(lastAuto);

    const lead = {
      id, firstName, lastName, agentId,
      phone, email,
      programs:  f['Programs'] || '',
      loanPath:  f['Possible Loan'] || '',
      location:  f['Target Location'] || '',
      payWith:   f['Est With Assistance'] || '',
      readiness: f['Readiness Category'] || '',
    };

    // Skip opted out or do not contact
    if (isOptedOut(record) || isDoNotContact(record)) {
      continue;
    }

    // ── LENDER FOLLOW UP REMINDER ──────────────────────────
    if (status === 'Sent to Lender') {
      const lastLenderReminder = f['Last Lender Reminder'] || '';
      const daysSinceLender = daysSince(lastLenderReminder || timestamp);
      if (daysSinceLender >= 2) {
        const msg = SEQUENCES.agent_reminders.find(r => r.trigger === 'lender_followup');
        if (msg && agent.phone) {
          const agentPhone = agent.phone.replace(/\D/g,'');
          await sendText(agentPhone, msg.message(lead, agent));
          await patchLead(id, { 'Last Lender Reminder': new Date().toLocaleDateString('en-US') });
          console.log(`  → Lender reminder sent to ${agent.name} for ${firstName} ${lastName}`);
        }
      }
      continue;
    }

    // ── ENGAGED LEAD REMINDER (agent hasn't followed up) ──
    if (status === 'Contacted' || status === 'Replied') {
      const lastContacted = f['Last Contacted'] || timestamp;
      if (daysSince(lastContacted) >= 3) {
        const msg = SEQUENCES.agent_reminders.find(r => r.trigger === 'engaged_no_contact');
        if (msg) {
          const agentPhone = agent.phone.replace(/\D/g,'');
          await sendText(agentPhone, msg.message(lead, agent));
          // Also email agent
          await sendEmail(agent.email,
            `MICB: Follow up needed — ${firstName} ${lastName}`,
            `${firstName} ${lastName} hasn't heard from you in 3+ days. They responded to your outreach — time to follow up.\n\nDashboard: leads.maybeicanbuy.com?agent=${agentId}`,
            'Maybe I Can Buy System'
          );
          console.log(`  → Engaged reminder sent to ${agent.name} for ${firstName} ${lastName}`);
        }
      }
      continue;
    }

    // ── LONG TERM NURTURE (monthly) ────────────────────────
    if (status === 'Long Term Nurture') {
      if (daysSinceAuto >= 30) {
        const msg = SEQUENCES.nurture[0];
        if (msg && msg.approved && phone.length >= 10) {
          await sendText(phone, msg.message(lead, agent));
          await patchLead(id, {
            'Last Auto Contact': new Date().toLocaleDateString('en-US'),
            'Sequence Status':   'Nurture Active'
          });
          console.log(`  → Monthly nurture sent to ${firstName} ${lastName}`);
        }
      }

      // Check 90 days — restart sequence
      if (daysSince(f['Last Auto Contact'] || timestamp) >= 90) {
        await patchLead(id, {
          'Status':          'New',
          'Sequence Status': 'Active',
          'Sequence Day':    '0',
          'Last Auto Contact': ''
        });
        console.log(`  → Sequence restarted for ${firstName} ${lastName} (90 days inactive)`);
      }
      continue;
    }

    // ── SKIP LEADS IN ACTIVE PIPELINE ─────────────────────
    if (['Sent to Lender','Path Being Built','Pre-Approved','Closed'].includes(status)) {
      continue;
    }

    // ── SKIP IF SEQUENCE PAUSED ───────────────────────────
    if (seqStatus === 'Paused') {
      continue;
    }

    // ── NEW LEAD SEQUENCE ─────────────────────────────────
    if (seqStatus === 'Active' || !seqStatus) {
      // Find which message to send based on days since submission
      const sequence = SEQUENCES.new_lead;
      let messageSent = false;

      for (const step of sequence) {
        if (!step.approved) continue;

        // Check if this is the right day
        const targetDay = step.day;
        const alreadySent = seqDay > targetDay;
        const readyToSend = daysSinceSubmit >= targetDay && daysSinceAuto < targetDay;

        if (alreadySent) continue;
        if (daysSinceSubmit < targetDay) continue;
        if (daysSinceAuto !== 0 && daysSince(lastAuto) < 1) continue;

        if (step.type === 'text' && phone.length >= 10) {
          const sent = await sendText(phone, step.message(lead, agent));
          if (sent) {
            await patchLead(id, {
              'Sequence Day':      String(targetDay + 1),
              'Last Auto Contact': new Date().toLocaleDateString('en-US'),
              'Sequence Status':   'Active'
            });
            console.log(`  → Day ${targetDay} text sent to ${firstName} ${lastName}`);
            messageSent = true;
            break;
          }
        }

        if (step.type === 'email' && email) {
          const subj = step.subject(lead, agent);
          const body = step.message(lead, agent);
          const sent = await sendEmail(email, subj, body, agent.name);
          if (sent) {
            await patchLead(id, {
              'Sequence Day':      String(targetDay + 1),
              'Last Auto Contact': new Date().toLocaleDateString('en-US'),
              'Sequence Status':   'Active'
            });
            console.log(`  → Day ${targetDay} email sent to ${firstName} ${lastName}`);
            messageSent = true;
            break;
          }
        }
      }

      // Sequence complete — move to nurture
      if (!messageSent && daysSinceSubmit > 30 && seqDay > 0) {
        await patchLead(id, {
          'Status':          'Long Term Nurture',
          'Sequence Status': 'Nurture Active',
          'Sequence Day':    '0'
        });
        console.log(`  → ${firstName} ${lastName} moved to Long Term Nurture`);
      }
    }
  }

  console.log('\nRun complete —', new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  console.log('═══════════════════════════════════════\n');
}

// ── TWILIO INCOMING TEXT HANDLER (opt-out + response detection) ──
// This runs as a webhook — Twilio calls this URL when a text comes in
async function handleIncomingText(req, res) {
  const from    = req.body.From || '';
  const body    = (req.body.Body || '').trim().toUpperCase();

  // Handle opt-out
  if (['STOP','UNSUBSCRIBE','CANCEL','QUIT','END'].includes(body)) {
    const leads = await getLeads();
    const match = leads.find(r => {
      const p = (r.fields['Phone'] || '').replace(/\D/g,'');
      const f = from.replace(/\D/g,'');
      return p === f || p === f.slice(1);
    });
    if (match) {
      await patchLead(match.id, {
        'Status':          'Opted Out',
        'Sequence Status': 'Opted Out'
      });
      console.log(`✓ Opted out: ${from}`);
    }
    return res ? res.send('<Response><Message>You have been unsubscribed. Reply START to resubscribe.</Message></Response>') : null;
  }

  // Handle response — pause sequence, notify agent
  const leads = await getLeads();
  const match = leads.find(r => {
    const p = (r.fields['Phone'] || '').replace(/\D/g,'');
    const f = from.replace(/\D/g,'');
    return p === f || p === f.slice(1);
  });

  if (match) {
    const agentId = match.fields['Agent'] || 'marcus';
    const agent   = AGENTS[agentId] || AGENTS.marcus;
    const name    = (match.fields['First Name'] || '') + ' ' + (match.fields['Last Name'] || '');

    // Pause sequence
    await patchLead(match.id, {
      'Sequence Status': 'Paused',
      'Status':          'Replied'
    });

    // Notify agent via text
    const agentPhone = agent.phone.replace(/\D/g,'');
    await sendText(agentPhone,
      `MICB ALERT: ${name.trim()} just replied to your follow up text! Log in to respond: leads.maybeicanbuy.com?agent=${agentId}`
    );

    // Notify agent via email
    await sendEmail(agent.email,
      `MICB: ${name.trim()} replied to your text`,
      `${name.trim()} just responded to your automated follow up.\n\nTheir message: "${req.body.Body}"\n\nLog into your dashboard to follow up:\nleads.maybeicanbuy.com?agent=${agentId}\n\nThe automated sequence has been paused for this lead.`,
      'Maybe I Can Buy System'
    );

    // Notify Marcus
    if (agentId !== 'marcus') {
      await sendEmail('berryhomeslv@gmail.com',
        `MICB: ${name.trim()} replied to ${agent.name}`,
        `${name.trim()} replied to ${agent.name}'s follow up text.\n\nMessage: "${req.body.Body}"\n\nAgent dashboard: leads.maybeicanbuy.com?agent=${agentId}`,
        'Maybe I Can Buy System'
      );
    }

    console.log(`✓ Response from ${from} — sequence paused, ${agent.name} notified`);
  }

  if (res) res.send('<Response></Response>');
}

// ── START ─────────────────────────────────────────────────────
// Run every hour Mon-Sat 8am-8pm Las Vegas time
// Cron: minute hour * * day (0=Sun, 6=Sat, 1-6=Mon-Sat)
cron.schedule('0 * * * 1-6', runFollowUp, {
  timezone: 'America/Los_Angeles'
});

// Also run once on startup to catch any missed messages
console.log('MICB Follow Up System starting...');
runFollowUp();

// Export for webhook handler (used if deploying with Express)
module.exports = { runFollowUp, handleIncomingText };
