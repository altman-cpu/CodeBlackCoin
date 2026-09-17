import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import OBSOverlay from './components/OBSOverlay';

export default function App() {
  const [isObsOverlay, setIsObsOverlay] = useState(false);

  useEffect(() => {
    const path = window.location.pathname;
    const search = window.location.search;
    if (path.includes('obs-overlay') || search.includes('overlay=true')) {
      setIsObsOverlay(true);
      document.body.classList.add('obs-mode');
    }
  }, []);

  if (isObsOverlay) {
    return <OBSOverlay isPreview={false} />;
  }

  return <Dashboard />;
}
