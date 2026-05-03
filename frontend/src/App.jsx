import React from 'react';
import VoiceInterface from './components/VoiceInterface';
import Receiver from './components/Receiver';

export default function App() {
  if (window.location.pathname.includes('/receiver')) {
    return <Receiver />;
  }
  return <VoiceInterface />;
}
