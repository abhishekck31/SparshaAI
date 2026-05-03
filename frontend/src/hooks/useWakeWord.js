import { useState, useEffect, useRef, useCallback } from 'react';

const WAKE_PHRASES = [
  'sparsha', 'sparsh', 'sparsa', 'spartha', 'spartia',
  'hey sparsha', 'hi sparsha', 'hello sparsha', 'okay sparsha',
  'hey sparse', 'hey sparks', 'hey sparta', 'hey pass',
  'hey pasha', 'hey parsha', 'hey barsha', 'hi sparsh',
  'hey spar', 'hey star', 'hey spa', 'hey ashar',
];

function matchesWakeWord(transcript) {
  const t = transcript.toLowerCase().trim();
  // Match if ANY part of the transcript contains our target words
  return WAKE_PHRASES.some((p) => t.includes(p));
}

export default function useWakeWord({ onDetected, enabled, lang = 'en-US' }) {
  // wakeListening is TRUE for the entire duration enabled=true.
  // It does NOT toggle off during Chrome's normal recognition restart cycle.
  const [wakeListening, setWakeListening] = useState(false);
  const [lastTranscript, setLastTranscript] = useState('');

  const recRef        = useRef(null);
  const enabledRef    = useRef(enabled);
  const onDetectedRef = useRef(onDetected);
  const restartTimer  = useRef(null);
  const starting      = useRef(false);

  useEffect(() => { enabledRef.current    = enabled;    }, [enabled]);
  useEffect(() => { onDetectedRef.current = onDetected; }, [onDetected]);

  const stopRec = useCallback(() => {
    clearTimeout(restartTimer.current);
    starting.current = false;
    if (recRef.current) {
      try { recRef.current.abort(); } catch (_) {}
      recRef.current = null;
    }
    // Only hide the indicator when truly disabled
    setWakeListening(false);
    setLastTranscript('');
  }, []);

  const startRec = useCallback(() => {
    if (starting.current || !enabledRef.current) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    // Abort any existing session silently
    if (recRef.current) {
      try { recRef.current.abort(); } catch (_) {}
      recRef.current = null;
    }

    starting.current = true;
    const rec = new SR();
    rec.continuous      = true;
    rec.interimResults  = true;
    rec.lang            = lang;
    rec.maxAlternatives = 3;

    rec.onstart = () => {
      starting.current = false;
      setWakeListening(true); // stays true through all restarts
    };

    rec.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        setLastTranscript(transcript);
        if (matchesWakeWord(transcript)) {
          console.log('[WAKE] Match found! Strictly releasing mic for Vapi...');
          rec.onend = null; // Unbind onend to prevent auto-restart
          try { rec.stop(); } catch (_) { rec.abort(); } 
          onDetectedRef.current?.();
          return;
        }
      }
    };

    rec.onerror = (e) => {
      starting.current = false;
      console.error('[WAKE] Speech Error:', e.error);
      if (e.error === 'not-allowed') { stopRec(); return; }
      // Aggressive recovery for other errors
      restartTimer.current = setTimeout(startRec, 1000);
    };

    rec.onend = () => {
      starting.current = false;
      if (enabledRef.current) {
        // Force restart if ended normally
        restartTimer.current = setTimeout(startRec, 300);
      }
    };

    recRef.current = rec;
    try { rec.start(); } catch (_) {
      starting.current = false;
      if (enabledRef.current) restartTimer.current = setTimeout(startRec, 600);
    }
  }, [lang, stopRec]);

  useEffect(() => {
    if (enabled) {
      startRec();
    } else {
      enabledRef.current = false;
      stopRec();
    }
    return stopRec;
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return { wakeListening, lastTranscript };
}
