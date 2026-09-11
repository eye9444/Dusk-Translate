import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const page = name => fileURLToPath(new URL(`./web/${name}`, import.meta.url));

export default defineConfig({
  root: 'web',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // Explicit inputs keep direct links to the static policy and setup pages working in production.
    rollupOptions: {
      input: {
        main: page('index.html'),
        privacy: page('privacy.html'),
        terms: page('terms.html'),
        cookies: page('cookies.html'),
        apiKeys: page('guides/api-keys.html')
      }
    }
  }
});
