module.exports = {
    darkMode: 'class',
    content: [
        './client/index.html',
        './client/src/**/*.{js,jsx,ts,tsx}'
    ],
    theme: {
        extend: {
            colors: {
                unid: {
                    navy: '#0A192F',
                    dark: '#0F172A',
                    card: '#1E293B',
                    border: '#334155',
                    gold: '#FFC72C',
                    goldHover: '#F59E0B',
                    goldLight: '#FEF08A',
                    red: '#D92525',
                    redDark: '#991B1B',
                    blueAccent: '#1E3E62'
                },
                wa: {
                    green: '#00A884',
                    teal: '#128C7E',
                    darkBg: '#0C1317',
                    chatBg: '#111B21',
                    bubbleMe: '#005C4B',
                    bubbleBot: '#202C33',
                    inputBg: '#2A3942'
                }
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
                mono: ['JetBrains Mono', 'Consolas', 'monospace']
            }
        }
    },
    plugins: []
};
