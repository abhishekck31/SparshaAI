import React, { useEffect, useState } from 'react';

export default function Receiver() {
  const [alerts, setAlerts] = useState([]);
  const [connStatus, setConnStatus] = useState('Connecting to server...');
  const audioRef = React.useRef(null);

  useEffect(() => {
    // Louder, continuous digital alarm
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
    evtSource.onopen = () => setConnStatus('✅ Connected to Sparsha AI Stream');
    evtSource.onerror = () => setConnStatus('❌ Connection lost. Retrying...');
    evtSource.onmessage = (e) => setAlerts(JSON.parse(e.data));
    return () => evtSource.close();
  }, []);

  const handleOk = async (id) => {
    await fetch(`/api/alerts/${id}/ack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response: 'I am on the way' })
    });
  };

  return (
    <div style={{ padding: 40, fontFamily: 'sans-serif', background: '#05050a', minHeight: '100vh', color: '#fff' }}>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 36, animation: alerts.some(a => a.status === 'pending') ? 'flash 1s infinite' : 'none' }}>🚨</span> 
        Emergency Receiver Dashboard
      </h1>
      <p style={{ color: connStatus.includes('✅') ? '#2ecc71' : '#e74c3c', marginBottom: 30, fontWeight: 'bold' }}>
        {connStatus}
      </p>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {alerts.map(a => (
          <div key={a.id} style={{
            padding: 32, borderRadius: 16,
            background: a.status === 'pending' ? '#2a0505' : '#052a10',
            border: `2px solid ${a.status === 'pending' ? '#e74c3c' : '#2ecc71'}`,
            boxShadow: a.status === 'pending' ? '0 0 30px rgba(231,76,60,0.4)' : 'none',
            display: 'flex', flexDirection: 'column', gap: 16
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 32, color: a.status === 'pending' ? '#ff6b6b' : '#2ecc71' }}>
                  {a.priority === 'CRITICAL' ? '⚠️ CODE BLUE TRIGGERED' : 'URGENT ALERT'} 
                </h2>
                <div style={{ fontSize: 20, color: '#aaa', marginTop: 8 }}>Room: <strong style={{color: '#fff'}}>{a.room_number}</strong> | Patient ID: <strong style={{color: '#fff'}}>{a.patient_id || 'Unknown'}</strong></div>
              </div>
              <div style={{ padding: '8px 16px', borderRadius: 8, background: a.status === 'pending' ? '#e74c3c' : '#2ecc71', fontWeight: 800, fontSize: 18, color: '#fff' }}>
                {a.status.toUpperCase()}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, background: 'rgba(0,0,0,0.3)', padding: 20, borderRadius: 12 }}>
              <div>
                <strong style={{ color: '#e74c3c' }}>CLINICAL SITUATION</strong>
                <div style={{ fontSize: 20, marginTop: 4 }}>{a.situation || a.reason}</div>
              </div>
              <div>
                <strong style={{ color: '#e67e22' }}>RISK ASSESSMENT</strong>
                <div style={{ fontSize: 20, marginTop: 4 }}>{a.risk || 'Immediate assessment required'}</div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <strong style={{ color: '#3498db' }}>VITALS / SYMPTOMS LOGGED</strong>
                <div style={{ fontSize: 20, marginTop: 4, fontFamily: 'monospace' }}>{a.vitals || 'Not provided by reporter'}</div>
              </div>
            </div>

            {a.status === 'pending' ? (
              <button onClick={() => handleOk(a.id)} style={{
                padding: '20px 40px', fontSize: 24, fontWeight: 900,
                cursor: 'pointer', background: '#e74c3c', color: '#fff', 
                border: 'none', borderRadius: 12, width: '100%',
                marginTop: 10, transition: '0.2s', boxShadow: '0 4px 15px rgba(231,76,60,0.5)'
              }}>
                ACKNOWLEDGE & MOBILIZE TEAM
              </button>
            ) : (
              <div style={{
                padding: '20px', fontSize: 20, fontWeight: 'bold',
                background: '#154020', color: '#2ecc71', borderRadius: 12, textAlign: 'center', marginTop: 10
              }}>
                ✅ Acknowledged by {a.staff_name}: "{a.response}"
              </div>
            )}
          </div>
        ))}
        {alerts.length === 0 && <p style={{ fontSize: 20, color: '#666' }}>All systems stable. No active alerts.</p>}
      </div>

      <style>{`
        @keyframes flash {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
