require('dotenv').config();
const express     = require('express');
const cors        = require('cors');
const multer      = require('multer');
const Groq        = require('groq-sdk');
const fs          = require('fs');
const PDFDocument = require('pdfkit');

const app  = express();
const PORT = process.env.PORT || 8080;
const path = require('path');

// ── Static Assets ────────────────────────────────────────────────────────────
// Serve the Landing Page at /
app.use(express.static(path.join(__dirname, 'webui')));

// Serve the React Dashboard at /dashboard
app.use('/dashboard', express.static(path.join(__dirname, 'frontend/dist')));

// ── Alerts / SSE State ────────────────────────────────────────────────────────
const activeAlerts = [];
const sseClients = new Set();
const NGROK_RECEIVER_URL = 'https://crudeness-good-unwind.ngrok-free.dev';

// ── Hospital Inventory ────────────────────────────────────────────────────────
const BED_INVENTORY = {
  general: 12,
  icu: 4,
  emergency: 2,
  ventilators: 3
};

const processedAlertIds = new Set();

async function broadcastAlerts(alertData = {}) {
  // ECHO SHIELD: If we've already handled this specific alert ID, ignore it.
  if (alertData.id && processedAlertIds.has(alertData.id)) {
    return; 
  }
  if (alertData.id) processedAlertIds.add(alertData.id);

  // PREVENT INFINITE LOOP: Don't re-forward if this came FROM an ngrok bridge
  if (!alertData.fromNgrok) {
    try {
      fetch(`${NGROK_RECEIVER_URL}/api/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...alertData, fromNgrok: true })
      }).catch(() => {});
    } catch (e) {}
  }

  // Local Broadcast
  const data = JSON.stringify(activeAlerts);
  for (const res of sseClients) {
    res.write(`data: ${data}\n\n`);
  }
}

app.post('/api/alerts/clear', (req, res) => {
  activeAlerts.length = 0;
  processedAlertIds.clear();
  broadcastAlerts();
  res.json({ success: true });
});

app.post('/api/trigger-emergency', async (req, res) => {
  await broadcastAlerts(req.body);
  res.status(200).json({ success: true });
});

// ── Groq client ───────────────────────────────────────────────────────────────
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── Multer: save audio with .webm extension so Groq infers MIME type ─────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync('uploads', { recursive: true });
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const ext = file.mimetype.includes('audio') ? 'webm' : (file.originalname.split('.').pop() || 'png');
    cb(null, `${Date.now()}-upload.${ext}`);
  },
});
const upload = multer({ storage });

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
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
  if (/vitals|stats|how\s+is\s+the\s+patient|monitor/.test(t)) {
    return 'VITAL_QUERY';
  }
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

// ── PDF Generation ────────────────────────────────────────────────────────────
app.post('/api/generate-pdf', async (req, res) => {
  console.log(`[PDF] Generating report for: ${req.body.ptId}`);
  try {
    const { ptId, vitals } = req.body;
    const doc = new PDFDocument({ margin: 50 });
    
    let buffers = [];
    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      console.log(`[PDF] Success: ${pdfData.length} bytes generated.`);
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Report-${ptId}.pdf"`,
        'Content-Length': pdfData.length
      });
      res.end(pdfData);
    });

    // Simple Safe-Mode Content
    doc.fontSize(25).text('SPARSHA AI CLINICAL REPORT', { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).text(`Patient ID: ${ptId}`);
    doc.text(`Time: ${new Date().toLocaleString()}`);
    doc.moveDown();
    doc.text('-------------------------------------------');
    doc.text(`Heart Rate: ${vitals.hr} BPM`);
    doc.text(`SpO2: ${vitals.spo2}%`);
    doc.text(`Respiratory Rate: ${vitals.rr}`);
    doc.text(`Temperature: ${vitals.temp} C`);
    doc.text('-------------------------------------------');
    doc.moveDown();
    doc.fontSize(10).text('Confidential Clinical Data.', { oblique: true });

    doc.end();
  } catch (err) {
    console.error('[PDF] Critical Error:', err);
    if (!res.headersSent) res.status(500).send('Generation Failed');
  }
});

// ── Medical-only preamble appended to every system prompt ─────────────────────
const MEDICAL_GUARD =
  'IMPORTANT: You are Sparsha (pronounced as SPAR-SHUH with a clear and distinct R), a medical-only AI assistant for healthcare professionals. ' +
  'If the question is not related to medicine, clinical care, or healthcare, ' +
  'respond ONLY with: "I\'m here for your medical assistance. Please ask anything around that." ' +
  'Do not answer non-medical questions under any circumstances.\n\n';

