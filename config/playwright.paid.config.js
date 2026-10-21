import {fileURLToPath} from 'node:url';
import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir:fileURLToPath(new URL('../tests/browser',import.meta.url)),
  testMatch:'pricing.spec.js',
  outputDir:fileURLToPath(new URL('../test-results/paid',import.meta.url)),
  use:{baseURL:'http://127.0.0.1:4174'},
  webServer:{
    command:'npm run dev -- --host 127.0.0.1 --port 4174',
    cwd:fileURLToPath(new URL('..',import.meta.url)),
    url:'http://127.0.0.1:4174',
    env:{VITE_PAID_TESTING:'true'},
    reuseExistingServer:false,
  },
});
