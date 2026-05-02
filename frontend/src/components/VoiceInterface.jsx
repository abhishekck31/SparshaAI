import React, { useState, useCallback, useEffect, useRef } from 'react';
import useWakeWord  from '../hooks/useWakeWord';
import useVapiVoice from '../hooks/useVapiVoice';
import MacOSDock    from './ui/mac-os-dock';
import voiceIcon    from '../assets/voice-icon.png';

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
  @keyframes flash { 0%, 100% { background-color: #dc2626; color: #ffffff; } 50% { background-color: #991b1b; color: #ffffff; } }
  .shadow-card { background: #ffffff !important; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0,0,0,0.05) !important; border: none !important; }
  .title-shimmer { background: linear-gradient(90deg, #1a1a2e 0%, #2563eb 50%, #1a1a2e 100%); background-size: 200% auto; -webkit-background-clip: text; -webkit-text-fill-color: transparent; animation: shimmer 4s linear infinite; }
  @keyframes shimmer { to { background-position: 200% center; } }
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 3000; animation: fadeIn 0.3s ease; }
  .modal-content { background: #ffffff; border-radius: 24px; padding: 32px; width: 100%; maxWidth: 500px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); position: relative; animation: slideUp 0.3s cubic-bezier(0.165, 0.84, 0.44, 1); }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  
  .dosage-input {
    width: 100%; padding: 16px; border-radius: 12px; border: 1px solid #e2e8f0; font-size: 16px; font-weight: 600; outline: none; transition: border-color 0.2s;
  }
  .dosage-input:focus { border-color: #2563eb; }
`;

// ── Components ─────────────────────────────────────────────────────────────

function Modal({ title, isOpen, onClose, children }) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, fontFamily: "'Outfit', sans-serif" }}>{title}</h2>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Status({ callActive, aiSpeaking, thinking, wakeListening }) {
  let label = "Ready for Sparsha";
  let color = C.muted;
  if (thinking) { label = "AI Thinking..."; color = C.teal; }
  else if (aiSpeaking) { label = "Sparsha Speaking"; color = C.accent; }
  else if (callActive) { label = "Listening..."; color = C.green; }
  else if (wakeListening) { label = "Wake Word Active"; color = C.green; }
  return <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 4 }}><div style={{ fontSize: 10, fontWeight: 900, color, letterSpacing: '0.15em', textTransform: 'uppercase' }}>{label}</div></div>;
}

function DosageCalculator({ onAskSparsha }) {
  const [weight, setWeight] = useState('');
  const [med, setMed] = useState('epinephrine');
  const [result, setResult] = useState(null);

  const calculate = () => {
    const w = parseFloat(weight);
    if (!w || w <= 0) return;
    let dose = 0;
    let unit = 'mg';
    if (med === 'epinephrine') {
       dose = Math.min(w * 0.01, 0.3).toFixed(3);
       unit = 'mg (IM)';
    } else if (med === 'paracetamol') {
       dose = Math.round(w * 15);
       unit = 'mg (Oral)';
    } else if (med === 'amoxicillin') {
       dose = Math.round(w * 30);
       unit = 'mg (Daily)';
    }
    setResult({ dose, unit });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <label style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', marginBottom: 8, display: 'block' }}>Patient Weight (kg)</label>
        <input type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder="Enter weight..." className="dosage-input" />
      </div>
      <div>
        <label style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', marginBottom: 8, display: 'block' }}>Medication</label>
        <select value={med} onChange={e => setMed(e.target.value)} className="dosage-input">
          <option value="epinephrine">Epinephrine (0.01 mg/kg)</option>
          <option value="paracetamol">Paracetamol (15 mg/kg)</option>
          <option value="amoxicillin">Amoxicillin (30 mg/kg)</option>
        </select>
      </div>
      
      <button onClick={calculate} style={{ padding: 16, background: C.text, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>Calculate Safe Dose</button>
      
      {result && (
        <div style={{ padding: 20, backgroundColor: '#f0f9ff', borderRadius: 16, border: `1px solid ${C.blue}`, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: C.blue, fontWeight: 800, textTransform: 'uppercase' }}>Recommended Dosage</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: C.teal, margin: '8px 0' }}>{result.dose} <span style={{ fontSize: 14 }}>{result.unit}</span></div>
          <div style={{ fontSize: 10, color: C.muted }}>Formula: {med === 'epinephrine' ? '0.01mg/kg' : (med === 'paracetamol' ? '15mg/kg' : '30mg/kg')}</div>
        </div>
      )}

      <button onClick={onAskSparsha} style={{ padding: 16, background: 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <span>🎙️ Verify with Sparsha AI</span>
      </button>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────

export default function VoiceInterface() {
  const [language, setLanguage] = useState('en');
  const [vapiPublicKey] = useState(import.meta.env.VITE_VAPI_PUBLIC_KEY || 'your_vapi_public_key_here');
  
  const { 
    callActive, aiSpeaking, thinking, volume, messages, activeTranscript, emergency, contextMode, error,
    startCall, endCall, dismissEmergency, injectMessage 
  } = useVapiVoice({ publicKey: vapiPublicKey });

  const { listening: wakeListening } = useWakeWord(() => { if (!callActive) startCall(language); });

  const [activeModal, setActiveModal] = useState(null);
  const [patients] = useState([
    { id: 1, ptId: 'PT-9982A', ward: 'Cardiac', room: '101', hr: 72, trend: 'stable' },
    { id: 2, ptId: 'PT-7731B', ward: 'Cardiac', room: '101', hr: 85, trend: 'stable' },
    { id: 3, ptId: 'PT-4490C', ward: 'Neuro', room: '205', hr: 110, trend: 'deteriorating' },
  ]);

  const dockApps = [
    { id: 'reports', name: 'Clinical Reports', icon: 'https://cdn.jim-nielsen.com/macos/1024/finder-2021-09-10.png?rf=1024' },
    { id: 'dosage',  name: 'Dosage Lab',      icon: 'https://cdn.jim-nielsen.com/macos/1024/calculator-2021-04-29.png?rf=1024' },
    { id: 'voice',   name: 'Voice Activation', icon: voiceIcon },
    { id: 'alerts',  name: 'Manual Alert',    icon: 'https://cdn.jim-nielsen.com/macos/1024/mail-2021-05-25.png?rf=1024' },
    { id: 'ehr',     name: 'EHR Records',     icon: 'https://cdn.jim-nielsen.com/macos/1024/notes-2021-05-25.png?rf=1024' },
  ];

  const handleDockClick = (id) => {
    if (id === 'voice') {
      if (!callActive) startCall(language);
      else endCall();
    } else {
      setActiveModal(id);
    }
  };

  const triggerEmergency = () => {
    injectMessage("MANUAL SYSTEM OVERRIDE: Clinical team requested via Emergency Dock. Trigger Code Blue immediately.");
    setActiveModal(null);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: C.bg, color: C.text, padding: '24px 16px 120px', position: 'relative' }}>
      <style>{STYLES}</style>
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', backgroundImage: 'linear-gradient(to right, rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.05) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 30, maxWidth: 1400, margin: '0 auto', alignItems: 'flex-start', justifyContent: 'center' }}>
        
        {/* Monitoring Dashboard */}
        <div className="shadow-card" style={{ width: 440, flexShrink: 0, padding: 28, borderRadius: 24 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 800, fontFamily: "'Outfit', sans-serif" }}>🧠 Ward Status</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {patients.map(p => (
              <div key={p.id} style={{ padding: 16, borderRadius: 12, backgroundColor: '#f8fafc', border: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between' }}>
                <div><div style={{ fontWeight: 700 }}>{p.ptId}</div><div style={{ fontSize: 11, color: C.muted }}>RM {p.room} • {p.ward}</div></div>
                <div style={{ fontWeight: 800, color: p.hr > 100 ? C.red : C.green }}>{p.hr} bpm</div>
              </div>
            ))}
          </div>
        </div>

        {/* Main AI Interaction */}
        <div style={{ flex: 1, maxWidth: 500 }}>
          {emergency && (
            <div style={{ backgroundColor: '#fee2e2', border: `1.5px solid ${C.red}`, borderRadius: 16, padding: '16px 20px', marginBottom: 24, animation: 'flash 0.9s infinite', display: 'flex', justifyContent: 'space-between' }}>
              <div><div style={{ fontWeight: 800, fontSize: 15, color: C.red }}>🚨 EMERGENCY</div></div>
              <button onClick={dismissEmergency} style={{ background: C.red, color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>Dismiss</button>
            </div>
          )}

          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h1 className="title-shimmer" style={{ margin: 0, fontSize: 42, fontWeight: 900, letterSpacing: '0.15em', fontFamily: "'Outfit', sans-serif" }}>SPARSHA</h1>
            <p style={{ margin: '8px 0 0', fontSize: 11, color: C.muted, letterSpacing: '0.2em', fontWeight: 600 }}>CLINICAL COMMAND CENTER</p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
            <div onClick={() => callActive ? endCall() : startCall(language)} style={{ width: 140, height: 140, borderRadius: '50%', background: `radial-gradient(circle at 30% 30%, ${callActive ? C.green : C.teal}44, ${callActive ? C.green : C.teal})`, cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 10px 30px ${callActive ? C.green : C.teal}33` }}>
              <div style={{ position: 'absolute', inset: -12, borderRadius: '50%', border: `2px solid ${callActive ? C.green : C.teal}33`, animation: 'orbRing 2s infinite' }} />
              <span style={{ fontSize: 40 }}>{callActive ? '🎙️' : '🧠'}</span>
            </div>
          </div>

          <div style={{ marginBottom: 24 }}><Status callActive={callActive} aiSpeaking={aiSpeaking} thinking={thinking} wakeListening={wakeListening} /></div>

          <div style={{ display: 'flex', justifyContent: 'center', minHeight: 80 }}>
            {thinking && <div style={{ display: 'flex', gap: 6 }}>{[0,1,2].map(i=>(<div key={i} style={{width:8,height:8,borderRadius:'50%',backgroundColor:C.teal,animation:`softPulse 1s ${i*0.2}s infinite`}}/>))}</div>}
            {callActive && !thinking && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 60 }}>
                {[0,1,2,3,4,5,6].map(i => (<div key={i} style={{ width: 5, height: 20 + Math.random() * 40, borderRadius: 3, backgroundColor: C.teal, animation: `bar ${0.5 + i * 0.1}s infinite` }} />))}
              </div>
            )}
          </div>
        </div>

        {/* Action Logs */}
        <div style={{ width: 380, flexShrink: 0 }}>
          <div className="shadow-card" style={{ padding: 24, borderRadius: 24 }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 18, color: C.text, fontWeight: 700 }}>Action Logs</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {messages.length === 0 ? <div style={{ fontSize: 12, color: C.muted }}>No records yet.</div> : messages.map((m, i) => (
                <div key={i} style={{ fontSize: 13, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontWeight: 800, color: m.role === 'user' ? C.teal : C.accent, fontSize: 10 }}>{m.role.toUpperCase()}</span>
                  <div style={{ marginTop: 2 }}>{m.text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <Modal title="Clinical Report Center" isOpen={activeModal === 'reports'} onClose={() => setActiveModal(null)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {patients.map(p => (
            <div key={p.id} style={{ padding: 16, borderRadius: 12, border: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><strong>{p.ptId}</strong></div>
              <button style={{ background: C.teal, color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}>Download PDF</button>
            </div>
          ))}
        </div>
      </Modal>

      <Modal title="🧪 Clinical Dosage Lab" isOpen={activeModal === 'dosage'} onClose={() => setActiveModal(null)}>
        <DosageCalculator onAskSparsha={() => { setActiveModal(null); startCall(language); injectMessage("I need help calculating a safe pediatric dosage."); }} />
      </Modal>

      <Modal title="⚠️ Confirm Code Blue" isOpen={activeModal === 'alerts'} onClose={() => setActiveModal(null)}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontWeight: 600, marginBottom: 24 }}>Trigger a ward-wide emergency alert?</p>
          <button onClick={triggerEmergency} style={{ width: '100%', padding: 18, background: C.red, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 800, fontSize: 18, cursor: 'pointer' }}>MOBILIZE TEAM</button>
        </div>
      </Modal>

      <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', zIndex: 2000 }}>
        <MacOSDock apps={dockApps} onAppClick={handleDockClick} openApps={callActive ? ['voice'] : []} />
      </div>
    </div>
  );
}
