import React from 'react';
import { createRoot } from 'react-dom/client';
import { installStorage } from './storage.js';
import './index.css';

installStorage();

// Import after the storage shim is installed.
import('./Ledgerly.jsx').then(({ default: Ledgerly }) => {
  createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <Ledgerly />
    </React.StrictMode>
  );
});
