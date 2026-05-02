import React, { useState, useCallback, useEffect, useRef } from 'react';
import useWakeWord  from '../hooks/useWakeWord';
import useVapiVoice from '../hooks/useVapiVoice';

// ── Design Tokens (Premium Medical Palette) ──────────────────────────────────
const C = {
  bg:       '#02040a',       // Deepest space black
  surface:  '#0d1117',       // GitHub-style dark grey
  surfaceB: '#161b22',       // Slightly lighter grey for cards
  border:   '#30363d',       // Subdued border
  accent:   '#f78166',       // Warm coral/orange (medical urgency)
  accentLo: '#c4432b',       // Darker coral
  text:     '#e6edf3',       // Soft white
  muted:    '#8b949e',       // Muted grey
  dim:      '#484f58',       // Dimmer grey
  green:    '#3fb950',       // Health green
  teal:     '#2f81f7',       // Science blue (Vapi AI)
  blue:     '#58a6ff',       // Soft blue
  red:      '#f85149',       // Alert red
  redDark:  '#8e1519',       // Deep alert red
};

const LANGS = [
  { value: 'en', label: 'English'  },
  { value: 'hi', label: 'Hindi'    },
  { value: 'kn', label: 'Kannada'  },
  { value: 'ta', label: 'Tamil'    },
  { value: 'te', label: 'Telugu'   },
  { value: 'mr', label: 'Marathi'  },
];

