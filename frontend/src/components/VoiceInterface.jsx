import React, { useState, useCallback, useEffect, useRef } from 'react';
import useWakeWord  from '../hooks/useWakeWord';
import useVapiVoice from '../hooks/useVapiVoice';
import voiceIcon    from '../assets/voice-icon.png';
import RuixenBentoCards from './ui/ruixen-bento-cards';
import { MultimodalInput } from './ui/multimodal-ai-chat-input';

// ── Design Tokens ──────────────────────────────────────────────────────────
const C = {
  bg:       '#ffffff',
  surface:  '#f8fafc',
  border:   '#e2e8f0',
  accent:   '#f78166',
  text:     '#1a1a2e',
  muted:    '#64748b',
  green:    '#16a34a',
  teal:     '#2563eb',
  blue:     '#3b82f6',
  red:      '#dc2626',
};

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Outfit:wght@400;600;800&display=swap');
  *, *::before, *::after { box-sizing: border-box; }
  body { font-family: 'Inter', sans-serif; background-color: #ffffff; color: #1a1a2e; margin: 0; }
  @keyframes softPulse { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.05); opacity: 0.8; } 100% { transform: scale(1); opacity: 1; } }
  @keyframes beepFlash { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.02); background: #fee2e2; } }
  @keyframes slideText { 0% { transform: translateY(20px); opacity: 0; } 10% { transform: translateY(0); opacity: 1; } 90% { transform: translateY(0); opacity: 1; } 100% { transform: translateY(-20px); opacity: 0; } }
  @keyframes visionScan { 0% { top: 0%; opacity: 0; } 50% { opacity: 1; } 100% { top: 100%; opacity: 0; } }
  .shadow-card { background: #ffffff !important; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0,0,0,0.05) !important; border: none !important; }
  .emergency-pulse { animation: beepFlash 0.5s infinite; border: 2px solid #dc2626 !important; }
  .pdf-btn { background: #ffffff; border: 1px solid #e2e8f0; padding: 6px; border-radius: 8px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; }
  .pdf-btn:hover { background: #f1f5f9; border-color: #2563eb; color: #2563eb; }
  .vital-tag { font-size: 9px; font-weight: 800; padding: 2px 5px; border-radius: 3px; background: #f1f5f9; color: #64748b; text-transform: uppercase; }
  .risk-badge { font-size: 9px; font-weight: 900; padding: 3px 8px; border-radius: 100px; text-transform: uppercase; letter-spacing: 0.05em; }
  .scroll-hide::-webkit-scrollbar { width: 4px; }
  .scroll-hide::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
  .vision-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(12px); z-index: 5000; display: flex; align-items: center; justify-content: center; }
  .vision-content { background: #fff; width: 100%; maxWidth: 900px; height: 600px; border-radius: 32px; display: flex; overflow: hidden; box-shadow: 0 50px 100px -20px rgba(0,0,0,0.3); }
`;

// ── Components ─────────────────────────────────────────────────────────────

function Sparkline({ color = C.blue }) {
  return (
    <svg width="60" height="20" viewBox="0 0 60 20" style={{ opacity: 0.6 }}>
      <path d="M0 10 Q 5 0, 10 10 T 20 10 T 30 10 T 40 10 T 50 10 T 60 10" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
        <animate attributeName="d" dur="2s" repeatCount="indefinite" values="M0 10 Q 5 0, 10 10 T 20 10 T 30 10 T 40 10 T 50 10 T 60 10; M0 10 Q 5 20, 10 10 T 20 10 T 30 10 T 40 10 T 50 10 T 60 10; M0 10 Q 5 0, 10 10 T 20 10 T 30 10 T 40 10 T 50 10 T 60 10" />
      </path>
    </svg>
  );
}

function Status({ callActive, aiSpeaking, thinking, wakeListening, lastTranscript }) {
  let label = "Ready for Sparsha"; let color = C.muted;
  if (thinking) { label = "AI Thinking..."; color = C.teal; }
  else if (aiSpeaking) { label = "Sparsha Speaking"; color = C.accent; }
  else if (callActive) { label = "Listening..."; color = C.green; }
  else if (wakeListening) { label = "Always-On Mic Active"; color = C.blue; }
  return (
    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 900, color, letterSpacing: '0.15em', textTransform: 'uppercase' }}>{label}</div>
      {wakeListening && !callActive && (
        <div style={{ fontSize: '10px', color: C.muted, fontStyle: 'italic', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Mic Hearing: "{lastTranscript || 'Waiting for speech...'}"
        </div>
      )}
      {callActive && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', backgroundColor: '#eff6ff', borderRadius: '100px', border: `1px solid #dbeafe`, color: '#2563eb', fontSize: '9px', fontWeight: '800' }}>🛡️ NOISE SHIELD ACTIVE</div>
      )}
    </div>
  );
}

function ThoughtTicker() {
  const [index, setIndex] = useState(0);
  const thoughts = ["Analyzing ECG patterns...", "Calculating cardiac stability index...", "Predicting sepsis risk...", "Monitoring respiratory compensation...", "Awaiting clinical intent..."];
  useEffect(() => { const int = setInterval(() => setIndex(i => (i + 1) % thoughts.length), 4000); return () => clearInterval(int); }, []);
  return (
    <div style={{ height: 20, overflow: 'hidden', marginTop: 12 }}>
       <div key={index} style={{ fontSize: 11, fontWeight: 700, color: C.teal, opacity: 0.7, animation: 'slideText 4s infinite', textAlign: 'center', letterSpacing: '0.02em' }}>{thoughts[index]}</div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────

export default function VoiceInterface() {
  const [vapiPublicKey] = useState(import.meta.env.VITE_VAPI_PUBLIC_KEY || '');
  const { connecting, callActive, aiSpeaking, thinking, messages, startCall, endCall, injectMessage, say, error: vapiError } = useVapiVoice({ publicKey: vapiPublicKey });

  // ── Always-On Wake Word Integration ─────────────────────────────────────
  // Only enable when NOT active and NOT connecting to avoid mic contention
  const { wakeListening, lastTranscript } = useWakeWord({
    enabled: !callActive && !connecting,
    onDetected: () => {
      console.log('[WAKE] Word detected! Preparing handover...');
      // Small delay to let the browser release the mic lock
      setTimeout(() => startCall('en'), 300);
    }
  });

  const [fleet, setFleet] = useState([
    { id: 'AMB-01', distance: 4.2, eta: 12, status: 'transit' },
    { id: 'AMB-02', distance: 1.8, eta: 5, status: 'transit' },
    { id: 'AMB-03', distance: 0.5, eta: 2, status: 'transit' }
  ]);

  const speak = (text) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.05;
    window.speechSynthesis.speak(utterance);
  };

  const handleInformDesk = async (id) => {
    setFleet(prev => prev.map(a => a.id === id ? { ...a, status: 'reception_arranged' } : a));
    speak(`Ambulance reception arranged for ${id}, ward also has been assigned with all vital tracking devices.`);
    
    try {
      await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: `AMB-IN-${Date.now()}`,
          room_number: 'ENTRANCE',
          situation: `AMBULANCE INCOMING: ${id}`,
          reason: 'Reception Arranged. Medical ward and vital monitors assigned.',
          status: 'pending',
          is_simulated: true
        })
      });
    } catch (err) { console.error('[FLEET] Alert broadcast failed:', err); }
  };

  const [isVisionActive, setIsVisionActive] = useState(false);
  const [visionImage, setVisionImage] = useState(null);
  const [showAllPatients, setShowAllPatients] = useState(false);
  const [isEmergencyActive, setIsEmergencyActive] = useState(false);
  
  const [patients, setPatients] = useState([
    { id: 1, ptId: 'PT-9982A', room: '101', hr: 72, spo2: 98, rr: 16, temp: 36.8, risk: 8 },
    { id: 2, ptId: 'PT-7731B', room: '101', hr: 85, spo2: 96, rr: 18, temp: 37.2, risk: 15 },
    { id: 3, ptId: 'PT-4490C', room: '205', hr: 110, spo2: 92, rr: 24, temp: 38.5, risk: 64 },
    { id: 4, ptId: 'PT-1122D', room: '206', hr: 78, spo2: 99, rr: 14, temp: 36.5, risk: 4 },
    { id: 5, ptId: 'PT-3344E', room: '301', hr: 92, spo2: 97, rr: 20, temp: 37.8, risk: 22 },
  ]);

  // ── AUTO-PROXIMITY ALERTS ────────────────────────────────────────────────
  const alertedRefs = useRef(new Set());
  useEffect(() => {
    fleet.forEach(amb => {
      if (amb.distance <= 0.5 && !alertedRefs.current.has(amb.id)) {
        alertedRefs.current.add(amb.id);
        console.log(`[PROXIMITY] ${amb.id} at ${amb.distance}km. Sending auto-alert...`);
        fetch('/api/alerts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: `AUTO-${amb.id}-${Date.now()}`,
            room_number: 'ENTRANCE',
            situation: `🚨 CRITICAL ARRIVAL: ${amb.id}`,
            reason: `Ambulance is less than 500m away. ETA: ${amb.eta} mins. Prepare ER team.`,
            status: 'pending',
            is_simulated: true
          })
        }).catch(err => console.error('[PROXIMITY] Auto-alert failed:', err));
      }
    });
  }, [fleet]);

  const [staff] = useState([
    { id: 1, name: 'Dr. Sarah Wilson', role: 'Chief Cardiac Surgeon', status: 'Available' },
    { id: 2, name: 'Dr. James Chen', role: 'Neuro Intensivist', status: 'On-Ward' },
  ]);

  // ── Predictive Engine ──────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setPatients(prev => prev.map(p => {
        const nextHR = Math.max(60, Math.min(160, p.hr + (Math.random() > 0.5 ? 2 : -2)));
        const nextSPO2 = Math.max(85, Math.min(100, p.spo2 + (Math.random() > 0.8 ? 1 : (Math.random() < 0.2 ? -1 : 0))));
        let risk = 5;
        if (nextHR > 100) risk += 20; if (nextSPO2 < 95) risk += 15;
        return { ...p, hr: nextHR, spo2: nextSPO2, risk: Math.min(99, risk + Math.floor(Math.random() * 10)) };
      }));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────────
  const [ambulances, setAmbulances] = useState([]);
  const acknowledgedIds = useRef(new Set());
  
  useEffect(() => {
    const evtSource = new EventSource('/api/alerts/stream');
    evtSource.onmessage = (e) => {
      try {
        const alerts = JSON.parse(e.data);
        if (Array.isArray(alerts)) {
          // Track Ambulances
          setAmbulances(alerts.filter(a => a.room_number === 'ENTRANCE' && a.status === 'pending'));
          
          // Voice Feedback
          alerts.forEach(a => {
            if (a.status === 'acknowledged' && !acknowledgedIds.current.has(a.id)) {
              acknowledgedIds.current.add(a.id);
              say(`The alert for Room ${a.room_number} has been acknowledged. The medical team is on the way.`);
            }
          });
        }
      } catch (err) { console.error(err); }
    };
    return () => evtSource.close();
  }, [injectMessage]);

  const triggerGlobalAlert = async () => {
    try { await fetch('/api/trigger-emergency', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'CRITICAL_ALERT' }) }); } catch (err) {}
  };

  const [visionData, setVisionData] = useState({ finding: 'Scanning...', analysis: 'AI is processing clinical imagery...', recommendation: 'Awaiting results...' });

  const handleVisionUpload = async (files) => {
    if (files && files[0]) {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = (e) => { 
        setVisionImage(e.target.result); 
        setIsVisionActive(true); 
        setVisionData({ finding: 'AI Scanning...', analysis: 'Analyzing clinical patterns...', recommendation: 'Consulting Neural Mesh...' });
      };
      reader.readAsDataURL(file);

      const formData = new FormData();
      formData.append('image', file);
      try {
        const res = await fetch('/api/voice/vision', { method: 'POST', body: formData });
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || 'Server error during analysis');
        }

        if (data.analysis) {
          setVisionData({
            finding: "Clinical Observation Ready",
            analysis: data.analysis,
            recommendation: "Review findings and confirm emergency triage status."
          });
          say(data.analysis);
        }
      } catch (err) {
        console.error("[SPARSHA] Vision error:", err);
        setVisionData({ 
          finding: 'Analysis Error', 
          analysis: err.message || 'Could not reach vision engine.', 
          recommendation: 'Check server logs or GROQ_API_KEY.' 
        });
      }
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: isEmergencyActive ? '#fee2e2' : C.bg, transition: 'background-color 0.2s', padding: '24px 16px 120px', position: 'relative' }}>
      <style>{STYLES}</style>
      
      {/* ERROR BANNER */}
      {vapiError && (
        <div style={{ 
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10000, 
          backgroundColor: C.red, color: '#fff', padding: '12px 20px', 
          textAlign: 'center', fontWeight: 800, fontSize: '13px',
          boxShadow: '0 4px 10px rgba(0,0,0,0.2)'
        }}>
          ⚠️ SYSTEM ERROR: {String(vapiError).toLowerCase().includes('balance') ? 'INSUFFICIENT VAPI CREDITS' : String(vapiError).toUpperCase()}
          <button onClick={() => window.location.reload()} style={{ marginLeft: 20, background: '#fff', color: C.red, border: 'none', padding: '4px 10px', borderRadius: 4, fontWeight: 900, cursor: 'pointer' }}>REFRESH SYSTEM</button>
        </div>
      )}

      <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(to right, rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.05) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 24, maxWidth: 1400, margin: '0 auto', alignItems: 'flex-start' }}>
        
        {/* Ward Feed */}
        <div className="shadow-card" style={{ width: 380, flexShrink: 0, padding: 24, borderRadius: 24, height: 'calc(100vh - 160px)', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 900, fontFamily: "'Outfit', sans-serif" }}>📊 Ward Live Feed</h2>
          <div className="scroll-hide" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {patients.map(p => (
              <div key={p.id} style={{ padding: 16, borderRadius: 16, backgroundColor: p.risk > 60 ? '#fff1f2' : '#f8fafc', border: `1px solid ${p.risk > 60 ? C.red : C.border}`, position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div><div style={{ fontWeight: 800, fontSize: 14 }}>{p.ptId}</div><div style={{ fontSize: 10, color: C.muted }}>Room {p.room}</div></div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button 
                      onClick={() => {
                        const content = `SPARSHA AI CLINICAL REPORT\nPatient: ${p.ptId}\nRoom: ${p.room}\nTime: ${new Date().toLocaleString()}\n\nVITALS:\nHeart Rate: ${p.hr} bpm\nSpO2: ${p.spo2}%\nTemperature: ${p.temp}°C\nRR: ${p.rr}\n\nAI RISK ASSESSMENT: ${p.risk}%\nStatus: ${p.risk > 60 ? 'CRITICAL' : (p.risk > 30 ? 'GUARDED' : 'STABLE')}\n\nRecommendation: ${p.risk > 60 ? 'Immediate physician bedside review required.' : 'Routine monitoring.'}`;
                        const blob = new Blob([content], { type: 'text/plain' });
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a'); a.href = url; a.download = `Report_${p.ptId}.txt`; a.click();
                      }}
                      title="Download Patient Report"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, opacity: 0.6 }}
                    >
                      📥
                    </button>
                    <div className="risk-badge" style={{ backgroundColor: p.risk > 60 ? C.red : (p.risk > 30 ? C.accent : C.green), color: '#fff' }}>RISK: {p.risk}%</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr', gap: 8, alignItems: 'center' }}>
                  <div style={{ textAlign: 'center' }}><div className="vital-tag">HR</div><div style={{ fontWeight: 700, fontSize: 14, color: p.hr > 100 ? C.red : C.text }}>{p.hr}</div></div>
                  <div style={{ textAlign: 'center' }}><div className="vital-tag">SpO2</div><div style={{ fontWeight: 700, fontSize: 14, color: p.spo2 < 95 ? C.red : C.text }}>{p.spo2}%</div></div>
                  <div style={{ textAlign: 'right' }}><Sparkline color={p.risk > 60 ? C.red : C.blue} /></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main AI Interaction */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 20 }}>
          <div style={{ textAlign: 'center', marginBottom: 30 }}>
            <h1 style={{ margin: 0, fontSize: 48, fontWeight: 900, fontFamily: "'Outfit', sans-serif", letterSpacing: '0.05em' }}>SPARSHA AI</h1>
            <p style={{ margin: '4px 0 0', fontSize: 10, color: C.muted, letterSpacing: '0.4em', fontWeight: 800 }}>CLINICAL INTELLIGENCE OS</p>
          </div>
          <div onClick={() => callActive ? endCall() : startCall('en')} style={{ width: 140, height: 140, borderRadius: '50%', background: `radial-gradient(circle at 30% 30%, ${callActive ? C.green : C.blue}44, ${callActive ? C.green : C.blue})`, cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10, boxShadow: `0 20px 40px ${callActive ? C.green : C.blue}33` }}>
            <div style={{ position: 'absolute', inset: -12, borderRadius: '50%', border: `2px solid ${callActive ? C.green : C.blue}33`, animation: 'softPulse 2s infinite' }} />
            <span style={{ fontSize: 40 }}>{callActive ? '🎙️' : '🧠'}</span>
          </div>
          <Status callActive={callActive} aiSpeaking={aiSpeaking} thinking={thinking} wakeListening={wakeListening} lastTranscript={lastTranscript} />
          <ThoughtTicker />

          {/* ── LIVE AMBULANCE RADAR (Always Visible) ───────────────────── */}
          <div style={{ 
            width: '100%', maxWidth: 700, marginTop: 20, 
            background: '#fff', borderRadius: 24, padding: '20px 24px', 
            boxShadow: '0 10px 40px rgba(0,0,0,0.05)', border: `1px solid ${C.border}`,
            position: 'relative', overflow: 'hidden'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: ambulances.length > 0 ? 16 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 24 }}>🚑</span>
                <span style={{ fontWeight: 800, fontSize: 14, fontFamily: "'Outfit', sans-serif", letterSpacing: '0.05em', color: ambulances.length > 0 ? '#2563eb' : C.text }}>
                  LIVE AMBULANCE RADAR
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: ambulances.length > 0 ? '#2563eb' : '#16a34a', animation: 'softPulse 2s infinite' }} />
                <span style={{ fontSize: 10, fontWeight: 800, color: C.muted }}>
                  {ambulances.length > 0 ? 'INBOUND TRAFFIC' : 'MONITORING CLEAR'}
                </span>
              </div>
            </div>

            {ambulances.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {ambulances.map(a => (
                  <div key={a.id} style={{ 
                    background: '#f8fafc', padding: '12px 16px', borderRadius: 16, 
                    border: `1px solid ${parseFloat(a.distance) <= 1.0 ? '#fee2e2' : C.border}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 800, color: C.muted, textTransform: 'uppercase' }}>ETA / DISTANCE</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{a.eta} MIN / {a.distance} KM</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 9, fontWeight: 800, color: (parseFloat(a.distance) <= 1.0) ? C.red : '#2563eb' }}>
                        {(parseFloat(a.distance) <= 1.0) ? '• INBOUND' : '• APPROACHING'}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>ENTRANCE</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          {/* ─────────────────────────────────────────────────────────── */}
          <div style={{ width: '100%', maxWidth: 700, marginTop: 30 }}>
            <MultimodalInput 
              messages={messages.map(m => ({ role: m.role, content: m.text }))}
              isGenerating={aiSpeaking || thinking}
              onSendMessage={({ input, attachments }) => {
                if (attachments?.length > 0) {
                  // Extract the raw file from the attachment object
                  const file = attachments[0].file || attachments[0];
                  handleVisionUpload([file]);
                } else {
                  injectMessage(input);
                }
              }}
              onStopGenerating={endCall}
              canSend={callActive}
            />
          </div>
        </div>

        {/* Team Hub */}
        <div style={{ width: 380, flexShrink: 0 }}>
          <div className="shadow-card" style={{ padding: 24, borderRadius: 24, height: 'calc(100vh - 160px)' }}>
             <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 800, fontFamily: "'Outfit', sans-serif" }}>👨‍⚕️ Team Hub</h3>
             {staff.map(s => (
               <div key={s.id} style={{ padding: 16, borderRadius: 16, backgroundColor: '#f8fafc', border: `1px solid ${C.border}`, marginBottom: 12 }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>{s.role}</div>
                  <button style={{ background: C.green, color: '#fff', border: 'none', padding: '10px', borderRadius: 10, fontWeight: 800, fontSize: 11, cursor: 'pointer', width: '100%' }} onClick={triggerGlobalAlert}>🚨 ALERT</button>
               </div>
             ))}
          </div>
        </div>
      </div>

      {/* Instant Vision Diagnostic Modal */}
      {isVisionActive && (
        <div className="vision-modal" onClick={() => setIsVisionActive(false)}>
           <div className="vision-content" onClick={e => e.stopPropagation()}>
              <div style={{ flex: 1.2, backgroundColor: '#000', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                 <img src={visionImage} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                 <div style={{ position: 'absolute', left: 0, right: 0, height: '2px', background: C.teal, boxShadow: `0 0 15px ${C.teal}`, animation: 'visionScan 3s infinite', zIndex: 10 }}></div>
                 <div style={{ position: 'absolute', top: 20, left: 20, background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '8px 12px', borderRadius: 8, fontSize: 11, fontWeight: 800 }}>LIVE AI SCANNING...</div>
              </div>
              <div style={{ flex: 1, padding: '40px', display: 'flex', flexDirection: 'column' }}>
                 <h2 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 900, fontSize: 24, margin: '0 0 10px' }}>Clinical Analysis</h2>
                 <div style={{ backgroundColor: '#eff6ff', padding: '12px', borderRadius: 12, color: C.blue, fontSize: 11, fontWeight: 800, marginBottom: 24 }}>AI-GENERATED INSIGHTS</div>
                 <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div style={{ borderLeft: `4px solid ${C.red}`, paddingLeft: 16 }}>
                       <span style={{ fontSize: 10, fontWeight: 900, color: C.red, textTransform: 'uppercase' }}>Key Finding</span>
                       <p style={{ margin: '4px 0', fontSize: 15, fontWeight: 600 }}>{visionData.finding}</p>
                    </div>
                    <div style={{ borderLeft: `4px solid ${C.blue}`, paddingLeft: 16 }}>
                       <span style={{ fontSize: 10, fontWeight: 900, color: C.blue, textTransform: 'uppercase' }}>Analysis</span>
                       <p style={{ margin: '4px 0', fontSize: 13, color: C.text, lineHeight: 1.6 }}>{visionData.analysis}</p>
                    </div>
                    <div style={{ borderLeft: `4px solid ${C.green}`, paddingLeft: 16 }}>
                       <span style={{ fontSize: 10, fontWeight: 900, color: C.green, textTransform: 'uppercase' }}>Recommendation</span>
                       <p style={{ margin: '4px 0', fontSize: 13, color: C.text, lineHeight: 1.6 }}>{visionData.recommendation}</p>
                    </div>
                 </div>
                 <button onClick={() => setIsVisionActive(false)} style={{ marginTop: 30, background: '#1a1a2e', color: '#fff', border: 'none', padding: '14px', borderRadius: 16, fontWeight: 800, cursor: 'pointer' }}>CLOSE ANALYSIS</button>
              </div>
           </div>
        </div>
      )}

      <div style={{ position: 'relative', zIndex: 1, marginTop: 80 }}><RuixenBentoCards /></div>

      {/* VOICE AI CONTROL (Bottom Right) */}
      <div style={{ position: 'fixed', bottom: '32px', right: '32px', zIndex: 2000 }}>
        <button 
          onClick={callActive ? endCall : () => startCall('en')}
          style={{
            background: callActive ? C.red : C.blue,
            color: '#fff',
            border: 'none',
            padding: '16px 32px',
            borderRadius: '100px',
            fontWeight: 800,
            fontSize: 14,
            cursor: 'pointer',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: callActive ? 'scale(1.05)' : 'scale(1)'
          }}
        >
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#fff', animation: callActive ? 'softPulse 1.5s infinite' : 'none' }} />
          {callActive ? 'END VOICE SESSION' : 'ACTIVATE VOICE AI'}
        </button>
      </div>

      {/* AMBULANCE FLEET HUD (Bottom Left) */}
      <div style={{ position: 'fixed', bottom: 32, left: 32, zIndex: 100, display: 'flex', flexDirection: 'column', gap: 16, width: 340 }}>
        <div style={{ background: '#1e293b', color: '#fff', padding: '16px 20px', borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', opacity: 0.6, marginBottom: 12, textTransform: 'uppercase' }}>📡 LIVE FLEET TELEMETRY</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {fleet.map(amb => (
              <div key={amb.id} style={{ background: 'rgba(255,255,255,0.05)', padding: 12, borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#3b82f6' }}>🚚 {amb.id}</div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: amb.distance <= 1.0 ? '#ef4444' : '#10b981' }}>
                    {amb.distance.toFixed(1)} KM
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.7 }}>ETA: {amb.eta} MIN</div>
                  {amb.status === 'transit' ? (
                    <button 
                      onClick={() => handleInformDesk(amb.id)}
                      style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: 9, fontWeight: 800, cursor: 'pointer' }}
                    >
                      INFORM DESK
                    </button>
                  ) : (
                    <div style={{ fontSize: 9, fontWeight: 800, color: '#10b981' }}>✅ ARRANGED</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
