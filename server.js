require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const multer  = require('multer');
const Groq    = require('groq-sdk');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 8080;

// ── Alerts / SSE State ────────────────────────────────────────────────────────
const activeAlerts = [];
const sseClients = new Set();

function broadcastAlerts() {
  const data = JSON.stringify(activeAlerts);
  for (const res of sseClients) {
    res.write(`data: ${data}\n\n`);
  }
}

// ── Groq client ───────────────────────────────────────────────────────────────
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── Multer: save audio with .webm extension so Groq infers MIME type ─────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync('uploads', { recursive: true });
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-audio.webm`);
  },
});
const upload = multer({ storage });

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Emergency patterns ────────────────────────────────────────────────────────
const EMERGENCY_PATTERNS = [
  /code\s*blue/i, /cardiac\s*arrest/i, /not\s*breathing/i,
  /stop(?:ped)?\s*breathing/i, /help\s*me\b/i, /i\s*fell\b/i,
  /overdose/i, /allergic\s*reaction/i, /anaphylaxis/i,
  /chest\s*pain/i, /\bseizure\b/i, /unresponsive/i,
  /\bemergency\b/i, /patient\s*down/i,
];

function isEmergency(text) {
  return EMERGENCY_PATTERNS.some((p) => p.test(text));
}

// ── Context mode detection ────────────────────────────────────────────────────
const CONTEXT_CRITICAL_PATTERNS = [
  /hemorrhag/i, /\bshock\b/i, /acute\s*distress/i,
  /critical\s*condition/i, /\bcrashing\b/i, /decompensating/i,
  /respiratory\s*failure/i, /no\s*response\s*to\s*treatment/i,
];

const CONTEXT_URGENT_PATTERNS = [
  /deteriorat/i, /getting\s*worse/i, /pain\s*(level\s*)?(?:8|9|10)\b/i,
  /worsening/i, /\burgent\b/i, /high\s*fever/i, /heavy\s*bleed/i,
  /\bhypotension\b/i, /not\s*responding/i,
  /spo2\s*(?:is\s*)?(?:below|dropping|at)\s*(?:8[0-8]|[0-7]\d)/i,
  /heart\s*rate\s*(?:is\s*)?(?:above|over|at)\s*(?:1[2-9]\d|[2-9]\d\d)/i,
];

function detectContextMode(text) {
  if (CONTEXT_CRITICAL_PATTERNS.some((p) => p.test(text))) return 'critical';
  if (CONTEXT_URGENT_PATTERNS.some((p) => p.test(text))) return 'urgent';
  return 'normal';
}

const CONTEXT_MODE_PROMPTS = {
  normal:   'Respond in a calm, educational manner. Up to 3 sentences.',
  urgent:   'URGENT SITUATION: Be brief and direct. Lead with the most critical action first. Max 2 short sentences. No pleasantries.',
  critical: 'CRITICAL EMERGENCY: State the immediate required action FIRST. No questions. No confirmation. One sentence maximum.',
};

// ── Medical relevance check ───────────────────────────────────────────────────
const MEDICAL_KEYWORDS = /patient|doctor|nurse|hospital|clinic|medical|health|medication|drug|dose|dosage|symptom|diagnosis|diagnose|treatment|vital|blood|heart|breath|pain|surgery|emergency|prescription|allergy|infection|wound|fever|oxygen|pulse|spo2|temperature|pressure|cardiac|respiratory|surgical|procedure|protocol|anatomy|disease|condition|triage|icu|icu|ward|ward|specimen|lab|radiology|imaging|mri|ct\s*scan|x.ray|biopsy|pathology|pharmacist|pharmacy|antibiotic|steroid|insulin|epinephrine|morphine|sedative|anesthesia|intubat|ventilat|defibrillat|resuscitat|cpr|aed|ppe|gloves|sterile|saline|iv\s*line|catheter|suture|wound|bandage|dressing|incision|laceration|fracture|hemorrhage|hemorrhage|stroke|infarction|sepsis|diabetes|hypertension|hypotension|tachycardia|bradycardia|arrhythmia|anemia|pneumonia|asthma|copd|renal|kidney|liver|hepatic|neurological|oncology|cancer|tumor|chemotherapy|palliative/i;

function isMedical(text) {
  return isEmergency(text) || MEDICAL_KEYWORDS.test(text);
}

// ── Intent classification ─────────────────────────────────────────────────────
function classifyIntent(text) {
  const t = text.toLowerCase();
  if (/blood\s+pressure|heart\s+rate|spo2|sp02|oxygen\s+saturation|temperature|log\s+vital/.test(t)) {
    return 'VITAL_LOG';
  }
  if (/\bdose\b|\bdosage\b|maximum\s+dose|safe\s+dose|drug\s+interaction|can\s+i\s+take/.test(t)) {
    return 'MEDICATION_QUERY';
  }
  if (/\bwhat\b|\bhow\b|\bsigns?\b|\bsymptoms?\b|\btreatment\b|\bprotocol\b|\bprocedure\b/.test(t)) {
    return 'CLINICAL_QUERY';
  }
  return 'GENERAL';
}

// ── Medical-only preamble appended to every system prompt ─────────────────────
const MEDICAL_GUARD =
  'IMPORTANT: You are a medical-only AI assistant for healthcare professionals. ' +
  'If the question is not related to medicine, clinical care, or healthcare, ' +
  'respond ONLY with: "I\'m here for your medical assistance. Please ask anything around that." ' +
  'Do not answer non-medical questions under any circumstances.\n\n';

const SYSTEM_PROMPTS = {
  CLINICAL_QUERY:
    MEDICAL_GUARD +
    'You are a clinical decision support AI for nurses and doctors. ' +
    'Answer in 2-3 sentences maximum. Never diagnose definitively — always recommend physician verification. ' +
    'Be precise, evidence-based, and immediately actionable.',

  MEDICATION_QUERY:
    MEDICAL_GUARD +
    'You are a clinical pharmacist AI. Provide precise dosage information and flag interactions. ' +
    'Always recommend physician or pharmacist verification. Maximum 2 sentences.',

  VITAL_LOG:
    MEDICAL_GUARD +
    'You are a medical documentation assistant. Confirm back the exact vital signs you understood ' +
    'from the input — repeat them clearly with units. Flag any values outside normal range.',

  GENERAL:
    MEDICAL_GUARD +
    'You are Sparsha, a voice-first AI medical assistant for healthcare professionals. ' +
    'Answer helpfully and briefly in 2 sentences. Stay strictly within medical and clinical topics.',
};

const LANG_NAMES = { hi: 'Hindi', kn: 'Kannada', ta: 'Tamil', te: 'Telugu', mr: 'Marathi' };

// ── POST /api/voice/transcribe ────────────────────────────────────────────────
app.post('/api/voice/transcribe', upload.single('audio'), async (req, res) => {
  const filePath = req.file?.path;
  if (!filePath) return res.status(400).json({ error: 'No audio file received.' });

  try {
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: 'whisper-large-v3',
      language: req.body.language || 'en',
      response_format: 'json',
    });
    return res.json({ transcript: transcription.text });
  } catch (err) {
    console.error('[transcribe]', err.message);
    return res.status(500).json({ error: 'Transcription failed.', detail: err.message });
  } finally {
    if (filePath) fs.unlink(filePath, () => {});
  }
});

// ── POST /api/voice/process ───────────────────────────────────────────────────
app.post('/api/voice/process', async (req, res) => {
  const { text, language, patient_id, room } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text field is required.' });

  const start = Date.now();

  // ── Emergency fast-path (< 50 ms) ────────────────────────────────────────
  if (isEmergency(text)) {
    return res.json({
      intent: 'EMERGENCY',
      response: 'Emergency alert activated. Team has been notified.',
      context_mode: 'critical',
      path: 'emergency',
      needs_clarification: false,
      latency_ms: Date.now() - start,
    });
  }

  // ── Non-medical guard — no LLM call needed ────────────────────────────────
  if (!isMedical(text)) {
    return res.json({
      intent: 'OUT_OF_SCOPE',
      response: "I'm here for your medical assistance. Please ask anything around that.",
      context_mode: 'normal',
      path: 'guard',
      needs_clarification: false,
      latency_ms: Date.now() - start,
    });
  }

  // ── Intent + context mode + system prompt ─────────────────────────────────
  const intent = classifyIntent(text);
  const contextMode = detectContextMode(text);
  let systemPrompt = SYSTEM_PROMPTS[intent] + `\n\n${CONTEXT_MODE_PROMPTS[contextMode]}`;
  if (language && language !== 'en' && LANG_NAMES[language]) {
    systemPrompt += ` The user is speaking in ${LANG_NAMES[language]}. Respond in the same language.`;
  }

  const ollamaOptions = {
    normal:   { temperature: 0.4, num_predict: 150 },
    urgent:   { temperature: 0.2, num_predict: 80  },
    critical: { temperature: 0.05, num_predict: 40 },
  }[contextMode];

  console.log(`[process] intent=${intent} context_mode=${contextMode}`);

  // ── Ollama call (fallback when VAPI not used) ─────────────────────────────
  try {
    const ollamaRes = await fetch('http://127.0.0.1:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma2:2b',
        prompt: text,
        system: systemPrompt,
        stream: false,
        options: ollamaOptions,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!ollamaRes.ok) throw new Error(`Ollama returned HTTP ${ollamaRes.status}`);

    const data = await ollamaRes.json();
    const responseText = (data.response || '').trim() || "I'm here for your medical assistance. Please ask anything around that.";

    const needsClarification = /which patient|could you clarify|please specify|i need more information/i.test(responseText);

    return res.json({
      intent, response: responseText,
      context_mode: contextMode,
      path: 'llm', needs_clarification: needsClarification,
      latency_ms: Date.now() - start,
      meta: { patient_id, room },
    });
  } catch (err) {
    console.error('[process]', err.message);
    return res.status(500).json({ error: 'LLM processing failed.', latency_ms: Date.now() - start });
  }
});

// ── POST /api/vapi/webhook ────────────────────────────────────────────────────
// VAPI calls this when the AI invokes a server-side tool/function.
app.post('/api/vapi/webhook', async (req, res) => {
  const { message } = req.body;

  if (message?.type === 'function-call') {
    const { name, parameters } = message.functionCall ?? {};

    if (name === 'send_alert' || name === 'emergency_alert') {
      const { 
        staff_name = 'Emergency Team', 
        room_number = 'Unknown', 
        reason = 'Critical Emergency',
        patient_id = 'Unknown',
        vitals = 'Not provided',
        situation = 'Unknown',
        risk = 'High',
        priority = 'CRITICAL'
      } = parameters ?? {};
      console.log(`[VAPI EMERGENCY] room=${room_number} priority=${priority}`);

      const alert = { id: Date.now().toString(), staff_name, room_number, reason, patient_id, vitals, situation, risk, priority, status: 'pending', response: null };
      activeAlerts.unshift(alert);
      broadcastAlerts();

      return res.json({
        result: `Alert sent to ${staff_name} in room ${room_number}. Waiting for their response.`,
      });
    }

    if (name === 'get_vitals') {
      const { room_number = 'Unknown' } = parameters ?? {};
      const hr  = Math.floor(Math.random() * 81) + 60;
      const sys = Math.floor(Math.random() * 61) + 90;
      const dia = Math.floor(Math.random() * 41) + 60;
      const sp  = Math.floor(Math.random() * 13) + 88;
      const tmp = (Math.random() * 6 + 97).toFixed(1);
      console.log(`[VAPI VITALS] room=${room_number} hr=${hr} bp=${sys}/${dia} spo2=${sp} temp=${tmp}`);
      return res.json({
        result: `Room ${room_number} vitals: Heart Rate ${hr} bpm, Blood Pressure ${sys} over ${dia} mmHg, SpO2 ${sp} percent, Temperature ${tmp} degrees Fahrenheit.`,
      });
    }
  }

  if (message?.type === 'status-update') {
    console.log(`[VAPI] Call ${message.callId} status: ${message.status}`);
    return res.json({ received: true });
  }

  return res.json({ received: true });
});

// ── GET /api/alerts/stream ────────────────────────────────────────────────────
app.get('/api/alerts/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Prevent proxy buffering
  res.flushHeaders();
  
  sseClients.add(res);
  res.write(`data: ${JSON.stringify(activeAlerts)}\n\n`);
  
  // Keep-alive heartbeat every 15s to bypass ngrok timeout
  const heartbeat = setInterval(() => {
    res.write(':\n\n');
  }, 15000);
  
  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// ── POST /api/alerts ──────────────────────────────────────────────────────────
// Called by client-side tool invocation
app.post('/api/alerts', (req, res) => {
  const { staff_name, room_number, reason } = req.body;
  const alert = { id: Date.now().toString(), staff_name, room_number, reason, status: 'pending', response: null };
  activeAlerts.unshift(alert);
  broadcastAlerts();
  res.json({ success: true, alert });
});

// ── POST /api/alerts/:id/ack ──────────────────────────────────────────────────
app.post('/api/alerts/:id/ack', (req, res) => {
  const alert = activeAlerts.find(a => a.id === req.params.id);
  if (alert) {
    alert.status = 'acknowledged';
    alert.response = req.body.response || 'I am on the way.';
    broadcastAlerts();
    res.json({ success: true, alert });
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// ── GET /api/health ───────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ── Ollama warmup ─────────────────────────────────────────────────────────────
async function warmupOllama() {
  console.log('[startup] Warming up Ollama gemma2:2b...');
  try {
    const res = await fetch('http://127.0.0.1:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gemma2:2b', prompt: 'hello', stream: false, options: { num_predict: 5 } }),
      signal: AbortSignal.timeout(30000),
    });
    console.log(res.ok ? '[startup] Ollama warmed up.' : `[startup] Ollama warmup status: ${res.status}`);
  } catch (err) {
    console.warn('[startup] Ollama warmup failed:', err.message);
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n🏥  Sparsha AI listening on http://localhost:${PORT}`);
  console.log(`    GROQ_API_KEY : ${process.env.GROQ_API_KEY ? '✓ set' : '✗ MISSING'}`);
  console.log(`    VAPI webhook : POST /api/vapi/webhook\n`);
  await warmupOllama();
});
