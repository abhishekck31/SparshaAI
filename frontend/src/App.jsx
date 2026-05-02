import React from 'react';
import VoiceInterface from './components/VoiceInterface';
import Receiver from './components/Receiver';

export default function App() {
  if (window.location.pathname === '/receiver') {
    return <Receiver />;
  }
  return <VoiceInterface />;
}
