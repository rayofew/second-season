import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // localhost rather than 127.0.0.1: Firebase authorises the name by default and the numeric
  // address not at all, so signing in works during development with nothing to configure.
  server: { host: 'localhost' },
});
