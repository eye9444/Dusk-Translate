import {fileURLToPath} from 'node:url';
import {defineConfig} from '@playwright/test';

const root=fileURLToPath(new URL('..',import.meta.url));
export default defineConfig({
  testDir:fileURLToPath(new URL('../tests/modules',import.meta.url)),outputDir:fileURLToPath(new URL('../test-results/modules',import.meta.url)),timeout:30000,
  use:{baseURL:'http://127.0.0.1:4175',trace:'retain-on-failure'},
  webServer:{command:'npm run dev -- --port 4175',cwd:root,url:'http://127.0.0.1:4175',reuseExistingServer:false}
});
