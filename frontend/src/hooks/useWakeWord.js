import { useState, useEffect, useRef, useCallback } from 'react';

const WAKE_PHRASES = [
  'hey sparsha', 'hi sparsha', 'hello sparsha',
  'hey sparsh',  'a sparsha',  'sparsha',
  'ok sparsha',  'okay sparsha',
  'hey sparta',  'hey sparse',  'hey sparsa',
];

function matchesWakeWord(transcript) {
  const t = transcript.toLowerCase().trim();
  return WAKE_PHRASES.some((p) => t.includes(p));
}

export default function useWakeWord({ onDetected, enabled, lang = 'en-US' }) {
  // wakeListening is TRUE for the entire duration enabled=true.
  // It does NOT toggle off during Chrome's normal recognition restart cycle.
  const [wakeListening, setWakeListening] = useState(false);

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
        for (let j = 0; j < event.results[i].length; j++) {
          if (matchesWakeWord(event.results[i][j].transcript)) {
            rec.abort();
            // Don't touch wakeListening here — caller will set enabled=false
            onDetectedRef.current?.();
            return;
          }
        }
      }
    };

    rec.onerror = (e) => {
      starting.current = false;
      if (e.error === 'not-allowed') { stopRec(); return; }
      // All other errors (no-speech, network, aborted) → let onend restart
    };

    rec.onend = () => {
      starting.current = false;
      if (enabledRef.current) {
        // Chrome ended the session normally — restart silently.
        // DO NOT setWakeListening(false) here; the indicator stays lit.
        restartTimer.current = setTimeout(startRec, 250);
      } else {
        setWakeListening(false);
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

  return { wakeListening };
}
