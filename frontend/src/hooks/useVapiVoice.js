import { useState, useRef, useCallback, useEffect } from 'react';
import Vapi from '@vapi-ai/web';

// HARDCODED FOR DEMO STABILITY
const ASSISTANT_ID = '112f72ea-aa0b-4a2c-85fc-c23decb96455';
const PUBLIC_KEY = 'f521fd2e-e7dc-42d8-8ff2-f9b0c6682b0a';

export default function useVapiVoice() {
  const [connecting,  setConnecting]  = useState(false);
  const [callActive,  setCallActive]  = useState(false);
  const [aiSpeaking,  setAiSpeaking]  = useState(false);
  const [messages,    setMessages]    = useState([]);
  const [error,        setError]       = useState(null);

  const vapiRef = useRef(null);
  const processedToolCalls = useRef(new Set());

  useEffect(() => {
    const vapi = new Vapi(PUBLIC_KEY);
    vapiRef.current = vapi;

    vapi.on('call-start', () => { setConnecting(false); setCallActive(true); setError(null); });
    vapi.on('call-end', () => { setConnecting(false); setCallActive(false); });
    vapi.on('speech-start', () => setAiSpeaking(true));
    vapi.on('speech-end', () => setAiSpeaking(false));

    vapi.on('message', (msg) => {
      // ── AGGRESSIVE TOOL SNIFFER ───────────────────────────────────────────
      const isToolCall = msg.type === 'tool-calls' || msg.type === 'function-call' || msg.toolCalls;
      
      if (isToolCall) {
        console.log('[VAPI] Detected Tool Call:', msg);
        const calls = msg.toolWithToolCallList || msg.toolCalls || (msg.functionCall ? [msg] : []);
        
        calls.forEach(t => {
          const callId = t?.id || t?.toolCallId || t?.functionCall?.id;
          
          // PREVENT DUPLICATE ALERTS
          if (callId && processedToolCalls.current.has(callId)) return;
          if (callId) processedToolCalls.current.add(callId);
          const func = t?.tool?.function || t?.toolCall?.function || t?.functionCall || t?.function || t;
          const name = func?.name;
          let args = func?.arguments || t?.parameters || {};
          
          if (typeof args === 'string') { try { args = JSON.parse(args); } catch(_) {} }

          console.log(`[VAPI] Executing Tool: ${name}`, args);

          if (name === 'send_alert' || name === 'emergency_alert' || name === 'ambulance_alert') {
            const isAmbulance = name === 'ambulance_alert';
            const distance = args?.distance || (isAmbulance ? 1.5 : 0); // Default to 1.5km for ambulances
            const alertData = { 
              staff_name: isAmbulance ? 'Emergency Entrance Team' : (args?.staff_name || 'Emergency Team'), 
              room_number: isAmbulance ? 'ENTRANCE' : (args?.room_number || 'TBD'), 
              reason: isAmbulance ? `Ambulance arriving in ${args?.eta || '1'} minute(s).` : (args?.reason || 'Critical Alert'),
              priority: isAmbulance ? 'CRITICAL' : 'NORMAL',
              distance: distance,
              eta: args?.eta || '1'
            };
            
            // PING LOCAL BACKEND
            fetch('/api/alerts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(alertData)
            }).catch(e => console.error('[VAPI] Backend delivery failed:', e));
          }

          if (name === 'get_beds' || name === 'check_availability') {
            const inventory = { general: 12, icu: 4, emergency: 2, ventilators: 3 };
            console.log('[VAPI] Sending Bed Inventory to AI:', inventory);
            
            // FEED DATA BACK TO AI SO IT CAN SPEAK IT
            vapiRef.current?.send({
              type: 'tool-call-result',
              toolCallId: t.id,
              result: JSON.stringify(inventory)
            });
          }

          if (name === 'get_vitals') {
            window.dispatchEvent(new CustomEvent('vitals_fetched', { 
              detail: { room_number: args?.room_number || '101', vitals: { heart_rate: 75, spo2: 98 } } 
            }));
          }
        });
      }

      if (msg.type === 'transcript' && msg.transcriptType === 'final') {
        setMessages((prev) => [...prev, { role: msg.role, text: msg.transcript, ts: Date.now() }].slice(-8));
      }
    });

    vapi.on('error', (err) => {
      console.error('[VAPI] ERROR:', err);
      const msg = err?.message || JSON.stringify(err);
      setError(msg); setConnecting(false); setCallActive(false);
    });

    return () => { try { vapi.stop(); } catch (_) {} };
  }, []);

  const startCall = useCallback(() => {
    if (!vapiRef.current) return;
    setError(null); setConnecting(true);
    
    // STRICT STRING FORMAT - DO NOT USE OBJECT
    console.log('[VAPI] Starting call with ID:', ASSISTANT_ID);
    try {
      vapiRef.current.start(ASSISTANT_ID);
    } catch (e) {
      console.error('[VAPI] Start Error:', e);
      setError(e.message);
      setConnecting(false);
    }
  }, []);

  return {
    connecting, callActive, aiSpeaking, messages, error,
    startCall, endCall: () => vapiRef.current?.stop(),
    injectMessage: (c) => vapiRef.current?.send({ type: 'add-message', message: { role: 'system', content: c } }),
    say: (t) => vapiRef.current?.say(t)
  };
}
