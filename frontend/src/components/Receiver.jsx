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
      background: '#02040a', 
      minHeight: '100vh', 
      color: '#e6edf3',
      letterSpacing: '-0.01em'
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap');
        @keyframes pulseAlert {
          0%, 100% { border-color: #f85149; box-shadow: 0 0 20px rgba(248, 81, 73, 0.2); }
          50% { border-color: #8e1519; box-shadow: 0 0 40px rgba(248, 81, 73, 0.4); }
        }
        @keyframes flashText {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .glass-panel {
          background: rgba(13, 17, 23, 0.6);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(48, 54, 61, 1);
        }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 48, borderBottom: '1px solid #30363d', paddingBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 42, fontFamily: "'Outfit', sans-serif", fontWeight: 800, letterSpacing: '-0.03em', display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ color: '#f78166' }}>🚨</span> Command Center
          </h1>
          <p style={{ margin: '8px 0 0', color: '#8b949e', fontSize: 16, fontWeight: 500 }}>{connStatus}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 14, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>Active Protocols</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: alerts.some(a => a.status === 'pending') ? '#f85149' : '#3fb950' }}>
            {alerts.some(a => a.status === 'pending') ? '⚠️ EMERGENCY RESPONSE' : 'STABLE MONITORING'}
          </div>
        </div>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(600px, 1fr))', gap: 32 }}>
        {alerts.map(a => (
          <div key={a.id} className="glass-panel" style={{
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
                  background: a.status === 'pending' ? 'rgba(248, 81, 73, 0.1)' : 'rgba(63, 185, 80, 0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32
                }}>
                  {a.priority === 'CRITICAL' ? '🔥' : '📞'}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: a.status === 'pending' ? '#f85149' : '#3fb950', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    {a.priority || 'NORMAL'} PRIORITY
                  </div>
                  <h2 style={{ margin: 0, fontSize: 28, fontFamily: "'Outfit', sans-serif", fontWeight: 700 }}>
                    RM {a.room_number} <span style={{ color: '#484f58', margin: '0 8px' }}>/</span> {a.patient_id || 'ID-UNKNOWN'}
                  </h2>
                </div>
              </div>
              <div style={{ 
                padding: '10px 20px', borderRadius: 12, 
                background: a.status === 'pending' ? '#f85149' : 'rgba(63, 185, 80, 0.1)',
                color: a.status === 'pending' ? '#fff' : '#3fb950',
                fontWeight: 800, fontSize: 14, letterSpacing: '0.05em'
              }}>
                {a.status.toUpperCase()}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div style={{ background: 'rgba(0,0,0,0.2)', padding: 20, borderRadius: 16, border: '1px solid #30363d' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#8b949e', textTransform: 'uppercase', marginBottom: 8 }}>Situation</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#e6edf3' }}>{a.situation || a.reason}</div>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.2)', padding: 20, borderRadius: 16, border: '1px solid #30363d' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#8b949e', textTransform: 'uppercase', marginBottom: 8 }}>Risk Assessment</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#f78166' }}>{a.risk || 'Pending Eval'}</div>
              </div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.2)', padding: 20, borderRadius: 16, border: '1px solid #30363d' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#8b949e', textTransform: 'uppercase', marginBottom: 8 }}>Vitals / Clinical Log</div>
              <div style={{ fontSize: 16, fontWeight: 500, color: '#e6edf3', fontFamily: 'monospace', lineHeight: 1.6 }}>{a.vitals || 'No telemetry provided'}</div>
            </div>

            {a.status === 'pending' ? (
              <button onClick={() => handleOk(a.id)} style={{
                padding: '24px', fontSize: 20, fontWeight: 800,
                cursor: 'pointer', background: '#f85149', color: '#fff', 
                border: 'none', borderRadius: 16, width: '100%',
                boxShadow: '0 8px 24px rgba(248, 81, 73, 0.3)',
                transition: 'transform 0.2s, background 0.2s',
                fontFamily: "'Outfit', sans-serif",
                letterSpacing: '0.02em'
              }}
              onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
              >
                DEPLOY EMERGENCY RESPONSE
              </button>
            ) : (
              <div style={{
                padding: '24px', fontSize: 18, fontWeight: 700,
                background: 'rgba(63, 185, 80, 0.1)', color: '#3fb950', borderRadius: 16, textAlign: 'center',
                border: '1px solid rgba(63, 185, 80, 0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12
              }}>
                <span style={{ fontSize: 24 }}>✅</span> Logged by {a.staff_name}: "{a.response}"
              </div>
            )}
          </div>
        ))}
        {alerts.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '100px 0', color: '#484f58' }}>
            <div style={{ fontSize: 64, marginBottom: 24 }}>📡</div>
            <div style={{ fontSize: 20, fontWeight: 500 }}>All Stations Reporting Nominal Vitals</div>
            <div style={{ fontSize: 14, marginTop: 8 }}>Secure Uplink Active • Continuous Monitoring Protocol Enabled</div>
          </div>
        )}
      </div>
    </div>
  );
}
