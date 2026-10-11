import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('password changes require the current password and confirmation', async () => {
  const [html, main] = await Promise.all([read('web/index.html'), read('web/src/main.js')]);

  assert.match(html, /id="current-password"[^>]+autocomplete="current-password"/);
  assert.match(html, /id="confirm-password"[^>]+autocomplete="new-password"/);
  assert.match(main, /updateUser\(\{password,current_password:\$\('current-password'\)\.value,email:user\.email\}\)/);
  assert.match(main, /password!==\$\('confirm-password'\)\.value/);
});

test('password recovery verifies an emailed OTP before changing the password', async () => {
  const [html, main] = await Promise.all([read('web/index.html'), read('web/src/main.js')]);

  assert.match(html, /id="recovery-code"[^>]+autocomplete="one-time-code"/);
  assert.match(main, /resetPasswordForEmail\(email,\{redirectTo,captchaToken\}\)/);
  assert.match(main, /verifyOtp\(\{email:recoveryEmail,token:\$\('recovery-code'\)\.value\.trim\(\),type:'recovery'\}\)/);
  assert.match(main, /recoveryEmail=email;setAuthBusy\(false\);showAuth\('recover'\)/);
});

test('email authentication passes Turnstile tokens and production permits required frames', async () => {
  const [html, main, vercel] = await Promise.all([
    read('web/index.html'),
    read('web/src/main.js'),
    read('vercel.json'),
  ]);

  assert.match(html, /id="auth-captcha"/);
  assert.match(main, /VITE_TURNSTILE_SITE_KEY/);
  assert.match(main, /signInWithPassword\(\{email,password,options:\{captchaToken\}\}\)/);
  assert.match(vercel, /frame-src[^";]*https:\/\/challenges\.cloudflare\.com/);
});

test('production CSP permits feedback screenshots from Supabase Storage', async () => {
  const vercel = await read('vercel.json');
  assert.match(vercel, /img-src[^";]*https:\/\/\*\.supabase\.co/);
});
