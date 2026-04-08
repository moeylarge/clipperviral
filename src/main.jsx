import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Missing #root element in HTML.');
}

rootElement.innerHTML = '<main class="page">Loading Peptide Pathways…</main>';

try {
  createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (error) {
  rootElement.innerHTML = `<main class="page"><strong>Peptide Pathways failed to start.</strong><br />${error?.message || 'Unknown error'}<br /><br />Check your browser console for details.</main>`;
  console.error(error);
}
