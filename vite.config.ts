import { writeFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Every build gets an identity, and publishes it where the running app can see it.
 *
 * A deployed page has no way of knowing it has been superseded — it holds whichever bundle it was
 * told about when it loaded, and will go on holding it until somebody thinks to reload. Over four
 * weeks of a rehearsal that means people looking at last week's app and reporting bugs that were
 * fixed on Tuesday.
 *
 * So the id is baked into the bundle and also written to version.json, which is never cached. The
 * app compares the two and says something when they differ.
 */
const BUILD = new Date().toISOString();

function publishVersion() {
  return {
    name: 'publish-version',
    closeBundle() {
      writeFileSync('dist/version.json', JSON.stringify({ build: BUILD }));
    },
  };
}

export default defineConfig({
  plugins: [react(), publishVersion()],
  define: { __BUILD__: JSON.stringify(BUILD) },
  // localhost rather than 127.0.0.1: Firebase authorises the name by default and the numeric
  // address not at all, so signing in works during development with nothing to configure.
  server: { host: 'localhost' },
});