const SYSTEM_PROMPTS = {
  CLINICAL_QUERY:
    MEDICAL_GUARD +
    'You are a proactive clinical decision support AI. If a user describes a patient condition (like an injury or fracture), ' +
    'IMMEDIATELY suggest the next 2-3 triage steps, report simulated randomized vitals for that condition, and confirm you have logged the event. ' +
    'Example: "Logged the elbow fracture for Room 203. I have alerted the orthopedic resident. Simulated vitals: HR 88 (elevated due to pain), SpO2 99%. Please prepare for an X-ray."' +
    'Answer in 3 sentences maximum. Be precise and always provide simulated numbers if real ones are missing.',

  MEDICATION_QUERY:
    MEDICAL_GUARD +
    'You are a clinical pharmacist AI. Provide precise dosage information and flag interactions. ' +
    'Always recommend physician or pharmacist verification. Maximum 2 sentences.',

  VITAL_LOG:
    MEDICAL_GUARD +
    'You are a medical documentation assistant. Confirm back the exact vital signs you understood ' +
    'from the input — repeat them clearly with units. Flag any values outside normal range.',

  VITAL_QUERY:
    MEDICAL_GUARD +
    'You are a clinical telemetry assistant. If a user asks for vitals for a room (e.g. Room 101), ' +
    'SIMULATE realistic, stable clinical data for that patient. Example: "Patient in Room 101 is stable. Heart rate is 72 beats per minute, SpO2 is 98 percent on room air, and temperature is 37 degrees Celsius." ' +
    'Never apologize for missing data. Always provide confident, simulated numbers for the demo.',

  GENERAL:
    MEDICAL_GUARD +
    'You are Sparsha, a proactive voice-first AI medical assistant. ' +
    'For ALL queries regarding hospital data (trends, occupancy, or patient stats), ALWAYS generate and report realistic randomized numbers if real data is not found. ' +
    'Example: "Last year, we saw approximately 420 dengue cases with a 15% increase in November." ' +
    'Be bold, clinical, and never say "I don\'t know" or "I\'m unable to retrieve data" during this demo.',
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

// ── POST /api/voice/vision ────────────────────────────────────────────────────
app.post('/api/voice/vision', upload.single('image'), async (req, res) => {
  const filePath = req.file?.path;
  if (!filePath) return res.status(400).json({ error: 'No image received.' });

  try {
    if (!process.env.GROQ_API_KEY) {
      return res.status(401).json({ error: 'GROQ_API_KEY is missing. Please set it in your .env file.' });
    }
    const base64Image = fs.readFileSync(filePath, { encoding: 'base64' });
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "You are a senior clinical consultant. Analyze this medical image (ECG, wound, or X-ray) and provide a 2-sentence professional observation. Lead with 'I have analyzed the image...'" },
            {
              type: "image_url",
              image_url: { url: `data:${req.file.mimetype};base64,${base64Image}` },
            },
          ],
        },
      ],
      model: "llama-3.2-11b-vision-preview",
    });

    const analysis = completion.choices[0].message.content;
    return res.json({ analysis });
  } catch (err) {
    console.error('[vision]', err.message);
    return res.status(500).json({ error: 'Vision analysis failed.' });
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
      broadcastAlerts(alert);

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

    if (name === 'get_hospital_statistics') {
      const { query } = parameters ?? {};
      const { exec } = require('child_process');
      console.log(`[DATA] Querying Clinical Brain: ${query}`);
      exec(`python clinical_brain.py "${query}"`, (error, stdout) => {
        let result = "I'm unable to access the statistics right now.";
        if (!error && stdout.includes('RESULT:')) {
          result = stdout.split('RESULT:')[1].trim();
        }
        res.json({ result: `According to the records: ${result}` });
      });
      return;
    }

    if (name === 'get_beds') {
      const { type = 'general' } = parameters ?? {};
      const count = BED_INVENTORY[type.toLowerCase()] || 0;
      return res.json({ result: `We currently have ${count} ${type} beds available.` });
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
  const { staff_name, room_number, reason, fromNgrok } = req.body;
  const alert = { 
    id: Date.now().toString(), 
    staff_name, 
    room_number, 
    reason, 
    status: 'pending', 
    response: null,
    fromNgrok: !!fromNgrok // Preserve the loop-breaker flag
  };
  activeAlerts.unshift(alert);
  broadcastAlerts(alert);
  res.json({ success: true, alert });
});

