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

export async function renderGoogleCredentialButton(container, onCredential) {
  if (!clientId) throw new Error('Google sign-in is not configured on this deployment yet.');
  const identity = await loadGoogleIdentity();
  const nonce = randomNonce();
  const nonceHash = await digestNonce(nonce);
  identity.initialize({
    client_id: clientId,
    nonce: nonceHash,
    callback: response => onCredential(response?.credential
      ? { token:response.credential, nonce }
      : null)
  });
  container.replaceChildren();
  identity.renderButton(container, {
    type:'standard', theme:'outline', size:'large', text:'continue_with', shape:'rectangular',
    logo_alignment:'left', width:Math.max(240, Math.floor(container.getBoundingClientRect().width))
  });
}
