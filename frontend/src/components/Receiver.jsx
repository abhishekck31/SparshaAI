import React, { useEffect, useState, useRef } from 'react';

export default function Receiver() {
  const [alerts, setAlerts] = useState([]);
  const [connStatus, setConnStatus] = useState('Establishing Secure Connection...');
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);
  const [lastSignal, setLastSignal] = useState('Never');
  
  const audioCtxRef = useRef(null);
  const oscillatorRef = useRef(null);

  // ── MATHEMATICAL SIREN (Web Audio API - 100% Reliable) ──────────────────────
  const startSiren = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (oscillatorRef.current) return;

    const osc = audioCtxRef.current.createOscillator();
    const gain = audioCtxRef.current.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, audioCtxRef.current.currentTime);
    
    // Siren effect (wavering frequency)
    osc.frequency.exponentialRampToValueAtTime(880, audioCtxRef.current.currentTime + 0.5);
    osc.frequency.exponentialRampToValueAtTime(440, audioCtxRef.current.currentTime + 1.0);
    
    gain.gain.setValueAtTime(0.2, audioCtxRef.current.currentTime);
    
    osc.connect(gain);
    gain.connect(audioCtxRef.current.destination);
    
    osc.loop = true;
    osc.start();
    
    // Create the repeating siren oscillation
    const interval = setInterval(() => {
      if (!oscillatorRef.current) { clearInterval(interval); return; }
      osc.frequency.exponentialRampToValueAtTime(880, audioCtxRef.current.currentTime + 0.5);
      osc.frequency.exponentialRampToValueAtTime(440, audioCtxRef.current.currentTime + 1.0);
    }, 1000);

    oscillatorRef.current = { osc, gain, interval };
  };

  const stopSiren = () => {
    if (oscillatorRef.current) {
      oscillatorRef.current.osc.stop();
      clearInterval(oscillatorRef.current.interval);
      oscillatorRef.current = null;
    }
  };

  // ── Alarm Control Logic ──────────────────────────────────────────────────────
  useEffect(() => {
    // ONLY sound siren if there is a pending alert that is NOT a far-away ambulance
    const hasSirenAlert = Array.isArray(alerts) && alerts.some(a => {
      if (a?.status !== 'pending') return false;
      // If it's an ambulance, only sound siren if distance <= 1km
      if (a?.room_number === 'ENTRANCE') {
        return (parseFloat(a?.distance) || 0) <= 1.0;
      }
      return true; // Always sound siren for room emergencies
    });

    if (hasSirenAlert && isAudioUnlocked) {
      startSiren();
    } else {
      stopSiren();
    }
    return () => stopSiren();
  }, [alerts, isAudioUnlocked]);

  // ── SSE Stream Listener ──────────────────────────────────────────────────────
  useEffect(() => {
    const evtSource = new EventSource('/api/alerts/stream');
    evtSource.onopen = () => setConnStatus('✅ Sparsha AI Secure Uplink Active');
    evtSource.onerror = () => setConnStatus('❌ Connection Lost. Re-establishing...');
    evtSource.onmessage = (e) => {
      setLastSignal(new Date().toLocaleTimeString());
      try {
        const data = JSON.parse(e.data);
        if (Array.isArray(data)) setAlerts(data);
      } catch (err) { console.error(err); }
    };
    return () => evtSource.close();
  }, []);

  const handleOk = async (id) => {
    // OPTIMISTIC UPDATE: Change local state instantly
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: 'acknowledged', response: 'Team Responded' } : a));

    try {
      await fetch(`/api/alerts/${id}/ack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: 'The team has responded and is on the way.' })
      });
    } catch (err) {
      console.error('[RECEIVER] Acknowledge failed:', err);
    }
  };

  const unlockAudio = () => {
    setIsAudioUnlocked(true);
    // Initialize context on user gesture
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
  };

  return (
    <div style={{ padding: '48px 64px', fontFamily: "'Inter', sans-serif", background: '#ffffff', minHeight: '100vh', position: 'relative' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap');
        @keyframes pulseAlert {
          0%, 100% { border-color: #dc2626; box-shadow: 0 0 30px rgba(220, 38, 38, 0.2); }
          50% { border-color: #991b1b; box-shadow: 0 0 60px rgba(220, 38, 38, 0.5); }
        }
      `}</style>

      {/* Grid Overlay */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, backgroundImage: 'linear-gradient(to right, rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.03) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {!isAudioUnlocked && (
          <div style={{ background: '#dc2626', color: '#fff', padding: '24px', borderRadius: '16px', marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>🔊 Audio System Initializing</div>
            <button onClick={unlockAudio} style={{ background: '#fff', color: '#dc2626', border: 'none', padding: '12px 32px', borderRadius: '12px', fontWeight: 800, cursor: 'pointer' }}>ACTIVATE SIREN</button>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 48, borderBottom: '2px solid #f1f5f9', paddingBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 42, fontFamily: "'Outfit', sans-serif", fontWeight: 800 }}>📡 Command Receiver</h1>
            <p style={{ margin: '8px 0 0', color: '#64748b', fontWeight: 600 }}>{connStatus}</p>
          </div>
          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-end' }}>
            <button onClick={async () => {
              await fetch('/api/alerts/clear', { method: 'POST' });
            }} style={{ 
              background: '#f1f5f9', color: '#64748b', border: 'none', padding: '8px 16px', 
              borderRadius: '8px', fontSize: 11, fontWeight: 800, cursor: 'pointer',
              letterSpacing: '0.05em'
            }}>🧹 CLEAR ALL</button>
            <div>
              <div style={{ fontSize: 14, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Heartbeat</div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{lastSignal}</div>
            </div>
          </div>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(600px, 1fr))', gap: 32 }}>
          {Array.isArray(alerts) && alerts.map(a => (
            <div key={a?.id} style={{
              padding: 32, borderRadius: 24, background: '#fff', border: a?.status === 'pending' ? '4px solid #dc2626' : '1px solid #e2e8f0',
              animation: a?.status === 'pending' ? 'pulseAlert 1.5s infinite ease-in-out' : 'none',
              display: 'flex', flexDirection: 'column', gap: 24
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ 
                    width: 64, height: 64, borderRadius: 16, 
                    background: a?.room_number === 'ENTRANCE' ? '#2563eb' : (a?.status === 'pending' ? '#dc2626' : '#f0fdf4'), 
                    color: '#fff', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 
                  }}>
                    {a?.room_number === 'ENTRANCE' ? '🚑' : (a?.status === 'pending' ? '🆘' : '✅')}
                  </div>
                  <h2 style={{ margin: 0, fontSize: 32, fontFamily: "'Outfit', sans-serif", fontWeight: 800 }}>
                    {a?.room_number === 'ENTRANCE' ? 'EMERGENCY ENTRANCE' : `ROOM ${a?.room_number || '??'}`}
                  </h2>
                </div>
              </div>
              <div style={{ background: '#f8fafc', padding: 24, borderRadius: 20 }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{a?.situation || a?.reason || 'Critical medical event'}</div>
                
                {/* AMBULANCE RADAR HUD */}
                {a?.room_number === 'ENTRANCE' && (
                  <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div style={{ background: '#2563eb', color: '#fff', padding: '12px', borderRadius: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, fontWeight: 800, opacity: 0.8 }}>DISTANCE</div>
                      <div style={{ fontSize: 20, fontWeight: 800 }}>{a?.distance || '??'} KM</div>
                    </div>
                    <div style={{ background: '#1e293b', color: '#fff', padding: '12px', borderRadius: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, fontWeight: 800, opacity: 0.8 }}>ARRIVAL ETA</div>
                      <div style={{ fontSize: 20, fontWeight: 800 }}>{a?.eta || '??'} MIN</div>
                    </div>
                    <div style={{ gridColumn: '1 / -1', padding: '10px', borderRadius: '10px', background: (parseFloat(a?.distance) || 0) <= 1.0 ? '#fee2e2' : '#f1f5f9', color: (parseFloat(a?.distance) || 0) <= 1.0 ? '#dc2626' : '#64748b', fontSize: 12, fontWeight: 800, textAlign: 'center', border: '1px solid' }}>
                      {(parseFloat(a?.distance) || 0) <= 1.0 ? '🚨 PROXIMITY ALARM ACTIVE ( < 1KM )' : '📡 MONITORING APPROACH (SIREN MUTED)'}
                    </div>
                  </div>
                )}
              </div>
              {a?.status === 'pending' ? (
                <button onClick={() => handleOk(a.id)} style={{ padding: '24px', fontSize: 22, fontWeight: 800, cursor: 'pointer', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 20 }}>
                  CONFIRM RESPONSE
                </button>
              ) : (
                <div style={{ padding: '24px', fontSize: 18, fontWeight: 800, background: '#f0fdf4', color: '#16a34a', borderRadius: 16, textAlign: 'center' }}>
                  ✅ Response Dispatched
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
