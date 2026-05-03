import { useState, useRef, useCallback, useEffect } from 'react';
import Vapi from '@vapi-ai/web';

// HARDCODED FOR DEMO STABILITY
const ASSISTANT_ID = 'd667b9de-4dc4-466a-a17e-aa30fe63aa6f';
const PUBLIC_KEY = '5afc10f6-dca2-48b7-aeb8-cff1b3ed44df';

export default function useVapiVoice() {
  const [connecting,  setConnecting]  = useState(false);
  const [callActive,  setCallActive]  = useState(false);
  const [aiSpeaking,  setAiSpeaking]  = useState(false);
  const [messages,    setMessages]    = useState([]);
  const [error,        setError]       = useState(null);

  const vapiRef = useRef(null);

  useEffect(() => {
    const vapi = new Vapi(PUBLIC_KEY);
    vapiRef.current = vapi;

    vapi.on('call-start', () => { setConnecting(false); setCallActive(true); setError(null); });
    vapi.on('call-end', () => { setConnecting(false); setCallActive(false); });
    vapi.on('speech-start', () => setAiSpeaking(true));
    vapi.on('speech-end', () => setAiSpeaking(false));
    
    vapi.on('message', (msg) => {
      if (msg.type === 'transcript' && msg.transcriptType === 'final') {
        setMessages((prev) => [...prev, { role: msg.role, text: msg.transcript, ts: Date.now() }].slice(-8));
      }
      // Dashboard Vitals Event
      if (msg.type === 'tool-calls' || msg.type === 'function-call') {
        window.dispatchEvent(new CustomEvent('vitals_fetched', { detail: { room_number: '101', vitals: { heart_rate: 72, spo2: 98 } } }));
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
    
    // THE MOST BASIC CALL POSSIBLE
    try {
      vapiRef.current.start(ASSISTANT_ID);
    } catch (e) {
      setError(e.message);
      setConnecting(false);
    }
  }, []);

  return {
    connecting, callActive, aiSpeaking, messages, error,
    startCall, endCall: () => vapiRef.current?.stop()
  };
}
