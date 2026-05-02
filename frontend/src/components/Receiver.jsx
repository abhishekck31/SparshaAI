import React, { useEffect, useState } from 'react';

export default function Receiver() {
  const [alerts, setAlerts] = useState([]);
  const [connStatus, setConnStatus] = useState('Establishing Secure Connection...');
  const audioRef = React.useRef(null);

  useEffect(() => {
    audioRef.current = new Audio('https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg');
    audioRef.current.loop = true;
    return () => {
      audioRef.current.pause();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!audioRef.current) return;
    const hasPending = alerts.some(a => a.status === 'pending');
    if (hasPending) {
      audioRef.current.play().catch(err => console.log('Autoplay blocked:', err));
    } else {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [alerts]);

  useEffect(() => {
    const evtSource = new EventSource('/api/alerts/stream');
    evtSource.onopen = () => setConnStatus('✅ Sparsha AI Secure Uplink Active');
    evtSource.onerror = () => setConnStatus('❌ Connection Lost. Re-establishing...');
    evtSource.onmessage = (e) => setAlerts(JSON.parse(e.data));
    return () => evtSource.close();
  }, []);

  const handleOk = async (id) => {
    await fetch(`/api/alerts/${id}/ack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: 'Emergency Response Initiated' })
    });
  };

  return (
    <div style={{ 
      padding: '48px 64px', 
      fontFamily: "'Inter', sans-serif", 
      background: '#ffffff', 
      minHeight: '100vh', 
      color: '#1a1a2e',
      letterSpacing: '-0.01em',
      position: 'relative',
      overflowX: 'hidden'
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap');
        @keyframes pulseAlert {
          0%, 100% { border-color: #dc2626; box-shadow: 0 0 20px rgba(220, 38, 38, 0.1); }
          50% { border-color: #991b1b; box-shadow: 0 0 40px rgba(220, 38, 38, 0.2); }
        }
        .shadow-panel {
          background: #ffffff;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0,0,0,0.05);
        }
      `}</style>

      {/* Architectural Grid (White with Black Lines) */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
        backgroundImage: `
          linear-gradient(to right, rgba(0,0,0,0.05) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(0,0,0,0.05) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 48, borderBottom: '2px solid #f1f5f9', paddingBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 42, fontFamily: "'Outfit', sans-serif", fontWeight: 800, letterSpacing: '-0.03em', display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ color: '#2563eb' }}>📡</span> Command Center
            </h1>
            <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: 16, fontWeight: 600 }}>{connStatus}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 800 }}>Active Protocols</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: alerts.some(a => a.status === 'pending') ? '#dc2626' : '#16a34a' }}>
              {alerts.some(a => a.status === 'pending') ? '⚠️ EMERGENCY RESPONSE' : 'STABLE MONITORING'}
            </div>
          </div>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(600px, 1fr))', gap: 32 }}>
          {alerts.map(a => (
            <div key={a.id} className="shadow-panel" style={{
              padding: 32, 
              borderRadius: 24,
              animation: a.status === 'pending' ? 'pulseAlert 2s infinite ease-in-out' : 'none',
              transition: 'all 0.3s ease',
              display: 'flex',
              flexDirection: 'column',
              gap: 24
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ 
                    width: 64, height: 64, borderRadius: 16, 
                    background: a.status === 'pending' ? '#fee2e2' : '#f0fdf4',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32
                  }}>
                    {a.priority === 'CRITICAL' ? '🏥' : '🚑'}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: a.status === 'pending' ? '#dc2626' : '#16a34a', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      {a.priority || 'NORMAL'} PRIORITY
                    </div>
                    <h2 style={{ margin: 0, fontSize: 28, fontFamily: "'Outfit', sans-serif", fontWeight: 800 }}>
                      RM {a.room_number} <span style={{ color: '#cbd5e1', margin: '0 8px' }}>/</span> {a.patient_id || 'ID-UNKNOWN'}
                    </h2>
                  </div>
                </div>
                <div style={{ 
                  padding: '10px 20px', borderRadius: 12, 
                  background: a.status === 'pending' ? '#dc2626' : '#f0fdf4',
                  color: a.status === 'pending' ? '#fff' : '#16a34a',
                  fontWeight: 800, fontSize: 14, letterSpacing: '0.05em'
                }}>
                  {a.status.toUpperCase()}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                <div style={{ background: '#f8fafc', padding: 20, borderRadius: 16, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>Situation</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>{a.situation || a.reason}</div>
                </div>
                <div style={{ background: '#f8fafc', padding: 20, borderRadius: 16, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>Risk Assessment</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#f78166' }}>{a.risk || 'Immediate assessment required'}</div>
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: 20, borderRadius: 16, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>Vitals / Clinical Log</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#1a1a2e', fontFamily: 'monospace', lineHeight: 1.6 }}>{a.vitals || 'No telemetry provided'}</div>
              </div>

              {a.status === 'pending' ? (
                <button onClick={() => handleOk(a.id)} style={{
                  padding: '24px', fontSize: 20, fontWeight: 800,
                  cursor: 'pointer', background: '#dc2626', color: '#fff', 
                  border: 'none', borderRadius: 16, width: '100%',
                  boxShadow: '0 8px 24px rgba(220, 38, 38, 0.25)',
                  transition: 'transform 0.2s, background 0.2s',
                  fontFamily: "'Outfit', sans-serif",
                  letterSpacing: '0.02em'
                }}
                onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  ACKNOWLEDGE EMERGENCY
                </button>
              ) : (
                <div style={{
                  padding: '24px', fontSize: 18, fontWeight: 800,
                  background: '#f0fdf4', color: '#16a34a', borderRadius: 16, textAlign: 'center',
                  border: '1px solid rgba(22, 163, 74, 0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12
                }}>
                  <span style={{ fontSize: 24 }}>✅</span> Response Logged: "{a.response}"
                </div>
              )}
            </div>
          ))}
          {alerts.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '100px 0', color: '#94a3b8' }}>
              <div style={{ fontSize: 64, marginBottom: 24 }}>🧬</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#64748b' }}>All Stations Reporting Nominal Vitals</div>
              <div style={{ fontSize: 14, marginTop: 8, fontWeight: 500 }}>Secure Uplink Active • Continuous Monitoring Enabled</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
