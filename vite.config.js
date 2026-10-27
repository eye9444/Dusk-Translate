import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const page = name => fileURLToPath(new URL(`./web/${name}`, import.meta.url));
const packageVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url))).version;
const deploymentEnvironment = process.env.VITE_APP_ENV || (process.env.VERCEL_ENV === 'production' ? 'production' : process.env.VERCEL_ENV || 'development');
const buildCommit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'local';

export default defineConfig({
  root: 'web',
  // Keep the documented root-level .env files consistent with Vercel variables.
  envDir: fileURLToPath(new URL('.', import.meta.url)),
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageVersion),
    'import.meta.env.VITE_APP_ENV': JSON.stringify(deploymentEnvironment),
    'import.meta.env.VITE_BUILD_SHA': JSON.stringify(buildCommit)
  },
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
        features: page('features.html'),
        apiKeys: page('guides/api-keys.html')
      }
    }
  }
});
