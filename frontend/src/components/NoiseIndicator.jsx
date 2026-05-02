import React from 'react';

// Five bars that animate like an audio waveform. Only visible while recording.
const BARS = [
  { height: 18, duration: '0.5s', delay: '0.00s' },
  { height: 32, duration: '0.7s', delay: '0.12s' },
  { height: 48, duration: '0.4s', delay: '0.05s' },
  { height: 32, duration: '0.6s', delay: '0.18s' },
  { height: 18, duration: '0.5s', delay: '0.09s' },
];

export default function NoiseIndicator({ listening }) {
  if (!listening) return null;

  return (
    <div
      aria-label="Audio waveform — recording active"
      style={{ display: 'flex', alignItems: 'center', gap: 5, height: 60 }}
    >
      <style>{`
        @keyframes waveBar {
          0%, 100% { transform: scaleY(0.25); opacity: 0.6; }
          50%       { transform: scaleY(1);    opacity: 1;   }
        }
      `}</style>

      {BARS.map((bar, i) => (
        <div
          key={i}
          style={{
            width: 5,
            height: bar.height,
            backgroundColor: '#d97757',
            borderRadius: 3,
            transformOrigin: 'center bottom',
            animation: `waveBar ${bar.duration} ease-in-out ${bar.delay} infinite`,
          }}
        />
      ))}
    </div>
  );
}
