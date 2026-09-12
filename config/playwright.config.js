import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const projectPath = path => fileURLToPath(new URL(`../${path}`, import.meta.url));

export default defineConfig({
  testDir:projectPath('tests/browser'), outputDir:projectPath('test-results/browser'), timeout:30000, fullyParallel:false,
  use:{baseURL:'http://127.0.0.1:4173',viewport:{width:1440,height:1000},trace:'retain-on-failure'},
  webServer:{command:'npm run build && npm run preview -- --port 4173',cwd:projectRoot,url:'http://127.0.0.1:4173',reuseExistingServer:false}
});
