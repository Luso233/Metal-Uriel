import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    root: path.resolve(__dirname, 'client'),
    base: '/',
    plugins: [react()],
    css: {
        postcss: path.resolve(__dirname, 'postcss.config.cjs')
    },
    build: {
        outDir: path.resolve(__dirname, 'public', 'dist'),
        emptyOutDir: true,
        sourcemap: false
    },
    server: {
        port: 5173,
        proxy: {
            '/api': 'http://localhost:3000',
            '/webhook': 'http://localhost:3000',
            '/uploads': 'http://localhost:3000'
        }
    }
});
