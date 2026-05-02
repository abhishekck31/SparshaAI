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
  .shadow-card { background: #ffffff !important; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0,0,0,0.05) !important; border: none !important; }
  .emergency-pulse { animation: beepFlash 0.5s infinite; border: 2px solid #dc2626 !important; }
  .pdf-btn { background: #ffffff; border: 1px solid #e2e8f0; padding: 6px; border-radius: 8px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; }
  .pdf-btn:hover { background: #f1f5f9; border-color: #2563eb; color: #2563eb; }
  .vital-tag { font-size: 9px; font-weight: 800; padding: 2px 5px; border-radius: 3px; background: #f1f5f9; color: #64748b; text-transform: uppercase; }
  .scroll-hide::-webkit-scrollbar { width: 4px; }
  .scroll-hide::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
`;

function Status({ callActive, aiSpeaking, thinking }) {
  let label = "Ready for Sparsha"; let color = C.muted;
  if (thinking) { label = "AI Thinking..."; color = C.teal; }
  else if (aiSpeaking) { label = "Sparsha Speaking"; color = C.accent; }
  else if (callActive) { label = "Listening..."; color = C.green; }
  return <div style={{ textAlign: 'center' }}><div style={{ fontSize: 10, fontWeight: 900, color, letterSpacing: '0.15em', textTransform: 'uppercase' }}>{label}</div></div>;
}

export default function VoiceInterface() {
  const [vapiPublicKey] = useState(import.meta.env.VITE_VAPI_PUBLIC_KEY || '');
  const { callActive, aiSpeaking, thinking, messages, startCall, endCall, injectMessage } = useVapiVoice({ publicKey: vapiPublicKey });

  const [activeModal, setActiveModal] = useState(null);
  const [showAllPatients, setShowAllPatients] = useState(false);
  const [isEmergencyActive, setIsEmergencyActive] = useState(false);
  
  const [patients, setPatients] = useState([
    { id: 1, ptId: 'PT-9982A', room: '101', hr: 72, spo2: 98, rr: 16, temp: 36.8 },
    { id: 2, ptId: 'PT-7731B', room: '101', hr: 85, spo2: 96, rr: 18, temp: 37.2 },
    { id: 3, ptId: 'PT-4490C', room: '205', hr: 110, spo2: 92, rr: 24, temp: 38.5 },
    { id: 4, ptId: 'PT-1122D', room: '206', hr: 78, spo2: 99, rr: 14, temp: 36.5 },
    { id: 5, ptId: 'PT-3344E', room: '301', hr: 92, spo2: 97, rr: 20, temp: 37.8 },
    { id: 6, ptId: 'PT-5566F', room: '302', hr: 68, spo2: 95, rr: 16, temp: 36.9 },
    { id: 7, ptId: 'PT-7788G', room: '401', hr: 81, spo2: 98, rr: 17, temp: 37.1 },
    { id: 8, ptId: 'PT-9900H', room: '402', hr: 105, spo2: 93, rr: 22, temp: 38.1 },
    { id: 9, ptId: 'PT-2233I', room: '501', hr: 74, spo2: 100, rr: 12, temp: 36.4 },
    { id: 10, ptId: 'PT-4455J', room: '502', hr: 88, spo2: 96, rr: 19, temp: 37.3 },
  ]);

  const [staff] = useState([
    { id: 1, name: 'Dr. Sarah Wilson', role: 'Chief Cardiac Surgeon', status: 'Available' },
    { id: 2, name: 'Dr. James Chen', role: 'Neuro Intensivist', status: 'On-Ward' },
    { id: 3, name: 'Nurse Michael Brown', role: 'Trauma Lead', status: 'Busy' },
    { id: 4, name: 'Dr. Elena Rossi', role: 'Emergency Physician', status: 'Available' },
    { id: 5, name: 'Nurse Joy Singh', role: 'ICU Supervisor', status: 'Available' },
  ]);

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
    try {
      const { jsPDF } = window.jspdf; const doc = new jsPDF();
      doc.setFillColor(37, 99, 235); doc.rect(0, 0, 210, 30, 'F');
      doc.setTextColor(255, 255, 255); doc.setFontSize(22); doc.text('SPARSHA AI', 15, 20);
      doc.setFontSize(18); doc.setTextColor(26, 26, 46); doc.text(`Clinical Report: ${patient.ptId}`, 15, 50);
      doc.autoTable({ startY: 75, head: [['VITAL', 'VALUE', 'UNIT']], body: [['Heart Rate', patient.hr, 'BPM'], ['Oxygen', patient.spo2, '%'], ['Resp', patient.rr, 'RR'], ['Temp', patient.temp, '°C']], theme: 'striped' });
      doc.save(`Report-${patient.ptId}.pdf`);
    } catch (e) { alert("PDF Engine Error"); }
  };

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

  const triggerGlobalAlert = async () => {
    try { await fetch('/api/trigger-emergency', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'CRITICAL_ALERT' }) }); } catch (err) {}
  };

  const dockApps = [
    { id: 'reports', name: 'Reports', icon: 'https://cdn.jim-nielsen.com/macos/1024/finder-2021-09-10.png?rf=1024' },
    { id: 'dosage',  name: 'Dosage',  icon: 'https://cdn.jim-nielsen.com/macos/1024/calculator-2021-04-29.png?rf=1024' },
    { id: 'voice',   name: 'Voice',   icon: voiceIcon },
    { id: 'ehr',     name: 'EHR',     icon: 'https://cdn.jim-nielsen.com/macos/1024/notes-2021-05-25.png?rf=1024' },
  ];

  const handleDockClick = (id) => {
    if (id === 'voice') { if (!callActive) startCall('en'); else endCall(); }
    else setActiveModal(id);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: isEmergencyActive ? '#fee2e2' : C.bg, transition: 'background-color 0.2s', padding: '24px 16px 120px', position: 'relative' }}>
      <style>{STYLES}</style>
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(to right, rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.05) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 24, maxWidth: 1400, margin: '0 auto', alignItems: 'flex-start' }}>
        
        {/* Ward Feed */}
        <div className="shadow-card" style={{ width: 380, flexShrink: 0, padding: 24, borderRadius: 24, height: 'calc(100vh - 160px)', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 900, fontFamily: "'Outfit', sans-serif" }}>📊 Ward Live Feed</h2>
          <div className="scroll-hide" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(showAllPatients ? patients : patients.slice(0, 3)).map(p => (
              <div key={p.id} style={{ padding: 16, borderRadius: 16, backgroundColor: '#f8fafc', border: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div><div style={{ fontWeight: 800, fontSize: 14 }}>{p.ptId}</div><div style={{ fontSize: 10, color: C.muted }}>Room {p.room}</div></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button className="pdf-btn" onClick={() => downloadPDF(p)}>📄</button>
                    <div style={{ fontSize: 20, fontWeight: 900, color: p.hr > 100 ? C.red : C.green }}>{p.hr}</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div style={{ textAlign: 'center' }}><div className="vital-tag">SpO2</div><div style={{ fontWeight: 700, fontSize: 12 }}>{p.spo2}%</div></div>
                  <div style={{ textAlign: 'center' }}><div className="vital-tag">Resp</div><div style={{ fontWeight: 700, fontSize: 12 }}>{p.rr}</div></div>
                  <div style={{ textAlign: 'center' }}><div className="vital-tag">Temp</div><div style={{ fontWeight: 700, fontSize: 12 }}>{p.temp}°</div></div>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setShowAllPatients(!showAllPatients)} style={{ marginTop: 16, width: '100%', padding: '12px', borderRadius: '12px', border: `1px solid ${C.border}`, background: 'transparent', fontWeight: 800, color: C.muted, cursor: 'pointer' }}>{showAllPatients ? 'SHOW CRITICAL' : 'VIEW ALL PATIENTS'}</button>
        </div>

        {/* Main AI Interaction */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 20 }}>
          <div style={{ textAlign: 'center', marginBottom: 30 }}>
            <h1 style={{ margin: 0, fontSize: 48, fontWeight: 900, fontFamily: "'Outfit', sans-serif", letterSpacing: '0.05em' }}>SPARSHA AI</h1>
            <p style={{ margin: '4px 0 0', fontSize: 10, color: C.muted, letterSpacing: '0.4em', fontWeight: 800 }}>CLINICAL OS</p>
          </div>
          <div onClick={() => callActive ? endCall() : startCall('en')} style={{ width: 140, height: 140, borderRadius: '50%', background: `radial-gradient(circle at 30% 30%, ${callActive ? C.green : C.blue}44, ${callActive ? C.green : C.blue})`, cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 30, boxShadow: `0 20px 40px ${callActive ? C.green : C.blue}33` }}>
            <div style={{ position: 'absolute', inset: -12, borderRadius: '50%', border: `2px solid ${callActive ? C.green : C.blue}33`, animation: 'softPulse 2s infinite' }} />
            <span style={{ fontSize: 40 }}>{callActive ? '🎙️' : '🧠'}</span>
          </div>
          <div style={{ marginBottom: 20 }}><Status callActive={callActive} aiSpeaking={aiSpeaking} thinking={thinking} /></div>
          <div style={{ width: '100%', maxWidth: 700 }}>
            <MultimodalInput 
              messages={messages.map(m => ({ role: m.role, content: m.text }))}
              isGenerating={aiSpeaking || thinking}
              onSendMessage={({ input }) => injectMessage(input)}
              onStopGenerating={endCall}
              canSend={callActive}
            />
          </div>
        </div>

        {/* Clinical Team Hub */}
        <div style={{ width: 380, flexShrink: 0 }}>
          <div className={`shadow-card ${isEmergencyActive ? 'emergency-pulse' : ''}`} style={{ padding: 24, borderRadius: 24, height: 'calc(100vh - 160px)', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 900, fontFamily: "'Outfit', sans-serif" }}>👨‍⚕️ Clinical Team Hub</h3>
            <div className="scroll-hide" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {staff.map((s) => (
                <div key={s.id} style={{ padding: 16, borderRadius: 16, backgroundColor: '#f8fafc', border: `1px solid ${C.border}` }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 14 }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: C.muted }}>{s.role}</div>
                      </div>
                      <div style={{ fontSize: 9, fontWeight: 900, color: s.status === 'Available' ? C.green : (s.status === 'Busy' ? C.red : C.blue), background: '#fff', padding: '2px 6px', borderRadius: 4, border: '1px solid #e2e8f0' }}>{s.status.toUpperCase()}</div>
                   </div>
                   <button style={{ background: C.green, color: '#fff', border: 'none', padding: '10px', borderRadius: 10, fontWeight: 800, fontSize: 11, cursor: 'pointer', width: '100%' }} onClick={triggerGlobalAlert}>🚨 SYSTEM ALERT</button>
                </div>
              ))}
            </div>
            {isEmergencyActive && <div style={{ marginTop: 20, padding: 12, backgroundColor: '#dc2626', borderRadius: 10, textAlign: 'center', color: '#fff', fontWeight: 900, animation: 'softPulse 0.5s infinite' }}>ACTIVE SYSTEM EMERGENCY</div>}
          </div>
        </div>
      </div>

      <div style={{ position: 'relative', zIndex: 1, marginTop: 80 }}><RuixenBentoCards /></div>

      <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', zIndex: 2000 }}>
        <MacOSDock apps={dockApps} onAppClick={handleDockClick} openApps={callActive ? ['voice'] : []} />
      </div>
    </div>
  );
}