// ── Premium CSS System ────────────────────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Outfit:wght@400;600;800&display=swap');

  *, *::before, *::after { box-sizing: border-box; }
  
  body {
    font-family: 'Inter', -apple-system, sans-serif;
    letter-spacing: -0.011em;
  }

  /* Smooth Pulse for Vitals */
  @keyframes softPulse {
    0% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.05); opacity: 0.8; }
    100% { transform: scale(1); opacity: 1; }
  }

  /* Orb ring animation */
  @keyframes orbRing {
    0%   { box-shadow: 0 0 0 0px var(--ring-color); opacity: 0.8; }
    60%  { box-shadow: 0 0 0 25px transparent;      opacity: 0.2; }
    100% { box-shadow: 0 0 0 0px transparent;        opacity: 0;   }
  }

  /* Waveform bars */
  @keyframes bar {
    0%, 100% { transform: scaleY(0.2); opacity: 0.4; }
    50%       { transform: scaleY(1);   opacity: 1;   }
  }

  /* Emergency flash with smooth transition */
  @keyframes flash {
    0%, 100% { background-color: #f85149; opacity: 1; }
    50%       { background-color: #8e1519; opacity: 0.8; }
  }

  /* Glassmorphism utility */
  .glass {
    background: rgba(22, 27, 34, 0.7) !important;
    backdrop-filter: blur(12px) !important;
    border: 1px solid rgba(240, 246, 252, 0.1) !important;
  }

  /* Modern Scrollbar */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 10px; }
  ::-webkit-scrollbar-thumb:hover { background: #484f58; }

  .title-shimmer {
    background: linear-gradient(90deg, #e6edf3 0%, #58a6ff 50%, #e6edf3 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: shimmer 4s linear infinite;
  }

  @keyframes shimmer {
    to { background-position: 200% center; }
  }
`;

// ── Waveform Component ───────────────────────────────────────────────────────
const BARS = [
  { h: 18, dur: '0.6s', del: '0.0s' },
  { h: 32, dur: '0.7s', del: '0.1s' },
  { h: 48, dur: '0.5s', del: '0.2s' },
  { h: 60, dur: '0.8s', del: '0.3s' },
  { h: 48, dur: '0.5s', del: '0.4s' },
  { h: 32, dur: '0.7s', del: '0.5s' },
  { h: 18, dur: '0.6s', del: '0.6s' },
];

function Waveform({ color, volume }) {
  const s = 0.3 + volume * 0.7;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, height: 68 }}>
      {BARS.map((b, i) => (
        <div key={i} style={{
          width: 5, height: b.h * s, backgroundColor: color,
          borderRadius: 3, transformOrigin: 'center',
          animation: `bar ${b.dur} ease-in-out ${b.del} infinite`,
        }} />
      ))}
    </div>
  );
}

function ThinkingDots() {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', height: 28 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{
          width: 10, height: 10, borderRadius: '50%', backgroundColor: C.blue,
          animation: `dot 1.2s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
    </div>
  );
}

// ── ORB — ONLY reacts to 3 stable states ─────────────────────────────────────
// callActive, wakeListening, emergency.
// It does NOT react to aiSpeaking / thinking / volume — those go to waveform.
// This is what stops the on/off flickering.
function Orb({ callActive, wakeListening, emergency, onClick }) {
  // Pick ONE steady state. Priority: emergency > call > wake > idle
  let ringColor, ringDuration, orbBg, orbBorder, glow, label;

  if (emergency) {
    ringColor = C.red;   ringDuration = '0.8s';
    orbBg     = '#1a0505'; orbBorder = C.red;
    glow      = `0 0 28px ${C.red}66`;
    label     = 'End Call';
  } else if (callActive) {
    ringColor = C.accent; ringDuration = '2s';
    orbBg     = '#1a1005'; orbBorder = C.accent;
    glow      = `0 0 24px ${C.accent}44`;
    label     = 'Tap to end';
  } else if (wakeListening) {
    ringColor = C.green;  ringDuration = '3s';
    orbBg     = '#0a1a0d'; orbBorder = C.green;
    glow      = `0 0 18px ${C.green}33`;
    label     = 'Tap to call';
  } else {
    ringColor = 'transparent'; ringDuration = '0s';
    orbBg     = C.surface;     orbBorder = C.border;
    glow      = 'none';
    label     = 'Tap to call';
  }

  const icon = callActive ? '🎙️' : '🎤';

  return (
    <div
      onClick={onClick}
      title={label}
      style={{
        '--ring-color': ringColor,
        width: 130, height: 130, borderRadius: '50%',
        backgroundColor: orbBg,
        border: `2.5px solid ${orbBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 48, cursor: 'pointer', userSelect: 'none',
        // Single animation — only duration changes between states, no restart flicker
        animation: ringColor !== 'transparent'
          ? `orbRing ${ringDuration} ease-out infinite`
          : 'none',
        boxShadow: glow,
        // Smooth colour transitions between states
        transition: 'background-color 0.5s, border-color 0.5s, box-shadow 0.5s',
      }}
    >
      {icon}
    </div>
  );
}

// ── Status text — this can change rapidly, separate from orb ─────────────────
function Status({ callActive, aiSpeaking, thinking, wakeListening, vapiMissing }) {
  let text, color;

  if (vapiMissing) {
    text = 'VAPI key missing — see below'; color = C.red;
  } else if (aiSpeaking) {
    text = 'Sparsha is speaking — you can interrupt'; color = C.teal;
  } else if (thinking) {
    text = 'Sparsha is thinking…'; color = C.blue;
  } else if (callActive) {
    text = 'Ask your question'; color = C.accent;
  } else if (wakeListening) {
    text = 'Say "Hey Sparsha" — or tap the orb'; color = C.green;
  } else {
    text = 'Tap the orb to begin'; color = C.muted;
  }

  return (
    <p style={{
      margin: 0, fontSize: 14, textAlign: 'center',
      color, minHeight: 22,
      transition: 'color 0.3s',
    }}>
      {text}
    </p>
  );
}

// ── Chat bubble ───────────────────────────────────────────────────────────────
function Bubble({ role, text }) {
  const isUser = role === 'user';
  return (
    <div className="bubble" style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 9,
    }}>
      <div style={{
        maxWidth: '80%', padding: '9px 14px',
        borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
        backgroundColor: isUser ? C.surfaceB : C.surface,
        border: `1px solid ${isUser ? C.accentLo : C.border}`,
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', marginBottom: 5,
          color: isUser ? C.muted : C.accent,
        }}>
          {isUser ? 'You' : 'Sparsha'}
        </div>
        <p style={{ margin: 0, fontSize: 14, color: C.text, lineHeight: 1.6 }}>
          {text}
        </p>
      </div>
    </div>
  );
}

// ── Vitals metric tile ────────────────────────────────────────────────────────
function MetricCard({ label, value, critical, pulsing }) {
  const color = critical ? C.red : C.green;
  return (
    <div style={{
      backgroundColor: C.bg, borderRadius: 8, padding: '10px 12px',
      border: `1px solid ${critical ? C.red + '55' : C.border}`,
    }}>
      <div style={{
        fontSize: 10, color: C.muted, textTransform: 'uppercase',
        letterSpacing: '0.1em', marginBottom: 5,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, color, display: 'flex', alignItems: 'center', gap: 5 }}>
        {pulsing && (
          <span style={{ display: 'inline-block', animation: 'heartbeat 1s ease-in-out infinite' }}>
            ❤️
          </span>
        )}
        {value}
      </div>
    </div>
  );
}

function VitalsWidget({ data }) {
  const { room_number, vitals, id } = data;
  const isCritical = vitals.heart_rate > 110 || vitals.spo2 < 92;
  const statusColor = isCritical ? C.red : C.green;
  return (
    <div className="bubble" style={{
      padding: 16, borderRadius: 10,
      backgroundColor: isCritical ? '#1a0808' : '#081a08',
      border: `1px solid ${statusColor}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: C.muted }}>
          {new Date(parseInt(id)).toLocaleTimeString()}
        </div>
        <span style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.08em',
          color: statusColor, border: `1px solid ${statusColor}`,
          padding: '2px 8px', borderRadius: 4,
        }}>
          {isCritical ? '⚠ CRITICAL' : '✓ STABLE'}
        </span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: C.text }}>
        📡 Room {room_number} — Live Vitals
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <MetricCard label="Heart Rate"      value={`${vitals.heart_rate} bpm`} critical={vitals.heart_rate > 110} pulsing />
        <MetricCard label="Blood Pressure"  value={vitals.bp}                  critical={false} />
        <MetricCard label="SpO₂"            value={`${vitals.spo2}%`}          critical={vitals.spo2 < 92} />
        <MetricCard label="Temperature"     value={`${vitals.temperature}°F`}  critical={vitals.temperature > 101} />
      </div>
    </div>
  );
}

