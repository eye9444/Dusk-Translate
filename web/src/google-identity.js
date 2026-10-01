const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
let scriptPromise;

function loadGoogleIdentity() {
  if (globalThis.google?.accounts?.id) return Promise.resolve(globalThis.google.accounts.id);
  if (!clientId) throw new Error('Google sign-in is not configured on this deployment yet.');
  scriptPromise ||= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(globalThis.google.accounts.id);
    script.onerror = () => reject(new Error('Could not load Google sign-in. Check your connection and try again.'));
    document.head.append(script);
  });
  return scriptPromise;
}

function randomNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes));
}

async function digestNonce(nonce) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function requestGoogleCredential() {
  if (!clientId) throw new Error('Google sign-in is not configured on this deployment yet.');
  const identity = await loadGoogleIdentity();
  const nonce = randomNonce();
  const nonceHash = await digestNonce(nonce);
  return new Promise((resolve, reject) => {
    identity.initialize({
      client_id: clientId,
      nonce: nonceHash,
      callback: response => response?.credential
        ? resolve({ token: response.credential, nonce })
        : reject(new Error('Google sign-in did not return an account. Please try again.'))
    });
    identity.prompt(notification => {
      if (notification?.isNotDisplayed?.() || notification?.isSkippedMoment?.()) {
        reject(new Error('Google could not open the account chooser. Allow sign-in prompts and try again.'));
      }
    });
  });
}
