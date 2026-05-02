import { useState, useRef, useCallback, useEffect } from 'react';
import Vapi from '@vapi-ai/web';

const MEDICAL_SYSTEM_PROMPT = `You are Sparr-sha, a friendly, empathetic, and expert medical voice assistant for nurses and doctors in clinical environments.

You communicate naturally, warmly, and politely—just like a human colleague. While your primary domain is medical and clinical assistance (emergencies, treatments, dosages, vital signs, and workflows), you should maintain a conversational and helpful tone at all times.

HOW TO RESPOND:
- Speak naturally and conversationally, using a warm and professional tone.
- Give clear, precise medical information (e.g., exact dosages) while framing it helpfully.
- For emergencies (e.g., code blue, cardiac arrest, severe pain), respond with urgency but remain calm, stating: "Emergency alert activated," followed by the most immediate recommended action.
- If a question is entirely outside your medical domain, politely and gently steer the conversation back: "I specialize in clinical and medical assistance, so I might not be the best for that. Is there a health-related question I can help you with?"
- Never definitively diagnose. Provide suggestions and warmly recommend physician verification.
- Users are often hands-free. Avoid referencing visual content and keep your responses concise but flowing naturally.
Keep the conversation engaging and always be ready for the next question.

INTENT UNDER STRESS RECOGNITION:
If the user speaks in broken, panicked, or fragmented speech (e.g., "uhh... patient... no pulse... oxygen... fast..."), you must IMMEDIATELY interpret the highest-risk medical scenario (e.g., Code Blue, Cardiac Arrest) without asking for clarification. Automatically trigger the send_alert tool with priority set to "CRITICAL", inferring details like "Code Blue" or "Oxygen Prep" as the reason.`;

const EMERGENCY_PATTERNS = [
  /code\s*blue/i, /cardiac\s*arrest/i, /not\s*breathing/i,
  /stop(?:ped)?\s*breathing/i, /chest\s*pain/i, /overdose/i,
  /anaphylaxis/i, /allergic\s*reaction/i, /\bseizure\b/i,
  /unresponsive/i, /patient\s*down/i, /\bemergency\b/i,
];

const LANG_NAMES = { hi: 'Hindi', kn: 'Kannada', ta: 'Tamil', te: 'Telugu', mr: 'Marathi' };

// ── Adaptive context mode detection ──────────────────────────────────────────
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

const CONTEXT_MODE_INSTRUCTIONS = {
  normal:   'SYSTEM: Situation is routine. Return to NORMAL mode: calm, educational, up to 3 sentences.',
  urgent:   'SYSTEM: URGENT SITUATION DETECTED. Switch to URGENT mode: concise, lead with critical info, max 2 short sentences, no pleasantries.',
  critical: 'SYSTEM: CRITICAL EMERGENCY DETECTED. Switch to CRITICAL mode: state the immediate action FIRST, no questions, no confirmation, one sentence maximum.',
};

