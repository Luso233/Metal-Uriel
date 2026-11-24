import React from 'react';
import { createRoot } from 'react-dom/client';
import Chart from 'chart.js/auto';
import { createIcons, icons } from 'lucide';
import SetupWizard, { browserRandomPassword } from './components/SetupWizard.jsx';
import App from './App.jsx';
import './index.css';

// Exponer Chart, Lucide y SetupWizard localmente (100% offline en LAN sin CDNs externos)
window.Chart = Chart;
window.lucide = {
    createIcons: () => createIcons({ icons })
};
window.MetalUrielSetupWizard = SetupWizard;
window.MetalUrielRandomPassword = browserRandomPassword;

const rootEl = document.getElementById('root');
createRoot(rootEl).render(<App />);
