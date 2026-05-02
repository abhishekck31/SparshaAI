import React, { useRef, useEffect, useState, useCallback } from 'react';

const C = {
  blue: '#2563eb',
  blueLight: '#eff6ff',
  text: '#1a1a2e',
  muted: '#64748b',
  border: '#e2e8f0',
  surface: '#ffffff',
  red: '#dc2626'
};

const Card = ({ children, style, onClick }) => (
  <div 
    onClick={onClick}
    style={{
      padding: '12px 16px',
      borderRadius: '12px',
      border: `1px solid ${C.border}`,
      backgroundColor: '#ffffff',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
      ...style
    }}
    onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.blue; e.currentTarget.style.backgroundColor = C.blueLight; }}
    onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.backgroundColor = '#ffffff'; }}
  >
    {children}
  </div>
);

const IconButton = ({ children, onClick, style, variant = 'primary' }) => (
  <button 
    onClick={onClick}
    style={{
      width: '36px',
      height: '36px',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: 'none',
      cursor: 'pointer',
      backgroundColor: variant === 'primary' ? C.blue : (variant === 'danger' ? C.red : '#f1f5f9'),
      color: variant === 'ghost' ? C.muted : '#ffffff',
      transition: 'transform 0.1s active',
      ...style
    }}
  >
    {children}
  </button>
);

export function MultimodalInput({
  messages = [],
  onSendMessage,
  onStopGenerating,
  isGenerating,
  canSend,
  className
}) {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState([]);
  const textareaRef = useRef(null);

  const adjustHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  };

  useEffect(() => { adjustHeight(); }, [input]);

  const submitForm = () => {
    if (!input.trim() && attachments.length === 0) return;
    onSendMessage({ input, attachments });
    setInput('');
    setAttachments([]);
  };

  const suggestedActions = [
    { title: 'Check vitals for', label: 'Room 101', action: 'What are the vitals for room 101?' },
    { title: 'Generate report', label: 'PDF', action: 'Generate emergency report.' },
  ];

  return (
    <div style={{
      width: '100%',
      backgroundColor: '#ffffff',
      borderRadius: '24px',
      padding: '20px',
      boxShadow: '0 20px 50px rgba(0,0,0,0.08)',
      border: `1px solid ${C.border}`,
      fontFamily: "'Inter', sans-serif"
    }}>
      
      {/* Transcript Log */}
      {messages.length > 0 && (
        <div style={{ 
          maxHeight: '120px', 
          overflowY: 'auto', 
          marginBottom: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          paddingRight: '8px'
        }}>
          {messages.slice(-3).map((m, i) => (
            <div key={i} style={{
              padding: '10px 14px',
              borderRadius: '12px',
              fontSize: '13px',
              maxWidth: '85%',
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              backgroundColor: m.role === 'user' ? C.blueLight : '#f8fafc',
              color: m.role === 'user' ? C.blue : C.text,
              border: `1px solid ${m.role === 'user' ? '#dbeafe' : C.border}`
            }}>
              <span style={{ fontSize: '9px', fontWeight: '900', opacity: 0.5, textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>{m.role}</span>
              {m.content}
            </div>
          ))}
        </div>
      )}

      {/* Suggested Actions Grid */}
      {input.length === 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
          {suggestedActions.map((act, i) => (
            <Card key={i} onClick={() => setInput(act.action)}>
              <span style={{ fontWeight: '800', fontSize: '13px', color: C.text }}>{act.title}</span>
              <span style={{ fontSize: '11px', color: C.muted }}>{act.label}</span>
            </Card>
          ))}
        </div>
      )}

      {/* Main Input Area */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type or use clinical shortcuts..."
          style={{
            width: '100%',
            minHeight: '80px',
            padding: '16px 50px 16px 16px',
            borderRadius: '16px',
            border: `1px solid ${C.border}`,
            backgroundColor: '#f8fafc',
            fontSize: '15px',
            color: C.text,
            outline: 'none',
            resize: 'none',
            transition: 'border-color 0.2s',
            fontFamily: 'inherit'
          }}
          onFocus={(e) => e.target.style.borderColor = C.blue}
          onBlur={(e) => e.target.style.borderColor = C.border}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitForm(); } }}
        />

        <div style={{ 
          position: 'absolute', 
          bottom: '12px', 
          right: '12px',
          display: 'flex',
          gap: '8px'
        }}>
          {isGenerating ? (
            <IconButton onClick={onStopGenerating} variant="danger">
               <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M3 3H13V13H3V3Z"/></svg>
            </IconButton>
          ) : (
            <IconButton onClick={submitForm} disabled={!canSend}>
               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>
            </IconButton>
          )}
        </div>

        <div style={{ position: 'absolute', bottom: '12px', left: '12px' }}>
          <IconButton variant="ghost" onClick={() => {}}>
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.51a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
          </IconButton>
        </div>
      </div>
    </div>
  );
}
