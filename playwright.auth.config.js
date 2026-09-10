import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'tests/auth',timeout:30000,
  use:{baseURL:'http://127.0.0.1:4174',trace:'retain-on-failure'},
  webServer:{command:'npm run dev -- --port 4174',url:'http://127.0.0.1:4174',env:{VITE_SUPABASE_URL:'https://dusk-test.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test_fixture_not_a_real_key'},reuseExistingServer:false}
});