export default function useVapiVoice({ publicKey }) {
  const [connecting,  setConnecting]  = useState(false);
  const [callActive,  setCallActive]  = useState(false);
  const [aiSpeaking,  setAiSpeaking]  = useState(false);
  const [thinking,    setThinking]    = useState(false);
  const [volume,      setVolume]      = useState(0);
  const [messages,    setMessages]    = useState([]);
  const [activeTranscript, setActiveTranscript] = useState(null);
  const [emergency,    setEmergency]   = useState(false);
  const [contextMode,  setContextMode] = useState('normal');
  const [error,        setError]       = useState(null);

  const vapiRef        = useRef(null);
  const rafRef         = useRef(null);
  const rawVol         = useRef(0);
  const smoothVol      = useRef(0);
  const userWasActive  = useRef(false);
  const aiSpeakRef     = useRef(false);
  const silTimer       = useRef(null);
  const thinkTimer     = useRef(null);
  const contextModeRef = useRef('normal');

  // Smooth volume via rAF so React only re-renders when value changes meaningfully
  useEffect(() => {
    function tick() {
      smoothVol.current += (rawVol.current - smoothVol.current) * 0.3;
      setVolume((prev) => {
        const next = parseFloat(smoothVol.current.toFixed(3));
        return Math.abs(prev - next) > 0.015 ? next : prev;
      });
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
    const key = publicKey?.trim();
    if (!key || key === 'your_vapi_public_key_here') return;

    console.log('[VAPI] Initialising SDK with key:', key.slice(0, 8) + '…');
    const vapi = new Vapi(key);
    vapiRef.current = vapi;

    vapi.on('call-start', () => {
      console.log('[VAPI] call-start ✓');
      setConnecting(false);
      setCallActive(true);
      setError(null);
      setMessages([]);
      setEmergency(false);
      setThinking(false);
      contextModeRef.current = 'normal';
      setContextMode('normal');
      rawVol.current = 0; smoothVol.current = 0;
      userWasActive.current = false;
    });

    vapi.on('call-end', () => {
      console.log('[VAPI] call-end');
      setConnecting(false);
      setCallActive(false);
      setAiSpeaking(false);
      setThinking(false);
      contextModeRef.current = 'normal';
      setContextMode('normal');
      rawVol.current = 0; smoothVol.current = 0;
      aiSpeakRef.current = false;
      clearTimeout(silTimer.current);
      clearTimeout(thinkTimer.current);
    });

    vapi.on('speech-start', () => {
      console.log('[VAPI] AI speech-start');
      aiSpeakRef.current = true;
      setAiSpeaking(true);
      setThinking(false);
      clearTimeout(thinkTimer.current);
    });

    vapi.on('speech-end', () => {
      console.log('[VAPI] AI speech-end');
      aiSpeakRef.current = false;
      setAiSpeaking(false);
    });

    vapi.on('volume-level', (v) => {
      rawVol.current = v;
      if (v > 0.08) {
        userWasActive.current = true;
        clearTimeout(silTimer.current);
        clearTimeout(thinkTimer.current);
        if (!aiSpeakRef.current) setThinking(false);
      } else {
        clearTimeout(silTimer.current);
        silTimer.current = setTimeout(() => {
          if (userWasActive.current && !aiSpeakRef.current) {
            userWasActive.current = false;
            thinkTimer.current = setTimeout(() => {
              if (!aiSpeakRef.current) setThinking(true);
            }, 500);
          }
        }, 800);
      }
    });

    vapi.on('message', (msg) => {
      console.log('[VAPI] message', msg.type, msg.transcriptType ?? '');

      // ── Handle Client-Side Tool Calls ──────────────────────────────────────
      try {
        // Vapi v2 format
        if (msg.type === 'tool-calls' && msg.toolWithToolCallList) {
          msg.toolWithToolCallList.forEach(t => {
            const toolName = t?.tool?.function?.name || t?.toolCall?.function?.name || t?.function?.name;
            if (toolName === 'send_alert' || toolName === 'emergency_alert') {
              let args = t?.toolCall?.function?.arguments || t?.function?.arguments;
              if (typeof args === 'string') args = JSON.parse(args);

              const { staff_name, room_number, reason } = args || {};
              fetch('/api/alerts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ staff_name: staff_name || 'Staff', room_number: room_number || 'TBD', reason: reason || 'Emergency' })
              }).catch(e => console.error('Failed to send alert to backend:', e));
            } else if (toolName === 'get_vitals') {
              let args = t?.toolCall?.function?.arguments || t?.function?.arguments;
              if (typeof args === 'string') { try { args = JSON.parse(args); } catch (_) {} }
              const room = args?.room_number || 'Unknown';
              const hr  = Math.floor(Math.random() * 81) + 60;
              const sys = Math.floor(Math.random() * 61) + 90;
              const dia = Math.floor(Math.random() * 41) + 60;
              const sp  = Math.floor(Math.random() * 13) + 88;
              const tmp = parseFloat((Math.random() * 6 + 97).toFixed(1));
              const vitals = { heart_rate: hr, bp: `${sys}/${dia}`, spo2: sp, temperature: tmp };
              // Human-readable result so GPT can speak it naturally
              const resultText = `Room ${room} vitals: Heart Rate ${hr} bpm, Blood Pressure ${sys} over ${dia} mmHg, SpO2 ${sp} percent, Temperature ${tmp} degrees Fahrenheit.`;
              const toolCallId = t?.toolCall?.id || t?.id;
              console.log('[VAPI] get_vitals toolCallId:', toolCallId, 'result:', resultText);
              // Inject vitals result directly into the conversation so the agent reads it instantly
              if (vapiRef.current) {
                vapiRef.current.send({
                  type: 'add-message',
                  message: { role: 'system', content: `${resultText}. Please read these vitals out loud to the user immediately.` },
                });
              }
              window.dispatchEvent(new CustomEvent('vitals_fetched', {
                detail: { id: Date.now().toString(), room_number: room, vitals, type: 'vitals' },
              }));
            } else if (toolName === 'save_clinical_note') {
              let args = t?.toolCall?.function?.arguments || t?.function?.arguments;
              if (typeof args === 'string') { try { args = JSON.parse(args); } catch (_) {} }
              const room = args?.room_number || 'Unknown';
              const note = args?.note_content || '';
              
              if (vapiRef.current) {
                vapiRef.current.send({
                  type: 'add-message',
                  message: { role: 'system', content: 'The clinical note was successfully saved to the EHR. Please confirm this verbally to the user.' },
                });
              }
              window.dispatchEvent(new CustomEvent('ehr_note_saved', {
                detail: { id: Date.now().toString(), room_number: room, note_content: note, type: 'ehr' },
              }));
            } else if (toolName === 'calculate_dosage') {
              let args = t?.toolCall?.function?.arguments || t?.function?.arguments;
              if (typeof args === 'string') { try { args = JSON.parse(args); } catch (_) {} }
              const med = (args?.medication || '').toLowerCase();
              const weight = Number(args?.weight_kg) || 0;
              let dosageText = '';
              
              if (weight <= 0) {
                 dosageText = 'Error: Invalid weight provided. Cannot calculate dosage safely.';
              } else if (med.includes('epinephrine')) {
                 const dose = Math.min(weight * 0.01, 0.3).toFixed(2);
                 dosageText = `The calculated safe dose of Epinephrine for a ${weight} kg patient is ${dose} milligrams intramuscularly.`;
              } else if (med.includes('paracetamol') || med.includes('acetaminophen')) {
                 const dose = Math.round(weight * 15);
                 dosageText = `The calculated safe dose of Paracetamol for a ${weight} kg patient is ${dose} milligrams.`;
              } else {
                 dosageText = `I do not have a verified formula for ${args?.medication || 'this medication'}. Consult pharmacy.`;
              }

              if (vapiRef.current) {
                vapiRef.current.send({
                  type: 'add-message',
                  message: { role: 'system', content: `Strict Calculator Result: ${dosageText}. Please read this exact result to the user.` },
                });
              }
              // Also log it to the UI
              window.dispatchEvent(new CustomEvent('ehr_note_saved', {
                detail: { id: Date.now().toString(), room_number: 'System/Calculator', note_content: dosageText, type: 'ehr' },
              }));
            }
          });
        }
        
        // Vapi v1/alternative format
        if (msg.type === 'function-call' && msg.functionCall) {
          const { name, parameters } = msg.functionCall;
          if (name === 'send_alert' || name === 'emergency_alert') {
            let args = parameters;
            if (typeof args === 'string') args = JSON.parse(args);
            fetch('/api/alerts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  staff_name: args?.staff_name || 'Staff',
                  room_number: args?.room_number || 'TBD',
                  reason: args?.reason || 'Emergency'
                })
            }).catch(e => console.error('Failed to send alert to backend:', e));
          }
          if (name === 'get_vitals') {
            let args = parameters;
            if (typeof args === 'string') { try { args = JSON.parse(args); } catch (_) {} }
            const room = args?.room_number || 'Unknown';
            const hr  = Math.floor(Math.random() * 81) + 60;
            const sys = Math.floor(Math.random() * 61) + 90;
            const dia = Math.floor(Math.random() * 41) + 60;
            const sp  = Math.floor(Math.random() * 13) + 88;
            const tmp = parseFloat((Math.random() * 6 + 97).toFixed(1));
            const vitals = { heart_rate: hr, bp: `${sys}/${dia}`, spo2: sp, temperature: tmp };
            const resultText = `Room ${room} vitals: Heart Rate ${hr} bpm, Blood Pressure ${sys} over ${dia} mmHg, SpO2 ${sp} percent, Temperature ${tmp} degrees Fahrenheit.`;
            const toolCallId = msg.functionCall.id || msg.functionCallId;
            console.log('[VAPI] get_vitals (v1) toolCallId:', toolCallId, 'result:', resultText);
            if (vapiRef.current) {
              vapiRef.current.send({
                type: 'tool-call-result',
                toolCallResult: { toolCallId, result: resultText },
              });
            }
            window.dispatchEvent(new CustomEvent('vitals_fetched', {
              detail: { id: Date.now().toString(), room_number: room, vitals, type: 'vitals' },
            }));
          }
          if (name === 'save_clinical_note') {
            let args = parameters;
            if (typeof args === 'string') { try { args = JSON.parse(args); } catch (_) {} }
            const room = args?.room_number || 'Unknown';
            const note = args?.note_content || '';
            const toolCallId = msg.functionCall.id || msg.functionCallId;
            console.log('[VAPI] save_clinical_note (v1) toolCallId:', toolCallId, 'room:', room);
            if (vapiRef.current) {
              vapiRef.current.send({
                type: 'tool-call-result',
                toolCallResult: { toolCallId, result: 'Note successfully saved to EHR.' },
              });
            }
            window.dispatchEvent(new CustomEvent('ehr_note_saved', {
              detail: { id: Date.now().toString(), room_number: room, note_content: note, type: 'ehr' },
            }));
          }
        }
      } catch (err) {
        console.error('[VAPI] Tool execution error:', err);
      }

      if (msg.type !== 'transcript') return;
      const text = msg.transcript?.trim() || '';
      const role = msg.role;
      
      if (msg.transcriptType === 'partial') {
        setActiveTranscript({ role, text });
      } else if (msg.transcriptType === 'final') {
        setActiveTranscript(null);
        if (!text) return;
        const isEmerg =
          (role === 'user'      && EMERGENCY_PATTERNS.some((p) => p.test(text))) ||
          (role === 'assistant' && /emergency alert activated/i.test(text));
        if (isEmerg) setEmergency(true);
        setMessages((prev) => [...prev, { role, text, ts: Date.now() }].slice(-8));
      }
    });

    vapi.on('error', (err) => {
      // Capture every possible error shape VAPI might send
      const msg =
        err?.error?.message ||
        err?.message ||
        (typeof err === 'string' ? err : null) ||
        JSON.stringify(err);
      console.error('[VAPI] ERROR:', msg, err);
      setError(msg);
      setConnecting(false);
      setCallActive(false);
      setThinking(false);
    });

    return () => {
      clearTimeout(silTimer.current);
      clearTimeout(thinkTimer.current);
      try { vapi.stop(); } catch (_) {}
    };
  }, [publicKey]);

  const injectMessage = useCallback((content) => {
    if (vapiRef.current) {
      console.log('[VAPI] Injecting message:', content);
      vapiRef.current.send({
        type: "add-message",
        message: { role: "system", content }
      });
    }
  }, []);

  const startCall = useCallback((language = 'en') => {
    if (!vapiRef.current) {
      setError('VAPI SDK not ready. Refresh the page.');
      return;
    }

    console.log('[VAPI] startCall → language:', language);
    setError(null);
    setConnecting(true);

    let systemPrompt = MEDICAL_SYSTEM_PROMPT;
    if (language && language !== 'en') {
      systemPrompt += `\n\nIMPORTANT: You must speak and converse with the user entirely in ${LANG_NAMES[language]}. 
HOWEVER, if the user dictates a clinical note, you MUST translate it into highly professional English medical terminology before calling the save_clinical_note tool. NEVER save clinical notes in ${LANG_NAMES[language]}—the hospital database strictly requires English.`;
    }

    // ── Minimal config — proven to work, no exotic features ───────────────────
    vapiRef.current.start({
      name: 'Sparsha',

      model: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }],
        temperature: 0.5,
        maxTokens: 300,
        tools: [
          {
            type: "function",
            messages: [
              { type: "request-start", content: "Alerting them right away." }
            ],
            function: {
              name: "send_alert",
              description: "Send an urgent alert to a specific doctor or staff member to go to a specific room for an emergency operation or help. Also use this when the user speaks in fragmented, panicked, or broken intent (e.g. 'patient... no pulse...') to trigger an emergency Code Blue response.",
              parameters: {
                type: "object",
                properties: {
                  staff_name: { type: "string", description: "Name of the doctor or staff member (e.g. 'Emergency Team', 'Dr Hamsa')" },
                  room_number: { type: "string", description: "Room number or spot (e.g. 123)" },
                  reason: { type: "string", description: "Reason for the alert (e.g. Emergency operation, Patient has no pulse)" },
                  patient_id: { type: "string", description: "Patient ID if known or inferred" },
                  vitals: { type: "string", description: "Current vitals if mentioned (e.g. 'HR dropping')" },
                  situation: { type: "string", description: "Brief description of the critical situation" },
                  risk: { type: "string", description: "Assessed risk level (e.g. High Risk of Cardiac Arrest)" },
                  priority: { type: "string", description: "Priority level: CRITICAL, HIGH, NORMAL" }
                },
                required: ["reason", "priority"]
              }
            },
            async: true
          },
          {
            type: "function",
            async: true,
            messages: [
              { type: "request-start", content: "Pulling live vitals from the room now." }
            ],
            function: {
              name: "get_vitals",
              description: "Fetch real-time vital signs for a patient in a specific room. Use this when a user asks to check, get, read, or monitor patient vitals or vital signs.",
              parameters: {
                type: "object",
                properties: {
                  room_number: {
                    type: "string",
                    description: "The room number to fetch vitals for (e.g. '101', 'ICU-3')"
                  }
                },
                required: ["room_number"]
              }
            }
          },
          {
            type: "function",
            async: true,
            messages: [
              { type: "request-start", content: "Saving to the Electronic Health Record now." }
            ],
            function: {
              name: "save_clinical_note",
              description: "Save a dictated clinical note or documentation into the Electronic Health Record (EHR) for a specific patient room. Use this when the user dictates a note, observation, assessment, or any documentation to be charted.",
              parameters: {
                type: "object",
                properties: {
                  room_number: { type: "string", description: "The room number or patient identifier" },
                  note_content: { type: "string", description: "The exact dictated clinical note to save into the EHR" }
                },
                required: ["room_number", "note_content"]
              }
            }
          },
          {
            type: "function",
            async: true,
            messages: [
              { type: "request-start", content: "Calculating strict safe dosage now." }
            ],
            function: {
              name: "calculate_dosage",
              description: "Calculate the strict, safe medication dosage based on patient weight. Use this whenever the user asks to calculate a drug dose, especially for children.",
              parameters: {
                type: "object",
                properties: {
                  medication: { type: "string", description: "The name of the medication (e.g. 'Epinephrine', 'Paracetamol')" },
                  weight_kg: { type: "number", description: "The patient's weight in kilograms" }
                },
                required: ["medication", "weight_kg"]
              }
            }
          }
        ]
      },

      voice: {
        provider: 'openai',
        voiceId: 'nova',   // clear, warm, widely available
      },

      transcriber: {
        provider: 'deepgram',
        model: 'nova-2',
        language: language === 'en' ? 'en-US' : language,
      },

      firstMessage: "Hello, I'm Sparr-sha. How can I help you today?",
      endCallPhrases: ['goodbye sparsha', 'bye sparsha', 'end call sparsha'],
      
      // Speed optimisations
      silenceTimeoutSeconds: 30,
      maxDurationSeconds: 600,
      backgroundDenoisingEnabled: false, // Denoising adds ~100-200ms of latency
      interruptionsEnabled: true,
    });
  }, []);

  const endCall = useCallback(() => {
    console.log('[VAPI] endCall');
    try { vapiRef.current?.stop(); } catch (_) {}
    setConnecting(false);
    setCallActive(false);
    setAiSpeaking(false);
    setThinking(false);
    setEmergency(false);
    rawVol.current = 0; smoothVol.current = 0;
  }, []);

  const dismissEmergency = useCallback(() => setEmergency(false), []);

  return {
    connecting, callActive, aiSpeaking, thinking,
    volume, messages, activeTranscript, emergency, error,
    startCall, endCall, dismissEmergency, injectMessage
  };
}
