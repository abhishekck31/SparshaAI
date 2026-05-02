import { useState, useRef, useCallback, useEffect } from 'react';

// BCP-47 language codes for SpeechSynthesis
const LANG_BCP47 = {
  en: 'en-US',
  hi: 'hi-IN',
  kn: 'kn-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  mr: 'mr-IN',
};

// Minimum blob size to distinguish a real recording from silence/microphone noise
const MIN_AUDIO_BYTES = 5000;

export default function useVoice() {
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [intent, setIntent] = useState('');
  const [needsClarification, setNeedsClarification] = useState(false);
  const [language, setLanguage] = useState('en');

  // Refs so closures always read the latest values without stale captures
  const languageRef = useRef(language);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const startListeningRef = useRef(null); // breaks circular dep between runPipeline ↔ startListening

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  // ── Text-to-speech ─────────────────────────────────────────────────────────
  const speak = useCallback((text, langCode, onEnd) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = LANG_BCP47[langCode] || 'en-US';
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    if (onEnd) {
      utterance.onend = onEnd;
    }
    window.speechSynthesis.speak(utterance);
  }, []);

  // ── Core pipeline: blob → transcribe → process → speak ────────────────────
  const runPipeline = useCallback(
    async (blob, lang) => {
      // Silence / too-short recording guard
      if (blob.size < MIN_AUDIO_BYTES) {
        setTranscript('I did not catch that, please speak again.');
        setProcessing(false);
        return;
      }

      setProcessing(true);
      setTranscript('');
      setResponse('');
      setIntent('');
      setNeedsClarification(false);

      try {
        // ── Step 1: Transcribe via Groq Whisper ──────────────────────────────
        const formData = new FormData();
        formData.append('audio', blob, 'recording.webm');
        formData.append('language', lang);

        const transcribeRes = await fetch('/api/voice/transcribe', {
          method: 'POST',
          body: formData,
        });

        if (!transcribeRes.ok) {
          throw new Error(`Transcription HTTP ${transcribeRes.status}`);
        }

        const { transcript: text } = await transcribeRes.json();

        if (!text || !text.trim()) {
          setTranscript('I did not catch that, please speak again.');
          setProcessing(false);
          return;
        }

        setTranscript(text);

        // ── Step 2: Process intent + get LLM response ────────────────────────
        const processRes = await fetch('/api/voice/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            language: lang,
            patient_id: 'P001',
            room: 'Demo-Room',
          }),
        });

        if (!processRes.ok) {
          throw new Error(`Process HTTP ${processRes.status}`);
        }

        const result = await processRes.json();

        setResponse(result.response);
        setIntent(result.intent);
        setNeedsClarification(result.needs_clarification || false);

        // ── Step 3: Speak; auto-restart if clarification needed ───────────────
        if (result.needs_clarification) {
          speak(result.response, lang, () => {
            // Re-enter the listening loop for the follow-up answer
            startListeningRef.current?.();
          });
        } else {
          speak(result.response, lang);
        }
      } catch (err) {
        console.error('[useVoice] Pipeline error:', err);
        setTranscript('Error processing audio. Please check your connection and try again.');
      } finally {
        setProcessing(false);
      }
    },
    [speak]
    // Note: startListening reached via ref to avoid circular dependency
  );

  // ── Start recording ────────────────────────────────────────────────────────
  const startListening = useCallback(async () => {
    if (listening || processing) return;

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (err) {
      console.error('[useVoice] Microphone access denied:', err);
      setTranscript('Microphone access denied. Please allow microphone permissions and try again.');
      return;
    }

    // Prefer webm; fall back to browser default
    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
    const recorderOptions = mimeType ? { mimeType } : {};
    const mediaRecorder = new MediaRecorder(stream, recorderOptions);
    mediaRecorderRef.current = mediaRecorder;
    chunksRef.current = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const recordedMime = mediaRecorder.mimeType || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type: recordedMime });
      stream.getTracks().forEach((t) => t.stop());
      setListening(false);
      runPipeline(blob, languageRef.current);
    };

    mediaRecorder.start();
    setListening(true);
  }, [listening, processing, runPipeline]);

  // Keep ref in sync so runPipeline can call startListening without it as a dep
  startListeningRef.current = startListening;

  // ── Stop recording ─────────────────────────────────────────────────────────
  const stopListening = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop();
    }
  }, []);

  return {
    listening,
    processing,
    transcript,
    response,
    intent,
    needsClarification,
    language,
    setLanguage,
    startListening,
    stopListening,
  };
}
