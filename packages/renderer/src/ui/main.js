import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';

const containerElement = document.getElementById('root');
const reactRoot = createRoot(containerElement);
reactRoot.render(<App />);