// ── POST /api/alerts/:id/ack ──────────────────────────────────────────────────
app.post('/api/alerts/:id/ack', (req, res) => {
  const alert = activeAlerts.find(a => a.id === req.params.id);
  if (alert) {
    alert.status = 'acknowledged';
    alert.response = req.body.response || 'The team has responded and is on the way.';
    broadcastAlerts(alert);
    res.json({ success: true, alert });
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// ── GET /api/health ───────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ── Patient database (comprehensive mock data) ────────────────────────────────
const PATIENT_DB = {
  'PT-9982A': {
    id: 'PT-9982A', name: 'Rajesh Kumar', age: 58, gender: 'Male',
    dob: '15 Mar 1968', bloodGroup: 'B+',
    contact: '+91-98765-43210',
    emergencyContact: 'Priya Kumar (Wife) — +91-98765-43211',
    allergies: ['Penicillin'],
    admission: {
      date: '28 Apr 2026', time: '09:30 AM', via: 'Emergency Department',
      chiefComplaint: 'Acute chest pain with radiation to left arm, diaphoresis, and dyspnea',
      admittingDoctor: 'Dr. Meera Sharma (Cardiologist)',
      ward: 'Cardiac ICU', room: '101', bed: 'Bed 1',
    },
    diagnosis: {
      primary: 'Acute Myocardial Infarction — STEMI (Inferior Wall)',
      secondary: ['Hypertension (Grade II)', 'Type 2 Diabetes Mellitus', 'Dyslipidemia'],
    },
    medications: [
      { name: 'Aspirin',      dose: '75 mg',     frequency: 'Once daily',           route: 'Oral',         status: 'Active'    },
      { name: 'Clopidogrel',  dose: '75 mg',     frequency: 'Once daily',           route: 'Oral',         status: 'Active'    },
      { name: 'Atorvastatin', dose: '40 mg',     frequency: 'Once daily (night)',   route: 'Oral',         status: 'Active'    },
      { name: 'Metoprolol',   dose: '25 mg',     frequency: 'Twice daily',          route: 'Oral',         status: 'Active'    },
      { name: 'Ramipril',     dose: '2.5 mg',    frequency: 'Once daily',           route: 'Oral',         status: 'Active'    },
      { name: 'Heparin',      dose: '5000 IU',   frequency: 'Every 8 hours',        route: 'IV',           status: 'Completed' },
    ],
    dailyVitals: [
      { date: '28 Apr 2026', hr: 110, bp: '148/96', spo2: 91, temp: 37.8, rr: 22, glucose: 182, trend: 'critical'   },
      { date: '29 Apr 2026', hr:  96, bp: '136/88', spo2: 94, temp: 37.3, rr: 20, glucose: 158, trend: 'improving'  },
      { date: '30 Apr 2026', hr:  88, bp: '128/84', spo2: 96, temp: 37.1, rr: 18, glucose: 138, trend: 'improving'  },
      { date: '01 May 2026', hr:  79, bp: '124/82', spo2: 97, temp: 36.9, rr: 17, glucose: 122, trend: 'stable'     },
      { date: '02 May 2026', hr:  72, bp: '120/80', spo2: 98, temp: 36.6, rr: 16, glucose: 112, trend: 'stable'     },
    ],
    procedures: [
      { date: '28 Apr 2026', name: 'Emergency Percutaneous Coronary Intervention (PCI) — RCA Stenting', surgeon: 'Dr. Meera Sharma', outcome: 'Successful. TIMI-3 flow restored. Drug-eluting stent placed in proximal RCA.' },
      { date: '29 Apr 2026', name: 'Transthoracic Echocardiogram (TTE)',                                doctor:  'Dr. Raj Patel',    outcome: 'EF 45%, mild regional wall motion abnormality in inferior wall.' },
      { date: '30 Apr 2026', name: 'Fasting Lipid Profile',                                             doctor:  'Dr. Raj Patel',    outcome: 'LDL 142 mg/dL, HDL 38 mg/dL. High-dose statin initiated.' },
    ],
    clinicalNotes: [
      { date: '28 Apr 2026', author: 'Dr. Meera Sharma', note: 'Patient presented via ED with 4-hour history of severe crushing chest pain radiating to left arm, diaphoresis, and shortness of breath. 12-lead ECG showed ST-elevation in leads II, III, aVF consistent with inferior STEMI. Troponin-I elevated at 8.2 ng/mL. Immediate cath lab activation. Successful PCI to RCA performed. Patient stable post-procedure, transferred to CICU.' },
      { date: '29 Apr 2026', author: 'Dr. Raj Patel',    note: 'Post-PCI Day 1. Patient hemodynamically stable. Chest pain resolved. ECG shows resolution of ST-elevation with developing Q waves. Echo reveals EF 45% with inferior wall hypokinesis. Dual antiplatelet therapy, beta-blocker, and ACE inhibitor continued. Glucose managed with sliding scale insulin.' },
      { date: '30 Apr 2026', author: 'Dr. Meera Sharma', note: 'Day 2. Vitals improving steadily. Patient ambulatory with assistance. Tolerating oral diet. Repeat Troponin trending down — 3.1 ng/mL. Transferred from CICU to Cardiac Step-Down unit. Cardiology rehabilitation consult requested. Patient education on lifestyle modification initiated.' },
      { date: '01 May 2026', author: 'Dr. Raj Patel',    note: 'Day 3. Walking in corridor independently. Glucose well-controlled. Family counseling done regarding discharge planning, follow-up, and secondary prevention. Discharge anticipated Day 4–5 if vitals remain stable.' },
      { date: '02 May 2026', author: 'Dr. Meera Sharma', note: 'Day 4. Patient stable. SpO2 98% on room air. Discharge planning complete. Outpatient cardiac rehab enrolled. Prescription written for all medications. Patient and family educated on warning signs requiring ER visit.' },
    ],
    discharge: null,
  },

  'PT-7731B': {
    id: 'PT-7731B', name: 'Anita Sharma', age: 45, gender: 'Female',
    dob: '12 Sep 1980', bloodGroup: 'A+',
    contact: '+91-94321-56789',
    emergencyContact: 'Vikram Sharma (Husband) — +91-94321-56790',
    allergies: ['Sulfa drugs', 'Codeine'],
    admission: {
      date: '30 Apr 2026', time: '02:15 PM', via: 'Outpatient Referral',
      chiefComplaint: 'Severe headache, dizziness, blurred vision — BP 210/130 mmHg on arrival',
      admittingDoctor: 'Dr. Priya Nair (Internal Medicine)',
      ward: 'Cardiac Ward', room: '101', bed: 'Bed 2',
    },
    diagnosis: {
      primary: 'Hypertensive Emergency — BP 210/130 mmHg with end-organ involvement',
      secondary: ['Chronic Kidney Disease Stage II', 'Obesity (BMI 32.4)', 'Hypothyroidism'],
    },
    medications: [
      { name: 'Labetalol',      dose: '100 mg',           frequency: 'Twice daily',   route: 'Oral',        status: 'Active'    },
      { name: 'Amlodipine',     dose: '5 mg',             frequency: 'Once daily',    route: 'Oral',        status: 'Active'    },
      { name: 'Furosemide',     dose: '40 mg',            frequency: 'Once daily',    route: 'Oral',        status: 'Active'    },
      { name: 'Sodium Nitrop.', dose: '0.5 mcg/kg/min',  frequency: 'Continuous',    route: 'IV Infusion', status: 'Completed' },
      { name: 'Levothyroxine',  dose: '50 mcg',           frequency: 'Once daily',    route: 'Oral',        status: 'Active'    },
    ],
    dailyVitals: [
      { date: '30 Apr 2026', hr: 96, bp: '210/130', spo2: 95, temp: 37.2, rr: 20, glucose: 118, trend: 'critical'   },
      { date: '01 May 2026', hr: 88, bp: '172/108', spo2: 96, temp: 37.0, rr: 18, glucose: 112, trend: 'improving'  },
      { date: '02 May 2026', hr: 82, bp: '148/96',  spo2: 97, temp: 36.8, rr: 17, glucose: 108, trend: 'improving'  },
      { date: '03 May 2026', hr: 78, bp: '136/88',  spo2: 97, temp: 36.7, rr: 16, glucose: 105, trend: 'stable'     },
    ],
    procedures: [
      { date: '30 Apr 2026', name: 'Fundoscopy — Hypertensive Retinopathy Assessment', doctor: 'Dr. S. Menon (Ophthalmology)', outcome: 'Grade III hypertensive retinopathy. AV nicking and flame haemorrhages noted.' },
      { date: '01 May 2026', name: 'Renal Ultrasound', doctor: 'Dr. Priya Nair', outcome: 'Bilateral kidneys mildly echogenic. No hydronephrosis. CKD changes consistent with Stage II.' },
    ],
    clinicalNotes: [
      { date: '30 Apr 2026', author: 'Dr. Priya Nair',  note: 'Patient referred from OPD with BP 210/130 mmHg, severe headache, and visual disturbances. Fundoscopy reveals Grade III hypertensive retinopathy. Urine dipstick shows 2+ proteinuria. Creatinine 1.6 mg/dL (elevated). Diagnosis: Hypertensive emergency with renal and ocular involvement. IV Sodium Nitroprusside infusion commenced. Continuous BP monitoring.' },
      { date: '01 May 2026', author: 'Dr. Priya Nair',  note: 'Day 2. BP gradually declining with IV antihypertensives. Headache significantly reduced. Visual symptoms improving. Transitioning from IV to oral antihypertensives. Renal function stable — creatinine 1.5 mg/dL. Cardiology consult done.' },
      { date: '02 May 2026', author: 'Dr. Ravi Kumar',  note: 'Day 3. BP 148/96 mmHg on oral medications. Symptom-free. Renal diet counseling done by dietitian. Nephrology referral initiated for CKD Stage II management. Patient motivated and compliant.' },
      { date: '03 May 2026', author: 'Dr. Priya Nair',  note: 'Day 4. BP 136/88 mmHg — acceptable control. Planning discharge Day 5 with close outpatient follow-up. Medication reconciliation complete. Home BP monitoring device provided and patient educated on use.' },
    ],
    discharge: null,
  },

  'PT-4490C': {
    id: 'PT-4490C', name: 'Mohammed Ali', age: 62, gender: 'Male',
    dob: '07 Jun 1963', bloodGroup: 'O-',
    contact: '+91-91234-78901',
    emergencyContact: 'Fatima Ali (Daughter) — +91-91234-78902',
    allergies: ['Contrast dye (CT)', 'NSAIDs'],
    admission: {
      date: '01 May 2026', time: '11:45 AM', via: 'Emergency — Ambulance',
      chiefComplaint: 'Sudden onset left-sided weakness, slurred speech, facial droop — 2 hrs before admission',
      admittingDoctor: 'Dr. Sangeeta Rao (Neurology)',
      ward: 'Neuro ICU', room: '205', bed: 'Bed 3',
    },
    diagnosis: {
      primary: 'Acute Ischaemic Stroke — Right MCA Territory (NIHSS Score: 14)',
      secondary: ['Atrial Fibrillation (paroxysmal)', 'Hypertension', 'Type 2 Diabetes Mellitus', 'Hyperlipidaemia'],
    },
    medications: [
      { name: 'Alteplase (tPA)',   dose: '0.9 mg/kg',   frequency: 'Single bolus + infusion', route: 'IV',          status: 'Completed' },
      { name: 'Aspirin',           dose: '300 mg',       frequency: 'Loading; then 100 mg OD', route: 'Oral',        status: 'Active'    },
      { name: 'Apixaban',          dose: '5 mg',         frequency: 'Twice daily',              route: 'Oral',        status: 'Active'    },
      { name: 'Atorvastatin',      dose: '80 mg',        frequency: 'Once daily',               route: 'Oral',        status: 'Active'    },
      { name: 'Insulin (Regular)', dose: 'Sliding scale', frequency: 'Per glucometer protocol', route: 'Subcutaneous', status: 'Active'   },
      { name: 'Amlodipine',        dose: '5 mg',         frequency: 'Once daily',               route: 'Oral',        status: 'Active'    },
    ],
    dailyVitals: [
      { date: '01 May 2026', hr:  95, bp: '168/100', spo2: 94, temp: 37.2, rr: 20, glucose: 195, trend: 'critical'      },
      { date: '02 May 2026', hr:  98, bp: '158/96',  spo2: 93, temp: 37.6, rr: 22, glucose: 210, trend: 'deteriorating' },
      { date: '03 May 2026', hr: 102, bp: '152/98',  spo2: 92, temp: 38.1, rr: 23, glucose: 185, trend: 'deteriorating' },
    ],
    procedures: [
      { date: '01 May 2026', name: 'IV Thrombolysis — Alteplase (tPA)', surgeon: 'Dr. Sangeeta Rao', outcome: 'Administered within 3-hour window. Monitoring for haemorrhagic transformation.' },
      { date: '01 May 2026', name: 'Non-contrast CT Brain',             doctor:  'Dr. Sangeeta Rao', outcome: 'No haemorrhage. Early ischaemic changes in right MCA territory.' },
      { date: '02 May 2026', name: 'MRI Brain with DWI',                doctor:  'Dr. Sangeeta Rao', outcome: 'Acute infarct confirmed in right MCA territory. No haemorrhagic transformation post-tPA.' },
      { date: '02 May 2026', name: 'Carotid Doppler Ultrasound',        doctor:  'Dr. V. Reddy',     outcome: 'No significant stenosis. Right internal carotid 20% non-flow-limiting plaque.' },
    ],
    clinicalNotes: [
      { date: '01 May 2026', author: 'Dr. Sangeeta Rao', note: 'Patient brought via ambulance with 2-hour onset of sudden left-sided hemiplegia, dysarthria, and left facial palsy. NIHSS Score: 14 (moderate-severe). CT brain shows no haemorrhage. IV tPA (Alteplase) administered at 11:58 AM within thrombolysis window. Admitted to Neuro ICU for close monitoring. Continuous cardiac telemetry showing paroxysmal AF. Neurosurgery on standby.' },
      { date: '02 May 2026', author: 'Dr. Ravi Kumar',   note: 'Day 2. Neurological status unchanged — left hemiplegia persists. MRI confirms right MCA territory infarct, no haemorrhagic conversion. NIHSS 14. AF managed with anticoagulation. Glucose persistently elevated — insulin protocol adjusted. Speech therapy and physiotherapy assessments completed. Fever noted — blood cultures sent.' },
      { date: '03 May 2026', author: 'Dr. Sangeeta Rao', note: 'Day 3. Low-grade fever persisting (38.1°C). Empirical antibiotics commenced for aspiration pneumonia prophylaxis. SpO2 dropping — supplemental O2 via nasal cannula at 2 L/min applied. Neurology team concerned about worsening cerebral oedema. Repeat CT Brain ordered. Family counseled about prognosis and rehabilitation timeline.' },
    ],
    discharge: null,
  },
};

// ── PDF generation ─────────────────────────────────────────────────────────────
function generatePatientPDF(patient, res) {
  const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Medical_Report_${patient.id}.pdf"`);
  doc.pipe(res);

  const W=595.28, H=841.89, M=45, CW=W-M*2;
  const NAV='#1e3a5f', BLU='#2563eb', GRN='#16a34a', RED='#dc2626',
        AMB='#d97706', GRY='#64748b', LBG='#f1f5f9', BDR='#cbd5e1',
        WHT='#ffffff', DRK='#1e293b';

  let y = 0;

  function drawFooter() {
    doc.save();
    doc.lineWidth(0.5).strokeColor(BDR).moveTo(M, H-38).lineTo(M+CW, H-38).stroke();
    doc.fontSize(7).fillColor(GRY).font('Helvetica')
       .text('CONFIDENTIAL — For authorized healthcare professionals only. Sparsha Health System.', M, H-30, { width: CW/2 });
    doc.text(`${patient.name}  |  ID: ${patient.id}`, M, H-30, { width: CW, align: 'right' });
    doc.restore();
  }

  function checkPage(needed = 80) {
    if (y + needed > H - 50) {
      drawFooter();
      doc.addPage();
      doc.rect(0, 0, W, 36).fill(NAV);
      doc.rect(0, 36, W, 3).fill(BLU);
      doc.fontSize(7.5).fillColor('#94a3b8').font('Helvetica-Bold')
         .text(`${patient.name}  |  ${patient.id}  |  Medical Report (continued)`, M, 13, { width: CW });
      y = 52;
    }
  }

  function sectionHeader(title) {
    checkPage(44);
    doc.rect(M, y, CW, 25).fill(NAV);
    doc.fontSize(10).fillColor(WHT).font('Helvetica-Bold').text(title, M+12, y+8, { width: CW-24 });
    y += 29;
  }

  function lv(label, value, lx, ly, vc=DRK) {
    doc.fontSize(7).fillColor(GRY).font('Helvetica').text(label, lx, ly);
    doc.fontSize(9).fillColor(vc).font('Helvetica-Bold').text(String(value||'—'), lx, ly+11);
  }

  // ── Header banner ─────────────────────────────────────────────────────────
  doc.rect(0, 0, W, 86).fill(NAV);
  doc.rect(0, 81, W, 5).fill(BLU);
  doc.fontSize(22).fillColor(WHT).font('Helvetica-Bold').text('SPARSHA HEALTH SYSTEM', M, 14, { width: CW });
  doc.fontSize(11).fillColor('#94a3b8').font('Helvetica').text('Comprehensive Patient Medical Report', M, 42, { width: CW });
  doc.fontSize(7.5).fillColor('#64748b')
     .text(`Report: RPT-${patient.id}-${Date.now().toString().slice(-5)}   |   Generated: ${new Date().toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}`, M, 63, { width: CW });
  y = 100;

  // ── Patient identity card ─────────────────────────────────────────────────
  doc.rect(M, y, CW, 126).fillAndStroke(LBG, BDR);
  doc.rect(M, y, 4, 126).fill(BLU);
  const isD = !!patient.discharge;
  doc.rect(W-M-86, y+8, 78, 20).fill(isD ? GRN : BLU);
  doc.fontSize(8).fillColor(WHT).font('Helvetica-Bold')
     .text(isD ? 'DISCHARGED' : 'ADMITTED', W-M-86, y+13, { width: 78, align: 'center' });
  doc.fontSize(17).fillColor(NAV).font('Helvetica-Bold').text(patient.name, M+14, y+10, { width: CW-110 });
  doc.fontSize(9).fillColor(GRY).font('Helvetica')
     .text(`${patient.age} yrs  •  ${patient.gender}  •  DOB: ${patient.dob}  •  Blood Group: ${patient.bloodGroup}`, M+14, y+32);
  const q = CW/3;
  lv('Patient ID', patient.id, M+14, y+52);
  lv('Contact', patient.contact, M+14+q, y+52);
  lv('Emergency Contact', patient.emergencyContact, M+14+q*2, y+52);
  doc.fontSize(7).fillColor(GRY).font('Helvetica').text('Known Allergies / Drug Reactions', M+14, y+88);
  doc.fontSize(9).fillColor(RED).font('Helvetica-Bold')
     .text(patient.allergies.length ? patient.allergies.join('  •  ') : 'NKDA', M+14, y+100);
  y += 138;

  // ── Admission details ─────────────────────────────────────────────────────
  sectionHeader('ADMISSION DETAILS');
  doc.rect(M, y, CW, 78).fillAndStroke(WHT, BDR);
  const adm = patient.admission, q4 = CW/4;
  lv('Admission Date', adm.date, M+12, y+8);
  lv('Time', adm.time, M+12+q4, y+8);
  lv('Admitted Via', adm.via, M+12+q4*2, y+8);
  lv('Admitting Doctor', adm.admittingDoctor, M+12+q4*3, y+8);
  lv('Ward', adm.ward, M+12, y+44);
  lv('Room / Bed', `Room ${adm.room} — ${adm.bed}`, M+12+q4, y+44);
  doc.fontSize(7).fillColor(GRY).font('Helvetica').text('Chief Complaint', M+12+q4*2, y+44);
  doc.fontSize(8.5).fillColor(AMB).font('Helvetica-Bold').text(adm.chiefComplaint, M+12+q4*2, y+56, { width: q4*2-14 });
  y += 90;

  // ── Diagnosis ─────────────────────────────────────────────────────────────
  sectionHeader('DIAGNOSIS');
  checkPage(72);
  doc.rect(M, y, CW, 68).fillAndStroke(WHT, BDR);
  doc.rect(M, y, 3, 68).fill(RED);
  doc.fontSize(7).fillColor(GRY).font('Helvetica').text('Primary Diagnosis', M+14, y+8);
  doc.fontSize(11).fillColor(RED).font('Helvetica-Bold').text(patient.diagnosis.primary, M+14, y+19, { width: CW-28 });
  doc.fontSize(7).fillColor(GRY).font('Helvetica').text('Secondary / Comorbidities', M+14, y+44);
  doc.fontSize(9).fillColor(DRK).font('Helvetica').text(patient.diagnosis.secondary.join('  •  '), M+14, y+55, { width: CW-28 });
  y += 80;

  // ── Medications table ─────────────────────────────────────────────────────
  sectionHeader('MEDICATIONS');
  const mc=[CW*0.27,CW*0.12,CW*0.25,CW*0.14,CW*0.22];
  const mx=[]; let xo=M; mc.forEach(w=>{mx.push(xo);xo+=w;});
  checkPage(24);
  doc.rect(M, y, CW, 22).fill(BLU);
  ['Medication','Dose','Frequency','Route','Status'].forEach((h,i)=>{
    doc.fontSize(8).fillColor(WHT).font('Helvetica-Bold').text(h, mx[i]+5, y+7, { width: mc[i]-8 });
  });
  y += 22;
  patient.medications.forEach((med, i) => {
    checkPage(22);
    doc.rect(M, y, CW, 22).fillAndStroke(i%2===0?WHT:LBG, BDR);
    [med.name, med.dose, med.frequency, med.route, med.status].forEach((v, j) => {
      const color = j===4 ? (med.status==='Active'?GRN:GRY) : DRK;
      doc.fontSize(8).fillColor(color).font(j===0||j===4?'Helvetica-Bold':'Helvetica')
         .text(v, mx[j]+5, y+7, { width: mc[j]-8 });
    });
    y += 22;
  });
  y += 12;

  // ── Daily vitals table ────────────────────────────────────────────────────
  sectionHeader('DAILY VITALS RECORD');
  const vc=[CW*0.15,CW*0.11,CW*0.13,CW*0.11,CW*0.12,CW*0.11,CW*0.12,CW*0.15];
  const vx=[]; let vo=M; vc.forEach(w=>{vx.push(vo);vo+=w;});
  checkPage(24);
  doc.rect(M, y, CW, 22).fill(NAV);
  ['Date','HR (bpm)','BP (mmHg)','SpO2 (%)','Temp (°C)','RR /min','Glucose','Trend'].forEach((h,i)=>{
    doc.fontSize(7.5).fillColor(WHT).font('Helvetica-Bold').text(h, vx[i]+3, y+7, { width: vc[i]-5 });
  });
  y += 22;
  const trendMap  = { critical:'Critical', improving:'Improving', stable:'Stable', deteriorating:'Deteriorating' };
  const trendClr  = { critical:RED, improving:BLU, stable:GRN, deteriorating:AMB };
  patient.dailyVitals.forEach((v, i) => {
    checkPage(22);
    doc.rect(M, y, CW, 22).fillAndStroke(i%2===0?WHT:LBG, BDR);
    const cells = [
      { val: v.date,      color: DRK },
      { val: String(v.hr), color: v.hr>100?RED:v.hr<60?AMB:GRN },
      { val: v.bp,        color: DRK },
      { val: v.spo2+'%',  color: v.spo2<92?RED:v.spo2<95?AMB:GRN },
      { val: v.temp+'°C', color: v.temp>38.5?RED:v.temp>37.5?AMB:GRN },
      { val: String(v.rr), color: DRK },
      { val: String(v.glucose), color: DRK },
      { val: trendMap[v.trend]||v.trend, color: trendClr[v.trend]||DRK },
    ];
    cells.forEach((c, j) => {
      doc.fontSize(8).fillColor(c.color).font('Helvetica-Bold').text(c.val, vx[j]+3, y+7, { width: vc[j]-5 });
    });
    y += 22;
  });
  y += 12;

  // ── Procedures ────────────────────────────────────────────────────────────
  if (patient.procedures?.length) {
    sectionHeader('PROCEDURES PERFORMED');
    patient.procedures.forEach((proc, i) => {
      checkPage(58);
      doc.rect(M, y, CW, 52).fillAndStroke(i%2===0?LBG:WHT, BDR);
      doc.rect(M, y, 3, 52).fill(BLU);
      doc.fontSize(9.5).fillColor(NAV).font('Helvetica-Bold').text(proc.name, M+12, y+7, { width: CW-24 });
      doc.fontSize(7.5).fillColor(GRY).font('Helvetica')
         .text(`Date: ${proc.date}   |   By: ${proc.surgeon||proc.doctor}`, M+12, y+22);
      doc.fontSize(8.5).fillColor(DRK).text(`Outcome: ${proc.outcome}`, M+12, y+33, { width: CW-24 });
      y += 56;
    });
    y += 8;
  }

  // ── Clinical notes ────────────────────────────────────────────────────────
  sectionHeader('CLINICAL NOTES  (Chronological)');
  patient.clinicalNotes.forEach((note) => {
    doc.fontSize(9).font('Helvetica');
    const nh = doc.heightOfString(note.note, { width: CW-24, lineGap: 2 });
    const blockH = nh + 40;
    checkPage(blockH + 10);
    doc.rect(M, y, CW, blockH).fillAndStroke(WHT, BDR);
    doc.rect(M, y, 3, blockH).fill(BLU);
    doc.rect(M, y, CW, 20).fill('#eff6ff');
    doc.fontSize(8.5).fillColor(BLU).font('Helvetica-Bold')
       .text(`${note.date}  —  ${note.author}`, M+12, y+6, { width: CW-24 });
    doc.fontSize(9).fillColor(DRK).font('Helvetica')
       .text(note.note, M+12, y+26, { width: CW-24, lineGap: 2 });
    y += blockH + 8;
  });
  y += 6;

  // ── Discharge summary / current status ────────────────────────────────────
  if (patient.discharge) {
    sectionHeader('DISCHARGE SUMMARY');
    checkPage(130);
    const dis = patient.discharge;
    doc.rect(M, y, CW, 120).fillAndStroke(LBG, BDR);
    doc.rect(M, y, 4, 120).fill(GRN);
    lv('Discharge Date', dis.date, M+16, y+10);
    lv('Condition at Discharge', dis.condition, M+16+CW/2, y+10, GRN);
    doc.lineWidth(0.5).strokeColor(BDR).moveTo(M, y+38).lineTo(M+CW, y+38).stroke();
    doc.fontSize(7).fillColor(GRY).font('Helvetica').text('Discharge Instructions', M+16, y+46);
    doc.fontSize(9).fillColor(DRK).font('Helvetica').text(dis.instructions, M+16, y+57, { width: CW-32, lineGap: 2 });
    doc.fontSize(7).fillColor(GRY).text('Follow-up Appointment', M+16, y+98);
    doc.fontSize(9).fillColor(BLU).font('Helvetica-Bold').text(dis.followUp, M+16, y+109);
    y += 132;
  } else {
    sectionHeader('CURRENT STATUS');
    checkPage(56);
    doc.rect(M, y, CW, 48).fillAndStroke(LBG, BDR);
    doc.rect(M, y, 4, 48).fill(BLU);
    doc.fontSize(10.5).fillColor(BLU).font('Helvetica-Bold')
       .text('Patient Currently ADMITTED — Under Active Clinical Monitoring & Care', M+16, y+12, { width: CW-28 });
    doc.fontSize(8.5).fillColor(GRY).font('Helvetica')
       .text(`${patient.admission.ward}  |  Room ${patient.admission.room}  |  ${patient.admission.bed}`, M+16, y+32);
    y += 60;
  }

  drawFooter();
  doc.end();
}

// ── GET /api/patients ─────────────────────────────────────────────────────────
app.get('/api/patients', (req, res) => {
  const patients = Object.values(PATIENT_DB).map(p => ({
    id: p.id, name: p.name, age: p.age, gender: p.gender,
    ward: p.admission.ward, room: p.admission.room, bed: p.admission.bed,
    status: p.discharge ? 'discharged' : 'admitted',
    diagnosis: p.diagnosis.primary,
  }));
  res.json({ patients });
});

// ── GET /api/patients/:id/report ──────────────────────────────────────────────
app.get('/api/patients/:id/report', (req, res) => {
  const patient = PATIENT_DB[req.params.id];
  if (!patient) return res.status(404).json({ error: 'Patient not found' });
  try {
    generatePatientPDF(patient, res);
  } catch (err) {
    console.error('[pdf]', err);
    if (!res.headersSent) res.status(500).json({ error: 'PDF generation failed' });
  }
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

// ── SPA Fallback ──────────────────────────────────────────────────────────────
app.get('/dashboard/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/dist/index.html'));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n🏥  Sparsha AI listening on http://localhost:${PORT}`);
  console.log(`    GROQ_API_KEY : ${process.env.GROQ_API_KEY ? '✓ set' : '✗ MISSING'}`);
  console.log(`    VAPI webhook : POST /api/vapi/webhook\n`);
  await warmupOllama();
});
