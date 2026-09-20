async function loadManagerRatings(preview) {
  let token;
  try { token = localStorage.getItem('auth_token'); } catch {}
  if (!token) return preview;
  try {
    const response = await fetch('/api/manager-ratings', {
      headers: {Authorization: 'Bearer ' + token}, cache: 'no-store',
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error('Access check failed');
    return await response.json();
  } catch {
    document.getElementById('manager-access-status').textContent = 'We could not check your subscription. Showing the free preview; reload to try again.';
    return preview;
  }
}

function setupManagerAccess(data) {
  const pro = data.access === 'pro';
  document.getElementById('manager-paywall').hidden = pro;
  document.getElementById('manager-access-label').textContent = pro ? 'SteamWatch Pro · Full access' : 'Free preview · Top 3 overall';
  const download = document.querySelector('a[download]');
  if (download) {
    // Serialize before date filters mutate the presentation rows.
    download.href = URL.createObjectURL(new Blob([JSON.stringify(data)], {type:'application/json'}));
    download.download = 'manager-ratings.json';
    download.textContent = pro ? 'Download underlying data (JSON)' : 'Download top-three preview (JSON)';
  }
  if (pro) return;
  const dialog = document.getElementById('manager-access-dialog');
  const message = document.getElementById('manager-access-message');
  let mode = 'subscribe';
  document.querySelectorAll('[data-manager-access]').forEach(button => button.addEventListener('click', () => {
    mode = button.dataset.managerAccess;
    document.getElementById('manager-access-title').textContent = mode === 'signin' ? 'Sign in to SteamWatch' : 'Unlock every manager with Pro';
    document.getElementById('manager-access-submit').textContent = mode === 'signin' ? 'Email me a sign-in link' : 'Continue to secure checkout';
    message.textContent = '';
    dialog.showModal();
  }));
  document.getElementById('manager-access-close').addEventListener('click', () => dialog.close());
  document.getElementById('manager-access-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = document.getElementById('manager-access-submit');
    button.disabled = true;
    message.textContent = 'Please wait…';
    try {
      try { localStorage.setItem('manager_ratings_return', String(Date.now())); } catch {}
      const response = await fetch(mode === 'signin' ? '/api/auth/magic-link' : '/api/stripe/create-public-checkout-session', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({email: document.getElementById('manager-access-email').value, manager_ratings: true})
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'Unable to continue. Please try again.');
      if (mode === 'signin') message.textContent = 'Check your email for your sign-in link.';
      else window.location.assign(result.checkout_url);
    } catch (error) { message.textContent = error.message || 'Unable to continue. Please try again.'; }
    finally { button.disabled = false; }
  });
  if (new URLSearchParams(location.search).get('checkout') === 'success') {
    document.getElementById('manager-access-status').textContent = 'Thanks for subscribing. Use the sign-in link in your email to unlock the full rankings. Already signed in? Reload after your payment is confirmed.';
  }
}
