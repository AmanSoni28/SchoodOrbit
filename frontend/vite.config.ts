import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The API is proxied so the browser sees one origin: cookies stay first-party and SameSite=Lax works.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Inline (empty) PostCSS config stops Vite from picking up a postcss.config.js in a parent folder.
  css: { postcss: {} },
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } },
});