// ── EHR dictation note ────────────────────────────────────────────────────────
function EHRNoteWidget({ item }) {
  return (
    <div className="bubble" style={{
      padding: 16, borderRadius: 10,
      backgroundColor: '#101827',
      border: '1px solid #3b82f6',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: C.muted }}>
          {new Date(parseInt(item.id)).toLocaleTimeString()}
        </div>
        <span style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.08em',
          color: '#3b82f6', border: '1px solid #3b82f6',
          padding: '2px 8px', borderRadius: 4,
        }}>
          ✓ EHR SAVED
        </span>
      </div>
      <div style={{
        fontSize: 15, fontWeight: 700, marginBottom: 10,
        color: C.text, display: 'flex', alignItems: 'center', gap: 8,
      }}>
        📝 Clinical Note — Room {item.room_number}
      </div>
      <div style={{
        fontSize: 13, color: '#9ca3af', fontStyle: 'italic', lineHeight: 1.75,
        backgroundColor: '#0d1520', borderRadius: 6, padding: '10px 14px',
        borderLeft: '3px solid #3b82f6',
        whiteSpace: 'pre-wrap',
      }}>
        {item.note_content}
      </div>
    </div>
  );
}

// ── Predictive Engine Dashboard ────────────────────────────────────────────────
function PredictiveEngine({ injectMessage }) {
  const [patients, setPatients] = useState([
    { id: 1, ptId: 'PT-9982A', ward: 'Cardiac', room: '101', bed: 'Bed 1', hr: 72, spo2: 98, bpSys: 120, bpDia: 80, rr: 16, temp: 36.6, ecg: 'Normal Sinus', glucose: 110, trend: 'stable', alertSent: false },
    { id: 2, ptId: 'PT-7731B', ward: 'Cardiac', room: '101', bed: 'Bed 2', hr: 85, spo2: 96, bpSys: 130, bpDia: 85, rr: 18, temp: 37.1, ecg: 'Normal Sinus', glucose: 135, trend: 'stable', alertSent: false },
    { id: 3, ptId: 'PT-4490C', ward: 'Neuro', room: '205', bed: 'Bed 3', hr: 95, spo2: 94, bpSys: 110, bpDia: 70, rr: 20, temp: 38.2, ecg: 'Mild Arrhythmia', glucose: 140, trend: 'deteriorating', alertSent: false },
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      setPatients(prev => prev.map(p => {
        if (p.trend === 'deteriorating') {
          const newHr = p.hr + Math.floor(Math.random() * 5);
          const newSpo2 = p.spo2 > 80 ? p.spo2 - Math.floor(Math.random() * 2) : p.spo2;
          const newRr = p.rr + (Math.random() > 0.5 ? 1 : 0);
          const newEcg = newHr > 120 ? 'ST Elevation' : p.ecg;
          
          if (newHr > 130 && newSpo2 < 88 && !p.alertSent) {
            injectMessage(`System Override: Predictive engine detects critical deterioration for patient ${p.ptId} in ${p.ward} Ward, Room ${p.room}. Heart rate is ${newHr}, S P O 2 is dropping to ${newSpo2}, and ECG shows ${newEcg}. High risk of cardiac arrest in 2 minutes. Please alert the team immediately and ask the user to prepare for intervention.`);
            return { ...p, hr: newHr, spo2: newSpo2, rr: newRr, ecg: newEcg, alertSent: true };
          }
          return { ...p, hr: newHr, spo2: newSpo2, rr: newRr, ecg: newEcg };
        } else {
          return {
            ...p,
            hr: p.hr + (Math.random() > 0.5 ? 1 : -1),
            spo2: Math.min(100, Math.max(95, p.spo2 + (Math.random() > 0.5 ? 1 : -1))),
            glucose: p.glucose + (Math.random() > 0.5 ? 1 : -1),
          };
        }
      }));
    }, 2500);
    return () => clearInterval(interval);
  }, [injectMessage]);

  return (
    <div style={{ width: 440, background: 'rgba(13, 17, 23, 0.4)', backdropFilter: 'blur(10px)', borderRadius: 24, padding: 28, border: `1px solid ${C.border}`, flexShrink: 0 }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 22, color: C.text, fontFamily: "'Outfit', sans-serif", fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 24 }}>🧠</span> Predictive IoT Engine
      </h2>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 24, lineHeight: 1.6, fontWeight: 400 }}>
        Real-time telemetry analysis from ward sensors using proprietary medical AI models.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {patients.map(p => (
          <div key={p.id} className="glass" style={{ 
            padding: 20, borderRadius: 20, 
            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* Status indicator bar */}
            <div style={{ 
              position: 'absolute', top: 0, left: 0, bottom: 0, width: 4, 
              backgroundColor: p.hr > 120 ? C.red : (p.hr > 100 ? C.accent : C.green),
              boxShadow: p.hr > 120 ? `0 0 15px ${C.red}` : 'none'
            }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ color: C.text, fontSize: 15, fontWeight: 700, letterSpacing: '0.02em', fontFamily: "'Outfit', sans-serif" }}>{p.ptId}</div>
                <div style={{ color: C.muted, fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{p.ward} • RM {p.room} • {p.bed}</div>
              </div>
              <div style={{ 
                fontSize: 10, 
                fontWeight: 800,
                color: '#fff', 
                backgroundColor: p.hr > 120 ? C.red : (p.hr > 100 ? C.accent : 'rgba(63, 185, 80, 0.15)'),
                color: p.hr > 120 ? '#fff' : (p.hr > 100 ? '#fff' : C.green),
                padding: '5px 10px',
                borderRadius: 20,
                letterSpacing: '0.03em',
                animation: p.hr > 120 ? 'flash 1s infinite' : 'none',
                border: `1px solid ${p.hr > 100 ? 'transparent' : 'rgba(63, 185, 80, 0.3)'}`
              }}>
                {p.hr > 120 ? 'CRITICAL RISK' : (p.hr > 100 ? 'DETERIORATING' : 'STABLE')}
              </div>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
              {[
                { label: 'HR', val: p.hr, unit: 'bpm', color: p.hr > 100 ? C.red : C.text, icon: '❤️' },
                { label: 'SpO2', val: p.spo2, unit: '%', color: p.spo2 < 92 ? C.red : C.text, icon: '🫁' },
                { label: 'BP', val: `${p.bpSys}/${p.bpDia}`, unit: '', color: C.text, icon: '🩸' },
                { label: 'RR', val: p.rr, unit: '/m', color: p.rr > 24 ? C.accent : C.text, icon: '🌬️' },
                { label: 'Temp', val: p.temp.toFixed(1), unit: '°C', color: p.temp > 38 ? C.accent : C.text, icon: '🌡️' },
                { label: 'Glucose', val: p.glucose, unit: 'mg', color: C.text, icon: '🍬' }
              ].map(m => (
                <div key={m.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {m.label}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: m.color, display: 'flex', alignItems: 'baseline', gap: 2 }}>
                    {m.val}<span style={{ fontSize: 10, opacity: 0.6 }}>{m.unit}</span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ 
              padding: '10px 14px', borderRadius: 12, 
              backgroundColor: 'rgba(0,0,0,0.3)', border: `1px solid ${p.ecg.includes('ST Elevation') ? 'rgba(248, 81, 73, 0.3)' : C.border}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: p.ecg.includes('ST Elevation') ? C.red : C.green, animation: 'softPulse 2s infinite' }} />
                ECG RHYTHM
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: p.ecg.includes('ST Elevation') ? C.red : C.blue, fontFamily: 'monospace' }}>
                {p.ecg.toUpperCase()}
              </div>
            </div>
            {/* Download Report Button */}
            <button 
              onClick={() => {
                const win = window.open('', '_blank');
                const reportHtml = `
                  <html>
                    <head>
                      <title>Patient Report - ${p.ptId}</title>
                      <style>
                        body { font-family: 'Inter', system-ui, sans-serif; color: #1a1a1a; padding: 40px; line-height: 1.5; }
                        .header { border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; }
                        .logo { font-size: 24px; font-weight: 800; color: #2563eb; }
                        .report-title { text-align: right; }
                        .section { margin-bottom: 30px; }
                        .section-title { font-size: 14px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; }
                        .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; }
                        .info-item { margin-bottom: 10px; }
                        .label { font-size: 12px; color: #64748b; }
                        .value { font-size: 14px; font-weight: 600; }
                        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                        th { background: #f8fafc; text-align: left; padding: 12px; font-size: 12px; color: #64748b; border-bottom: 1px solid #e2e8f0; }
                        td { padding: 12px; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
                        .badge { padding: 4px 8px; borderRadius: 4px; font-size: 11px; font-weight: 700; }
                        .badge-stable { background: #dcfce7; color: #166534; }
                        .badge-critical { background: #fee2e2; color: #991b1b; }
                        .footer { margin-top: 50px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 20px; }
                      </style>
                    </head>
                    <body>
                      <div class="header">
                        <div class="logo">SPARSHA AI</div>
                        <div class="report-title">
                          <h2 style="margin:0">Clinical Summary Report</h2>
                          <div style="font-size:12px; color:#64748b">Generated on ${new Date().toLocaleString()}</div>
                        </div>
                      </div>

                      <div class="section">
                        <div class="section-title">Patient Identification</div>
                        <div class="grid">
                          <div class="info-item"><div class="label">Patient ID</div><div class="value">${p.ptId}</div></div>
                          <div class="info-item"><div class="label">Full Name</div><div class="value">Verified Resident</div></div>
                          <div class="info-item"><div class="label">Admission Date</div><div class="value">${new Date(Date.now() - 432000000).toLocaleDateString()}</div></div>
                          <div class="info-item"><div class="label">Ward / Room</div><div class="value">${p.ward} / Room ${p.room}</div></div>
                          <div class="info-item"><div class="label">Bed Assignment</div><div class="value">${p.bed}</div></div>
                          <div class="info-item"><div class="label">Status</div><div class="value"><span class="badge ${p.hr > 120 ? 'badge-critical' : 'badge-stable'}">${p.hr > 120 ? 'CRITICAL' : 'STABLE'}</span></div></div>
                        </div>
                      </div>

                      <div class="section">
                        <div class="section-title">Current IoT Vitals (Last Updated)</div>
                        <div class="grid">
                          <div class="info-item"><div class="label">Heart Rate</div><div class="value">${p.hr} bpm</div></div>
                          <div class="info-item"><div class="label">SpO2 Level</div><div class="value">${p.spo2}%</div></div>
                          <div class="info-item"><div class="label">Blood Pressure</div><div class="value">${p.bpSys}/${p.bpDia} mmHg</div></div>
                          <div class="info-item"><div class="label">Resp Rate</div><div class="value">${p.rr} /min</div></div>
                          <div class="info-item"><div class="label">Temperature</div><div class="value">${p.temp.toFixed(1)}°C</div></div>
                          <div class="info-item"><div class="label">Glucose</div><div class="value">${p.glucose} mg/dL</div></div>
                        </div>
                      </div>

                      <div class="section">
                        <div class="section-title">Historical Vitals Trend (Last 24 Hours)</div>
                        <table>
                          <thead>
                            <tr>
                              <th>Timestamp</th>
                              <th>HR</th>
                              <th>SpO2</th>
                              <th>RR</th>
                              <th>Temp</th>
                              <th>ECG Rhythm</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td>${new Date(Date.now() - 3600000).toLocaleTimeString()}</td>
                              <td>${p.hr - 2}</td><td>${p.spo2 + 1}%</td><td>${p.rr}</td><td>${p.temp.toFixed(1)}°C</td><td>Normal Sinus</td>
                            </tr>
                            <tr>
                              <td>${new Date(Date.now() - 7200000).toLocaleTimeString()}</td>
                              <td>${p.hr - 5}</td><td>${p.spo2 + 1}%</td><td>${p.rr - 1}</td><td>${(p.temp - 0.2).toFixed(1)}°C</td><td>Normal Sinus</td>
                            </tr>
                            <tr style="background:#fff7ed">
                              <td>${new Date().toLocaleTimeString()} (Current)</td>
                              <td>${p.hr}</td><td>${p.spo2}%</td><td>${p.rr}</td><td>${p.temp.toFixed(1)}°C</td><td>${p.ecg}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      <div class="section">
                        <div class="section-title">AI Predictive Assessment</div>
                        <div style="background:#f1f5f9; padding:15px; borderRadius:8px; fontSize:14px">
                          <strong>Assessment:</strong> ${p.trend === 'deteriorating' ? 'CRITICAL ALERT: Patient is exhibiting signs of acute physiological stress. Significant drop in SpO2 coupled with tachycardia. Immediate bedside evaluation recommended.' : 'Patient is hemodynamically stable. Vitals are within baseline parameters. Continue routine IoT monitoring.'}
                          <br><br>
                          <strong>Recommendation:</strong> ${p.trend === 'deteriorating' ? 'Initiate Code Blue protocol and prepare for intubation if SpO2 drops below 85%.' : 'Maintain current care plan. Re-evaluate in 4 hours.'}
                        </div>
                      </div>

                      <div class="footer">
                        This document is a certified clinical record generated by the Sparsha AI Medical Intelligence Engine.
                        <br>
                        Confidential - Medical Use Only. (c) 2026 Sparsha AI Systems.
                      </div>

                      <script>
                        window.onload = () => {
                          window.print();
                          window.onafterprint = () => window.close();
                        }
                      </script>
                    </body>
                  </html>
                `;
                win.document.write(reportHtml);
                win.document.close();
              }}
              style={{
                marginTop: 16, width: '100%', padding: '10px',
                backgroundColor: C.surfaceB, color: C.text,
                border: `1px solid ${C.border}`, borderRadius: 8,
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = C.border}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = C.surfaceB}
            >
              <span>📄</span> Download Clinical Report
            </button>

          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function VoiceInterface() {
  const [language, setLanguage] = useState('en');
  const VAPI_KEY    = import.meta.env.VITE_VAPI_PUBLIC_KEY;
  const vapiMissing = !VAPI_KEY || VAPI_KEY === 'your_vapi_public_key_here';

  const {
    callActive, aiSpeaking, thinking,
    volume, messages, activeTranscript, emergency, contextMode, error,
    startCall, endCall, dismissEmergency, injectMessage
  } = useVapiVoice({ publicKey: VAPI_KEY });

  const [alerts, setAlerts] = useState([]);
  const [vitalsLog, setVitalsLog] = useState([]);
  const prevAlerts = useRef([]);

  useEffect(() => {
    const evtSource = new EventSource('/api/alerts/stream');
    evtSource.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setAlerts(prev => [...prev.filter(a => a.type === 'ehr'), ...data]);

      data.forEach(curr => {
        const prev = prevAlerts.current.find(a => a.id === curr.id);
        if (prev && prev.status === 'pending' && curr.status === 'acknowledged') {
          injectMessage(`Alert acknowledged. ${curr.staff_name} has responded: "${curr.response}". Please inform the user right now.`);
        }
      });
      prevAlerts.current = data;
    };
    return () => evtSource.close();
  }, [injectMessage]);

  useEffect(() => {
    const handler = (e) => setVitalsLog(prev => [e.detail, ...prev].slice(0, 10));
    window.addEventListener('vitals_fetched', handler);
    return () => window.removeEventListener('vitals_fetched', handler);
  }, []);

  useEffect(() => {
    const handler = (e) => setAlerts(prev => [e.detail, ...prev]);
    window.addEventListener('ehr_note_saved', handler);
    return () => window.removeEventListener('ehr_note_saved', handler);
  }, []);

  const onWakeWord = useCallback(() => startCall(language), [startCall, language]);

  const { wakeListening } = useWakeWord({
    onDetected: onWakeWord,
    enabled: !callActive && !vapiMissing,
    lang: 'en-US',
  });

  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
        e.preventDefault();
        if (!callActive && !vapiMissing) {
          startCall(language);
        } else if (callActive) {
          endCall();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [callActive, vapiMissing, startCall, endCall, language]);

  const waveColor = aiSpeaking ? C.teal : C.accent;

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: C.bg,
      color: C.text, fontFamily: "'Inter', 'Outfit', sans-serif",
      padding: '24px 16px 56px',
      overflowX: 'hidden',
      position: 'relative'
    }}>
      <style>{STYLES}</style>

      {/* Modern IoT Grid Background */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0, opacity: 0.6, pointerEvents: 'none',
        backgroundImage: `
          linear-gradient(to right, ${C.border}66 1px, transparent 1px),
          linear-gradient(to bottom, ${C.border}66 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
      }} />

      {/* AI Core Glow Effect */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: `radial-gradient(circle at 50% 30%, ${C.teal}33 0%, transparent 70%)`,
      }} />

      {/* Clinical Scanline Effect */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.1) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.02), rgba(0, 255, 0, 0.01), rgba(0, 0, 255, 0.02))',
        backgroundSize: '100% 4px, 3px 100%',
        opacity: 0.15
      }} />

      {/* 3-Column Layout */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 30, maxWidth: 1400, margin: '0 auto', alignItems: 'flex-start', justifyContent: 'center' }}>
        
        {/* Left Column: Predictive Engine */}
        <PredictiveEngine injectMessage={injectMessage} />

        {/* Middle Column: Voice Agent */}
        <div style={{ flex: 1, maxWidth: 500, minWidth: 400 }}>

        {/* Emergency banner */}
        {emergency && (
          <div style={{
            backgroundColor: C.redDark, border: `2px solid ${C.red}`,
            borderRadius: 12, padding: '14px 18px', marginBottom: 20,
            animation: 'flash 0.9s ease-in-out infinite',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
          }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#fff', letterSpacing: '0.05em' }}>
                🚨 EMERGENCY ALERT ACTIVATED
              </div>
              <div style={{ fontSize: 12, color: '#ffaaaa', marginTop: 4 }}>
                Team notification triggered — stay on the line.
              </div>
            </div>
            <button onClick={dismissEmergency} style={{
              background: 'none', border: `1px solid ${C.red}`,
              color: '#fff', borderRadius: 6, padding: '5px 11px',
              cursor: 'pointer', fontSize: 11, fontWeight: 700, flexShrink: 0,
            }}>
              Dismiss
            </button>
          </div>
        )}

        {/* Context mode badge — only visible during an active call */}
        {callActive && (() => {
          const modeConfig = {
            normal:   { label: 'NORMAL MODE',   bg: '#0d2b1a', border: C.green,  color: C.green,  dot: C.green,  desc: 'Calm · Explanatory'      },
            urgent:   { label: 'URGENT MODE',   bg: '#2b1a00', border: '#f39c12', color: '#f39c12', dot: '#f39c12', desc: 'Concise · Action-first'   },
            critical: { label: 'CRITICAL MODE', bg: '#2b0000', border: C.red,    color: C.red,    dot: C.red,    desc: 'Immediate · No confirmation' },
          }[contextMode];
          return (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              backgroundColor: modeConfig.bg, border: `1.5px solid ${modeConfig.border}`,
              borderRadius: 10, padding: '10px 16px', marginBottom: 16,
              animation: contextMode === 'critical' ? 'flash 0.9s ease-in-out infinite' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 9, height: 9, borderRadius: '50%',
                  backgroundColor: modeConfig.dot,
                  boxShadow: `0 0 6px ${modeConfig.dot}`,
                }} />
                <span style={{ fontWeight: 800, fontSize: 12, color: modeConfig.color, letterSpacing: '0.08em' }}>
                  {modeConfig.label}
                </span>
              </div>
              <span style={{ fontSize: 11, color: modeConfig.color, opacity: 0.75 }}>
                {modeConfig.desc}
              </span>
            </div>
          );
        })()}

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h1 style={{
            margin: 0, fontSize: 36, fontWeight: 900, letterSpacing: '0.12em',
            background: `linear-gradient(90deg, #a04020, ${C.accent}, #f0b090, ${C.accent}, #a04020)`,
            backgroundSize: '300% auto',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            animation: 'shimmer 4s linear infinite',
          }}>
            SPARSHA
          </h1>
          <p style={{ margin: '5px 0 0', fontSize: 11, color: C.muted, letterSpacing: '0.14em' }}>
            AI MEDICAL ASSISTANT · FOR HEALTHCARE PROFESSIONALS
          </p>
        </div>

        {/* Orb — stable, no flicker */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}>
          <Orb
            callActive={callActive}
            wakeListening={wakeListening}
            emergency={emergency}
            onClick={() => callActive ? endCall() : startCall(language)}
          />
        </div>

        {/* Status text — below orb, can change freely */}
        <div style={{ marginBottom: 20 }}>
          <Status
            callActive={callActive} aiSpeaking={aiSpeaking}
            thinking={thinking} wakeListening={wakeListening}
            vapiMissing={vapiMissing}
          />
        </div>

        {/* Waveform area — all volatile state lives here, NOT in the orb */}
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          minHeight: 76, marginBottom: 22,
        }}>
          {thinking && <ThinkingDots />}
          {!thinking && callActive && <Waveform color={waveColor} volume={volume} />}
          {!callActive && wakeListening && (
            // Idle green bars while waiting for wake word
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {[9, 16, 9].map((h, i) => (
                <div key={i} style={{
                  width: 4, height: h, borderRadius: 3,
                  backgroundColor: C.green, opacity: 0.35,
                  animation: `bar ${0.9 + i * 0.2}s ease-in-out ${i * 0.13}s infinite`,
                }} />
              ))}
            </div>
          )}
        </div>

        {/* Language selector — only when not in call */}
        {!callActive && (
          <div style={{ textAlign: 'center', marginBottom: 26 }}>
            <label style={{
              display: 'block', fontSize: 10, color: C.muted,
              textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 7,
            }}>
              Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              style={{
                backgroundColor: C.surface, color: C.text,
                border: `1px solid ${C.border}`, borderRadius: 8,
                padding: '9px 22px', fontSize: 14, cursor: 'pointer', outline: 'none',
              }}
            >
              {LANGS.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>
        )}

        {/* Conversation feed */}
        {messages.length > 0 && (
          <div style={{
            backgroundColor: C.surface, borderRadius: 14,
            border: `1px solid ${C.border}`,
            padding: '14px 16px', marginBottom: 16,
            maxHeight: 300, overflowY: 'auto',
          }}>
            <div style={{
              fontSize: 10, color: C.muted, textTransform: 'uppercase',
              letterSpacing: '0.12em', marginBottom: 12, fontWeight: 700,
            }}>
              Conversation
            </div>
            {messages.map((m, i) => <Bubble key={m.ts ?? i} role={m.role} text={m.text} />)}
          </div>
        )}

        {/* VAPI key missing */}
        {vapiMissing && (
          <div style={{
            backgroundColor: '#180808', border: `1px solid ${C.red}44`,
            borderRadius: 10, padding: '12px 16px', marginBottom: 14,
            fontSize: 13, color: '#ff9090', lineHeight: 1.7,
          }}>
            <strong>Setup:</strong> open <code style={{ background: '#2a1010', padding: '1px 5px', borderRadius: 4 }}>frontend/.env</code>,
            set <code style={{ background: '#2a1010', padding: '1px 5px', borderRadius: 4 }}>VITE_VAPI_PUBLIC_KEY=your_key</code>,
            then restart <code style={{ background: '#2a1010', padding: '1px 5px', borderRadius: 4 }}>npm run dev</code>.
          </div>
        )}

        {/* Runtime error */}
        {error && !vapiMissing && (
          <div style={{
            backgroundColor: '#100808', border: `1px solid ${C.red}33`,
            borderRadius: 10, padding: '10px 14px', marginBottom: 14,
            fontSize: 13, color: '#ff8888',
          }}>
            ⚠ {error}
          </div>
        )}

        {/* End call */}
        {callActive && (
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <button onClick={endCall} style={{
              backgroundColor: C.redDark, color: '#fff',
              border: `1px solid ${C.red}`, borderRadius: 8,
              padding: '10px 30px', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', letterSpacing: '0.05em',
            }}>
              End Call
            </button>
            <p style={{ margin: '6px 0 0', fontSize: 11, color: C.muted }}>
              or say <em>"Goodbye Sparsha"</em>
            </p>
          </div>
        )}

        {/* Footer */}
        <div style={{
          textAlign: 'center', marginTop: 36, fontSize: 11,
          color: C.dim, letterSpacing: '0.05em', lineHeight: 1.9,
        }}>
          VAPI · Deepgram Nova-2 Medical · GPT-4o-mini · OpenAI Nova<br />
          Medical use only — not a substitute for clinical judgement
        </div>

        </div>

      {/* Cinematic Live Subtitles Overlay */}
      {(activeTranscript || (messages.length > 0 && callActive)) && (
        <div style={{
          position: 'fixed',
          bottom: '60px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '90%',
          maxWidth: '800px',
          pointerEvents: 'none',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          zIndex: 1000,
        }}>
          {activeTranscript ? (
            <div style={{
              backgroundColor: 'rgba(10, 10, 15, 0.85)',
              backdropFilter: 'blur(12px)',
              padding: '16px 36px',
              borderRadius: '24px',
              border: `2px solid ${activeTranscript.role === 'user' ? C.accent : C.blue}66`,
              color: '#fff',
              fontSize: '28px',
              fontWeight: 600,
              lineHeight: 1.4,
              boxShadow: `0 10px 40px rgba(0,0,0,0.6), 0 0 20px ${activeTranscript.role === 'user' ? C.accent : C.blue}22`,
            }}>
              <span style={{ 
                color: activeTranscript.role === 'user' ? C.accent : C.blue, 
                fontSize: '12px', 
                textTransform: 'uppercase', 
                letterSpacing: '3px', 
                display: 'block', 
                marginBottom: '6px',
                fontWeight: 800
              }}>
                {activeTranscript.role === 'user' ? 'You' : 'Sparsha'}
              </span>
              {activeTranscript.text}
              <span style={{ opacity: 0.7, marginLeft: '6px' }}>|</span>
            </div>
          ) : (messages.length > 0 && messages[messages.length - 1]) ? (
            <div style={{
              backgroundColor: 'rgba(10, 10, 15, 0.6)',
              backdropFilter: 'blur(5px)',
              padding: '12px 28px',
              borderRadius: '20px',
              border: `1px solid ${C.border}66`,
              color: '#aaa',
              fontSize: '20px',
              fontWeight: 500,
            }}>
               {messages[messages.length - 1]?.role === 'user' ? 'You: ' : 'Sparsha: '}
               {messages[messages.length - 1]?.text || ''}
            </div>
          ) : null}
        </div>
      )}

        {/* Right Side: Log Book */}
        <div style={{ width: 400, backgroundColor: C.surface, borderRadius: 16, padding: 24, border: `1px solid ${C.border}` }}>
          <h2 style={{ margin: '0 0 20px', fontSize: 18, color: C.text, letterSpacing: '0.05em' }}>📋 Action Log Book</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: 600, overflowY: 'auto' }}>
            {(() => {
              // Spread order matters: default 'alert', then ...a so EHR type wins
              const allLogs = [
                ...vitalsLog,
                ...alerts.map(a => ({ type: 'alert', ...a })),
              ].sort((a, b) => parseInt(b.id) - parseInt(a.id));

              if (allLogs.length === 0) return (
                <div style={{ color: C.muted, fontSize: 14, fontStyle: 'italic' }}>
                  No actions yet. Ask Sparsha to check vitals, alert staff, or dictate a note.
                </div>
              );

              return allLogs.map(item =>
                item.type === 'vitals' ? (
                  <VitalsWidget key={item.id} data={item} />
                ) : item.type === 'ehr' ? (
                  <EHRNoteWidget key={item.id} item={item} />
                ) : (
                  <div key={item.id} style={{
                    padding: 16, borderRadius: 10,
                    backgroundColor: item.status === 'pending' ? '#2a1a1a' : '#1a2a1a',
                    border: `1px solid ${item.status === 'pending' ? C.red : C.green}`,
                  }}>
                    <div style={{ fontSize: 12, color: C.muted, textTransform: 'uppercase', marginBottom: 4 }}>
                      {new Date(parseInt(item.id)).toLocaleTimeString()}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8, color: C.text }}>
                      Room {item.room_number}
                    </div>
                    <div style={{ fontSize: 14, marginBottom: 4 }}>
                      <span style={{ color: C.muted }}>Staff:</span> {item.staff_name}
                    </div>
                    <div style={{ fontSize: 14, marginBottom: 12 }}>
                      <span style={{ color: C.muted }}>Reason:</span> {item.reason}
                    </div>
                    {item.status === 'pending' ? (
                      <div style={{ fontSize: 13, color: C.red, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: C.red, animation: 'flash 1s infinite' }} />
                        Waiting for acknowledgment...
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: C.green, fontWeight: 'bold' }}>
                        ✅ {item.response}
                      </div>
                    )}
                  </div>
                )
              );
            })()}
          </div>
        </div>

      </div>
    </div>
  );
}
