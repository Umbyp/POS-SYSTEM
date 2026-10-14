import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The scene code is shared with the mobile app (written for @react-three/fiber/native),
// so on the web the native entry points to the web build.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@react-three/fiber/native': '@react-three/fiber' },
  },
  server: {
    port: 5180,
    // Same-origin to the browser. The API only allows its own web app's Origin (CORS), so the
    // proxy drops the Origin header and the API stays untouched.
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        configure: (proxy) => proxy.on('proxyReq', (req) => req.removeHeader('origin')),
      },
      '/socket.io': {
        target: 'http://localhost:4000',
        ws: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (req) => req.removeHeader('origin'));
          proxy.on('proxyReqWs', (req) => req.removeHeader('origin'));
        },
      },
    },
  },
});
