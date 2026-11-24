import React from 'react';
import { createRoot } from 'react-dom/client';
import Chart from 'chart.js/auto';
import { createIcons, icons } from 'lucide';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import SetupWizard, { browserRandomPassword } from './components/SetupWizard.jsx';
import App from './App.jsx';
import { installApiFetchInterceptor, isNativeCapacitor } from './utils/serverConnection.js';
import './index.css';

// 1. Interceptar fetch('/api/*') ANTES de montar React para que la APK Capacitor apunte al servidor Headless/LAN
installApiFetchInterceptor();

// 2. Exponer dependencias localmente (100% offline sin CDNs)
window.Chart = Chart;
window.lucide = {
    createIcons: () => createIcons({ icons })
};
window.MetalUrielSetupWizard = SetupWizard;
window.MetalUrielRandomPassword = browserRandomPassword;

// 3. Configurar barra de estado (sin solapar WebView) y botón Atrás nativo en Android (Capacitor)
if (isNativeCapacitor()) {
    StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
    StatusBar.setBackgroundColor({ color: '#111B21' }).catch(() => {});
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    CapApp.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack) {
            window.history.back();
        } else {
            CapApp.minimizeApp().catch(() => {});
        }
    }).catch(() => {});
}

const rootEl = document.getElementById('root');
createRoot(rootEl).render(<App />);
