import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { VaultProvider } from './state/store';
import './styles/app.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <VaultProvider>
      <App />
    </VaultProvider>
  </React.StrictMode>,
);
