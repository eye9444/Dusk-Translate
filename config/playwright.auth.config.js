import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const projectPath = path => fileURLToPath(new URL(`../${path}`, import.meta.url));

export default defineConfig({
  testDir:projectPath('tests/auth'),outputDir:projectPath('test-results/auth'),timeout:30000,
  use:{baseURL:'http://127.0.0.1:4174',trace:'retain-on-failure'},
  webServer:{command:'npm run dev -- --port 4174',cwd:projectRoot,url:'http://127.0.0.1:4174',env:{VITE_SUPABASE_URL:'https://dusk-test.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test_fixture_not_a_real_key'},reuseExistingServer:false}
});
