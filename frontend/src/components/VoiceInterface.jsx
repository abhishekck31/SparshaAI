import React, { useState, useCallback, useEffect, useRef } from 'react';
import useWakeWord  from '../hooks/useWakeWord';
import useVapiVoice from '../hooks/useVapiVoice';
import MacOSDock    from './ui/mac-os-dock';
import voiceIcon    from '../assets/voice-icon.png';
import RuixenBentoCards from './ui/ruixen-bento-cards';
import { MultimodalInput } from './ui/multimodal-ai-chat-input';

// ── Design Tokens ──────────────────────────────────────────────────────────
const C = {
  bg:       '#ffffff',
  surface:  '#f8fafc',
  surfaceB: '#ffffff',
  border:   '#e2e8f0',
  accent:   '#f78166',
  accentLo: '#c4432b',
  text:     '#1a1a2e',
  muted:    '#64748b',
  dim:      '#94a3b8',
  green:    '#16a34a',
  teal:     '#2563eb',
  blue:     '#3b82f6',
  red:      '#dc2626',
  redDark:  '#991b1b',
};

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Outfit:wght@400;600;800&display=swap');
  *, *::before, *::after { box-sizing: border-box; }
  body { font-family: 'Inter', sans-serif; background-color: #ffffff; color: #1a1a2e; margin: 0; }
  @keyframes softPulse { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.05); opacity: 0.8; } 100% { transform: scale(1); opacity: 1; } }
  @keyframes orbRing { 0% { box-shadow: 0 0 0 0px var(--ring-color); opacity: 0.6; } 60% { box-shadow: 0 0 0 25px transparent; opacity: 0.1; } 100% { box-shadow: 0 0 0 0px transparent; opacity: 0; } }
  @keyframes bar { 0%, 100% { transform: scaleY(0.2); opacity: 0.6; } 50% { transform: scaleY(1); opacity: 1; } }
  @keyframes flashRed { 0%, 100% { background-color: #ffffff; } 50% { background-color: #fee2e2; } }
  @keyframes beepFlash { 0%, 100% { transform: scale(1); filter: brightness(1); } 50% { transform: scale(1.02); filter: brightness(1.2); background: #fee2e2; } }
  .shadow-card { background: #ffffff !important; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0,0,0,0.05) !important; border: none !important; }
  .emergency-pulse { animation: beepFlash 0.5s infinite; border: 2px solid #dc2626 !important; }
  .title-shimmer { background: linear-gradient(90deg, #1a1a2e 0%, #2563eb 50%, #1a1a2e 100%); background-size: 200% auto; -webkit-background-clip: text; -webkit-text-fill-color: transparent; animation: shimmer 4s linear infinite; }
  @keyframes shimmer { to { background-position: 200% center; } }
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.2); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 3000; animation: fadeIn 0.2s ease; }
  .modal-content { background: #ffffff; border-radius: 20px; padding: 24px; width: 100%; maxWidth: 380px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.15); position: relative; animation: slideUp 0.3s cubic-bezier(0.165, 0.84, 0.44, 1); border: 1px solid #e2e8f0; }
  .dosage-input { width: 100%; padding: 14px; border-radius: 10px; border: 1px solid #e2e8f0; font-size: 15px; font-weight: 600; outline: none; transition: border-color 0.2s; }
  .vital-tag { font-size: 9px; font-weight: 800; padding: 2px 5px; border-radius: 3px; background: #f1f5f9; color: #64748b; text-transform: uppercase; }
  .scroll-hide::-webkit-scrollbar { width: 4px; }
  .scroll-hide::-webkit-scrollbar-track { background: transparent; }
  .scroll-hide::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
  .pdf-btn { background: #ffffff; border: 1px solid #e2e8f0; padding: 6px; border-radius: 8px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 4px; }
  .pdf-btn:hover { background: #f1f5f9; border-color: #2563eb; color: #2563eb; }
  .alert-btn { background: #dc2626; color: #fff; border: none; padding: 10px 14px; border-radius: 8px; font-weight: 800; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s; width: 100%; }
  .alert-btn:hover { background: #991b1b; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3); }
`;

// ── Components ─────────────────────────────────────────────────────────────

function Modal({ title, isOpen, onClose, children }) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, fontFamily: "'Outfit', sans-serif" }}>{title}</h2>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontSize: 16 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Status({ callActive, aiSpeaking, thinking, wakeListening }) {
  let label = "Ready for Sparsha"; let color = C.muted;
  if (thinking) { label = "AI Thinking..."; color = C.teal; }
  else if (aiSpeaking) { label = "Sparsha Speaking"; color = C.accent; }
  else if (callActive) { label = "Listening..."; color = C.green; }
  else if (wakeListening) { label = "Wake Word Active"; color = C.green; }
  return <div style={{ textAlign: 'center' }}><div style={{ fontSize: 10, fontWeight: 900, color, letterSpacing: '0.15em', textTransform: 'uppercase' }}>{label}</div></div>;
}

function DosageCalculator({ onAskSparsha }) {
  const [weight, setWeight] = useState('');
  const [med, setMed] = useState('epinephrine');
  const [result, setResult] = useState(null);
  const calculate = () => {
    const w = parseFloat(weight); if (!w || w <= 0) return;
    let dose = 0; let unit = 'mg';
    if (med === 'epinephrine') { dose = Math.min(w * 0.01, 0.3).toFixed(3); unit = 'mg (IM)'; }
    else if (med === 'paracetamol') { dose = Math.round(w * 15); unit = 'mg (Oral)'; }
    setResult({ dose, unit });
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <input type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder="Weight (kg)" className="dosage-input" />
      <select value={med} onChange={e => setMed(e.target.value)} className="dosage-input">
        <option value="epinephrine">Epinephrine</option>
        <option value="paracetamol">Paracetamol</option>
      </select>
      <button onClick={calculate} style={{ padding: 14, background: C.text, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Calculate</button>
      {result && <div style={{ padding: 16, background: '#f0f9ff', borderRadius: 12, textAlign: 'center', fontSize: 24, fontWeight: 900, color: C.teal }}>{result.dose} {result.unit}</div>}
      <button onClick={onAskSparsha} style={{ padding: 14, background: 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>🎙️ Ask AI</button>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────

export default function VoiceInterface() {
  const [language] = useState('en');
  const [vapiPublicKey] = useState(import.meta.env.VITE_VAPI_PUBLIC_KEY || '');
  
  const { callActive, aiSpeaking, thinking, messages, emergency, startCall, endCall, dismissEmergency, injectMessage } = useVapiVoice({ publicKey: vapiPublicKey });
  const { wakeListening } = useWakeWord({ onDetected: () => { if (!callActive) startCall(language); }, enabled: !callActive, lang: 'en-US' });

  const [activeModal, setActiveModal] = useState(null);
  const [showAllPatients, setShowAllPatients] = useState(false);
  const [isEmergencyActive, setIsEmergencyActive] = useState(false);
  const [patients, setPatients] = useState([
    { id: 1, ptId: 'PT-9982A', room: '101', hr: 72, spo2: 98, rr: 16, temp: 36.8 },
    { id: 2, ptId: 'PT-7731B', room: '101', hr: 85, spo2: 96, rr: 18, temp: 37.2 },
    { id: 3, ptId: 'PT-4490C', room: '205', hr: 110, spo2: 92, rr: 24, temp: 38.5 },
    { id: 4, ptId: 'PT-1122D', room: '206', hr: 78, spo2: 99, rr: 14, temp: 36.5 },
    { id: 5, ptId: 'PT-3344E', room: '301', hr: 92, spo2: 97, rr: 20, temp: 37.8 },
  ]);

  const [staff] = useState([
    { id: 1, name: 'Dr. Sarah Wilson', role: 'Cardiac Lead', status: 'Available' },
    { id: 2, name: 'Dr. James Chen', role: 'Neuro Lead', status: 'On-Ward' },
    { id: 3, name: 'Nurse Michael Brown', role: 'Trauma Lead', status: 'Available' },
    { id: 4, name: 'Dr. Elena Rossi', role: 'Emergency MD', status: 'Available' },
  ]);

  // ── Emergency Audio Engine ───────────────────────────────────────────────
  const audioCtx = useRef(null);
  const playFastBeep = useCallback(() => {
    if (!audioCtx.current) audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.current.createOscillator();
    const gain = audioCtx.current.createGain();
    osc.type = 'square'; osc.frequency.setValueAtTime(880, audioCtx.current.currentTime);
    gain.gain.setValueAtTime(0.1, audioCtx.current.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.current.currentTime + 0.1);
    osc.connect(gain); gain.connect(audioCtx.current.destination);
    osc.start(); osc.stop(audioCtx.current.currentTime + 0.1);
  }, []);

  // ── Global Alert Listener ────────────────────────────────────────────────
  useEffect(() => {
    const eventSource = new EventSource('/api/alerts');
    eventSource.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'CRITICAL_ALERT') {
        setIsEmergencyActive(true);
        const beepInterval = setInterval(playFastBeep, 200);
        setTimeout(() => { clearInterval(beepInterval); setIsEmergencyActive(false); }, 5000);
      }
    };
    return () => eventSource.close();
  }, [playFastBeep]);

  useEffect(() => {
    const interval = setInterval(() => {
      setPatients(prev => prev.map(p => ({
        ...p,
        hr: Math.max(60, Math.min(160, p.hr + (Math.random() > 0.5 ? 1 : -1))),
        spo2: Math.max(85, Math.min(100, p.spo2 + (Math.random() > 0.8 ? 1 : (Math.random() < 0.2 ? -1 : 0)))),
      })));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const downloadPDF = (patient) => {
    const { jsPDF } = window.jspdf; const doc = new jsPDF();
    doc.setFillColor(37, 99, 235); doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(22); doc.text('SPARSHA AI', 15, 20);
    doc.autoTable({ startY: 75, head: [['VITAL', 'VALUE']], body: [['Heart Rate', patient.hr], ['Oxygen', patient.spo2]], theme: 'striped' });
    doc.save(`Report-${patient.ptId}.pdf`);
  };

  const triggerGlobalAlert = async () => {
    try {
      await fetch('/api/trigger-emergency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'CRITICAL_ALERT' })
      });
    } catch (err) { console.error("Broadcast failed"); }
  };

  const dockApps = [
    { id: 'reports', name: 'Reports', icon: 'https://cdn.jim-nielsen.com/macos/1024/finder-2021-09-10.png?rf=1024' },
    { id: 'dosage',  name: 'Dosage',  icon: 'https://cdn.jim-nielsen.com/macos/1024/calculator-2021-04-29.png?rf=1024' },
    { id: 'voice',   name: 'Voice',   icon: voiceIcon },
    { id: 'alerts',  name: 'Alerts',  icon: 'https://cdn.jim-nielsen.com/macos/1024/mail-2021-05-25.png?rf=1024' },
    { id: 'ehr',     name: 'EHR',     icon: 'https://cdn.jim-nielsen.com/macos/1024/notes-2021-05-25.png?rf=1024' },
  ];

  const handleDockClick = (id) => {
    if (id === 'voice') { if (!callActive) startCall(language); else endCall(); }
    else setActiveModal(id);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: isEmergencyActive ? '#fee2e2' : C.bg, transition: 'background-color 0.2s', color: C.text, padding: '24px 16px 120px', position: 'relative', overflow: 'hidden' }}>
      <style>{STYLES}</style>
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(to right, rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.05) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 24, maxWidth: 1400, margin: '0 auto', alignItems: 'flex-start' }}>
        
        {/* Monitoring Dashboard */}
        <div className="shadow-card" style={{ width: 400, flexShrink: 0, padding: 24, borderRadius: 20, maxHeight: 'calc(100vh - 160px)', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 800, fontFamily: "'Outfit', sans-serif" }}>📊 Ward Live Feed</h2>
          <div className="scroll-hide" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {patients.map(p => (
              <div key={p.id} style={{ padding: 16, borderRadius: 12, backgroundColor: '#f8fafc', border: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div><div style={{ fontWeight: 800, fontSize: 15 }}>{p.ptId}</div><div style={{ fontSize: 11, color: C.muted }}>Room {p.room}</div></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button className="pdf-btn" onClick={() => downloadPDF(p)}><span style={{ fontSize: 12 }}>📄</span></button>
                    <div style={{ fontSize: 20, fontWeight: 900, color: p.hr > 100 ? C.red : C.green }}>{p.hr}</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div style={{ textAlign: 'center' }}><div className="vital-tag">SpO2</div><div style={{ fontWeight: 700, fontSize: 13 }}>{p.spo2}%</div></div>
                  <div style={{ textAlign: 'center' }}><div className="vital-tag">Resp</div><div style={{ fontWeight: 700, fontSize: 13 }}>{p.rr}</div></div>
                  <div style={{ textAlign: 'center' }}><div className="vital-tag">Temp</div><div style={{ fontWeight: 700, fontSize: 13 }}>{p.temp}°</div></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main AI Interaction */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 40 }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <h1 className="title-shimmer" style={{ margin: 0, fontSize: 48, fontWeight: 900, letterSpacing: '0.15em', fontFamily: "'Outfit', sans-serif" }}>SPARSHA</h1>
            <p style={{ margin: '8px 0 0', fontSize: 11, color: C.muted, letterSpacing: '0.3em', fontWeight: 600 }}>CLINICAL AI OS</p>
          </div>
          <div onClick={() => callActive ? endCall() : startCall(language)} style={{ width: 160, height: 160, borderRadius: '50%', background: `radial-gradient(circle at 30% 30%, ${callActive ? C.green : C.teal}44, ${callActive ? C.green : C.teal})`, cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 40, boxShadow: `0 20px 40px ${callActive ? C.green : C.teal}33` }}>
            <div style={{ position: 'absolute', inset: -15, borderRadius: '50%', border: `2px solid ${callActive ? C.green : C.teal}33`, animation: 'orbRing 2s infinite' }} />
            <span style={{ fontSize: 50 }}>{callActive ? '🎙️' : '🧠'}</span>
          </div>
          <div style={{ marginBottom: 30 }}><Status callActive={callActive} aiSpeaking={aiSpeaking} thinking={thinking} wakeListening={wakeListening} /></div>
          <div style={{ display: 'flex', justifyContent: 'center', minHeight: 80, marginBottom: 40 }}>
            {thinking && <div style={{ display: 'flex', gap: 8 }}>{[0,1,2].map(i=>(<div key={i} style={{width:10,height:10,borderRadius:'50%',backgroundColor:C.teal,animation:`softPulse 1s ${i*0.2}s infinite`}}/>))}</div>}
            {callActive && !thinking && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 60 }}>
                {[0,1,2,3,4,5,6,7,8].map(i => (<div key={i} style={{ width: 6, height: 20 + Math.random() * 40, borderRadius: 3, backgroundColor: C.teal, animation: `bar ${0.4 + i * 0.05}s infinite` }} />))}
              </div>
            )}
          </div>

          {/* Multimodal Console */}
          <div style={{ width: '100%', maxWidth: 700 }}>
            <MultimodalInput 
              messages={messages.map(m => ({ role: m.role, content: m.text }))}
              isGenerating={aiSpeaking || thinking}
              onSendMessage={({ input }) => injectMessage(input)}
              onStopGenerating={endCall}
              canSend={callActive}
              className="shadow-xl"
            />
          </div>
        </div>

        {/* Staff Directory */}
        <div style={{ width: 380, flexShrink: 0 }}>
          <div className={`shadow-card ${isEmergencyActive ? 'emergency-pulse' : ''}`} style={{ padding: 24, borderRadius: 20, height: 'calc(100vh - 160px)', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 800, fontFamily: "'Outfit', sans-serif", borderBottom: `1px solid ${C.border}`, paddingBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>👨‍⚕️</span> Clinical Team
            </h3>
            <div className="scroll-hide" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {staff.map(s => (
                <div key={s.id} style={{ padding: 16, borderRadius: 12, backgroundColor: '#f8fafc', border: `1px solid ${C.border}` }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 14 }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: C.muted }}>{s.role}</div>
                      </div>
                      <div style={{ fontSize: 9, fontWeight: 800, color: s.status === 'Available' ? C.green : C.blue, background: '#fff', padding: '2px 6px', borderRadius: 4, border: '1px solid #e2e8f0' }}>{s.status.toUpperCase()}</div>
                   </div>
                   <button className="alert-btn" onClick={triggerGlobalAlert}>
                      <span>🚨</span> TRIGGER SYSTEM ALERT
                   </button>
                </div>
              ))}
            </div>
            {isEmergencyActive && (
              <div style={{ marginTop: 20, padding: 12, backgroundColor: '#dc2626', borderRadius: 10, textAlign: 'center', color: '#fff', fontWeight: 900, animation: 'softPulse 0.5s infinite' }}>
                ACTIVE EMERGENCY BROADCAST
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ position: 'relative', zIndex: 1, marginTop: 80 }}>
        <RuixenBentoCards />
      </div>

      <Modal title="Clinical Reports" isOpen={activeModal === 'reports'} onClose={() => setActiveModal(null)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {patients.map(p => (
            <div key={p.id} style={{ padding: 14, borderRadius: 10, border: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 14 }}><strong>{p.ptId}</strong></div>
              <button onClick={() => downloadPDF(p)} style={{ background: C.teal, color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>Download PDF</button>
            </div>
          ))}
        </div>
      </Modal>

      <Modal title="Dosage Calculator" isOpen={activeModal === 'dosage'} onClose={() => setActiveModal(null)}>
        <DosageCalculator onAskSparsha={() => { setActiveModal(null); startCall(language); injectMessage("Calculate dosage."); }} />
      </Modal>

      <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', zIndex: 2000 }}>
        <MacOSDock apps={dockApps} onAppClick={handleDockClick} openApps={callActive ? ['voice'] : []} />
      </div>
    </div>
  );
}
