import { defineConfig } from 'vite';
import { hapticBridge } from './native/bridge.ts';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ mode }) => {
  const localPreview = mode === 'loopback';
  return {
    plugins: localPreview ? [hapticBridge()] : [basicSsl()],
    server: {
      host: localPreview ? '127.0.0.1' : true,
      port: localPreview ? 5174 : 5173,
      strictPort: true,
    },
  };
});
