const $ = (s) => document.querySelector(s);
const state = { user: null, listings: [], category: 'All', query: '' };
const categoryEmoji = { Books: '📚', Clothing: '👕', Electronics: '🎧', Home: '🏡', Sports: '⚽', Other: '📦' };
const categoryBg = { Books: 'bg-books', Clothing: 'bg-clothing', Electronics: 'bg-electronics', Home: 'bg-home', Sports: 'bg-sports', Other: 'bg-other' };
$('#year').textContent = new Date().getFullYear();

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}
function toast(message) {
  const el = $('#toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 3200);
}
function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
}
function openModal(html) { $('#modalContent').innerHTML = html; $('#modalBackdrop').classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
function closeModal() { $('#modalBackdrop').classList.add('hidden'); document.body.style.overflow = ''; }
$('#modalClose').addEventListener('click', closeModal);
$('#modalBackdrop').addEventListener('click', e => { if (e.target === $('#modalBackdrop')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function authModal(mode = 'login') {
  const isRegister = mode === 'register';
  openModal(`<div class="eyebrow">WELCOME TO REUSEHUB</div><h2 id="modalTitle">${isRegister ? 'Join the good cycle.' : 'Welcome back.'}</h2><p class="modal-sub">${isRegister ? 'Create an account and start sharing useful things.' : 'Log in to post items and connect with your community.'}</p>
    <form id="authForm">${isRegister ? `<div class="form-group"><label for="authName">Your name</label><input id="authName" name="name" autocomplete="name" required minlength="2" maxlength="80" placeholder="e.g. Priya Sharma"></div>` : ''}
    <div class="form-group"><label for="authEmail">Email address</label><input id="authEmail" name="email" type="email" autocomplete="email" required maxlength="160" placeholder="you@example.com"></div>
    <div class="form-group"><label for="authPassword">Password</label><input id="authPassword" name="password" type="password" autocomplete="${isRegister ? 'new-password' : 'current-password'}" required minlength="${isRegister ? 8 : 1}" maxlength="100" placeholder="${isRegister ? 'At least 8 characters' : 'Your password'}"></div>
    <button class="btn btn-green form-submit" type="submit">${isRegister ? 'Create account →' : 'Log in →'}</button></form>
    <p class="form-switch">${isRegister ? 'Already have an account?' : 'New to ReuseHub?'} <button class="text-btn" id="switchAuth">${isRegister ? 'Log in' : 'Join free'}</button></p>
    <div class="modal-note">🔒 Your account details are kept private. Meet for exchanges in a safe, public place.</div>`);
  $('#switchAuth').addEventListener('click', () => authModal(isRegister ? 'login' : 'register'));
  $('#authForm').addEventListener('submit', async e => {
    e.preventDefault(); const button = e.currentTarget.querySelector('button[type="submit"]'); button.disabled = true; button.textContent = 'Please wait…';
    const form = new FormData(e.currentTarget); const body = Object.fromEntries(form.entries());
    try { const data = await api(isRegister ? '/api/register' : '/api/login', { method: 'POST', body: JSON.stringify(body) }); state.user = data.user; closeModal(); renderNav(); toast(isRegister ? `Welcome, ${state.user.name}!` : `Welcome back, ${state.user.name}!`); await loadListings(); }
    catch (err) { toast(err.message); button.disabled = false; button.textContent = isRegister ? 'Create account →' : 'Log in →'; }
  });
}

function renderNav() {
  const el = $('#navActions');
  if (!state.user) { el.innerHTML = '<button class="btn btn-ghost" id="loginBtn">Log in</button><button class="btn btn-dark" id="signupBtn">Join free <span>↗</span></button>'; }
  else { el.innerHTML = `<button class="btn btn-ghost" id="dashboardBtn">Hi, ${escapeHtml(state.user.name.split(' ')[0])} ▾</button><button class="btn btn-dark" id="logoutBtn">Log out</button>`; }
  $('#loginBtn')?.addEventListener('click', () => authModal('login'));
  $('#signupBtn')?.addEventListener('click', () => authModal('register'));
  $('#dashboardBtn')?.addEventListener('click', showDashboard);
  $('#logoutBtn')?.addEventListener('click', async () => { try { await api('/api/logout', { method: 'POST', body: '{}' }); state.user = null; renderNav(); await loadListings(); toast('You are logged out.'); } catch (e) { toast(e.message); } });
}

function postModal() {
  if (!state.user) { authModal('register'); toast('Create a free account to post an item.'); return; }
  openModal(`<div class="eyebrow">PASS SOMETHING ON</div><h2 id="modalTitle">Post an item.</h2><p class="modal-sub">Add a few details so someone can give it a new home.</p>
    <form id="postForm"><div class="form-group"><label for="itemTitle">Item title *</label><input id="itemTitle" name="title" required minlength="3" maxlength="100" placeholder="e.g. First-year engineering textbooks"></div>
    <div class="form-group"><label for="itemDescription">Description *</label><textarea id="itemDescription" name="description" required minlength="10" maxlength="700" placeholder="Describe the item and anything a new owner should know…"></textarea></div>
    <div class="form-grid"><div class="form-group"><label for="itemCategory">Category</label><select id="itemCategory" name="category"><option>Books</option><option>Clothing</option><option>Electronics</option><option>Home</option><option>Sports</option><option>Other</option></select></div><div class="form-group"><label for="itemCondition">Condition</label><select id="itemCondition" name="item_condition"><option>Good</option><option>New</option><option>Like new</option><option>Used</option></select></div></div>
    <div class="form-grid"><div class="form-group"><label for="exchangeType">Sharing type</label><select id="exchangeType" name="exchange_type"><option>Free donation</option><option>Exchange</option></select></div><div class="form-group"><label for="itemLocation">General location *</label><input id="itemLocation" name="location" required maxlength="100" placeholder="e.g. College area"></div></div>
    <div class="form-group"><label for="itemImage">Image URL (optional)</label><input id="itemImage" name="image_url" type="url" placeholder="https://…"><small style="font-size:10px;color:#7b877d">Use a public image link beginning with https://. Never upload private information.</small></div>
    <button class="btn btn-green form-submit" type="submit">Publish item ↗</button></form><div class="modal-note">Safety tip: don't add your home address or phone number to a public listing.</div>`);
  $('#postForm').addEventListener('submit', async e => {
    e.preventDefault(); const button = e.currentTarget.querySelector('button[type="submit"]'); button.disabled = true; button.textContent = 'Publishing…';
    const body = Object.fromEntries(new FormData(e.currentTarget).entries());
    try { await api('/api/listings', { method: 'POST', body: JSON.stringify(body) }); closeModal(); await loadListings(); toast('Your item is now listed! 🌱'); }
    catch (err) { toast(err.message); button.disabled = false; button.textContent = 'Publish item ↗'; }
  });
}

function itemCard(item) {
  const image = item.image_url && /^https:\/\//i.test(item.image_url) ? `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" loading="lazy" onerror="this.remove()">` : '';
  return `<article class="item-card"><div class="item-visual ${categoryBg[item.category] || 'bg-other'}">${image}<span class="visual-emoji">${categoryEmoji[item.category] || '📦'}</span><span class="type-tag">${item.exchange_type === 'Exchange' ? '↔ EXCHANGE' : '♡ FREE'}</span><span class="condition-tag">${escapeHtml(item.item_condition)}</span></div><div class="item-body"><div class="item-meta"><span>${escapeHtml(item.category.toUpperCase())}</span><span>✳ Community find</span></div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p><div class="item-location">⌖ ${escapeHtml(item.location)}</div><div class="item-footer"><div class="owner"><span class="owner-avatar">${escapeHtml((item.owner_name || 'U').charAt(0).toUpperCase())}</span>${escapeHtml(item.owner_name || 'Community member')}</div><button class="btn btn-dark request-btn" data-id="${item.id}" data-title="${escapeHtml(item.title)}" data-owner="${escapeHtml(item.owner_name || 'owner')}">Request ↗</button></div></div></article>`;
}
async function loadListings() {
  const grid = $('#listingGrid'); grid.innerHTML = '<div class="loading-card">Finding good things…</div>';
  try {
    const params = new URLSearchParams(); if (state.query) params.set('q', state.query); if (state.category !== 'All') params.set('category', state.category);
    const data = await api('/api/listings?' + params.toString()); state.listings = data.listings;
    grid.innerHTML = state.listings.map(itemCard).join(''); $('#emptyState').classList.toggle('hidden', state.listings.length > 0); grid.classList.toggle('hidden', state.listings.length === 0);
    $('#itemCount').textContent = state.listings.length; $('#memberCount').textContent = state.user ? '1+' : '0';
    grid.querySelectorAll('.request-btn').forEach(btn => btn.addEventListener('click', () => requestItem(btn.dataset.id, btn.dataset.title, btn.dataset.owner)));
  } catch (err) { grid.innerHTML = `<div class="loading-card">${escapeHtml(err.message)}. Please refresh the page.</div>`; }
}
function requestItem(id, title, owner) {
  if (!state.user) { authModal('login'); toast('Log in to request an item.'); return; }
  openModal(`<div class="eyebrow">MAKE A CONNECTION</div><h2 id="modalTitle">Request this item.</h2><p class="modal-sub">You're requesting <strong>${escapeHtml(title)}</strong> from ${escapeHtml(owner)}. Be friendly and explain why you'd like it.</p><form id="requestForm"><div class="form-group"><label for="requestMessage">Message to the owner</label><textarea id="requestMessage" name="message" required minlength="5" maxlength="400" placeholder="Hi! I'd love to give this item a new home because…"></textarea></div><button class="btn btn-green form-submit" type="submit">Send request →</button></form><div class="modal-note">For your safety, arrange exchanges in a public place. Don't share passwords or sensitive personal information.</div>`);
  $('#requestForm').addEventListener('submit', async e => { e.preventDefault(); const button = e.currentTarget.querySelector('button'); button.disabled = true; try { const message = new FormData(e.currentTarget).get('message'); const data = await api(`/api/listings/${id}/request`, { method: 'POST', body: JSON.stringify({ message }) }); closeModal(); toast(data.message); } catch (err) { toast(err.message); button.disabled = false; } });
}

async function showDashboard() {
  if (!state.user) return authModal('login');
  openModal('<div class="eyebrow">YOUR REUSEHUB</div><div class="dashboard-head"><h2 id="modalTitle">Your dashboard.</h2><button class="btn btn-green" id="dashboardPost">＋ Post item</button></div><p class="modal-sub">Manage your listings and see requests from the community.</p><div id="dashboardContent">Loading your activity…</div>');
  $('#dashboardPost').addEventListener('click', postModal);
  try {
    const [mine, requests] = await Promise.all([api('/api/my-listings'), api('/api/requests/received')]);
    const listingsHtml = mine.listings.length ? mine.listings.map(item => `<div class="request-row"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.category)} · ${escapeHtml(item.exchange_type)} · <span class="status-label">${escapeHtml(item.status)}</span></p><div class="request-actions"><button class="btn btn-outline remove-listing" data-id="${item.id}">Remove listing</button></div></div>`).join('') : '<p class="modal-sub">You have not posted any items yet.</p>';
    const requestsHtml = requests.requests.length ? requests.requests.map(r => `<div class="request-row"><strong>${escapeHtml(r.item_title)} — ${escapeHtml(r.requester_name)}</strong><p>${escapeHtml(r.message)}<br><span class="status-label">${escapeHtml(r.status)}</span>${r.status === 'Pending' ? `<br><small>${escapeHtml(r.requester_email)}</small></p><div class="request-actions"><button class="btn btn-green accept-request" data-id="${r.id}">Accept</button><button class="btn btn-outline decline-request" data-id="${r.id}">Decline</button></div>` : '</p>'}</div>`).join('') : '<p class="modal-sub">No requests received yet. When someone requests your item, it will appear here.</p>';
    $('#dashboardContent').innerHTML = `<h3 style="font-family:Manrope;font-size:15px;margin-top:24px">Your listings (${mine.listings.length})</h3>${listingsHtml}<h3 style="font-family:Manrope;font-size:15px;margin-top:28px">Requests received (${requests.requests.length})</h3>${requestsHtml}`;
    document.querySelectorAll('.remove-listing').forEach(btn => btn.addEventListener('click', async () => { if (!confirm('Remove this listing?')) return; try { await api(`/api/listings/${btn.dataset.id}`, { method: 'DELETE' }); toast('Listing removed.'); showDashboard(); loadListings(); } catch (e) { toast(e.message); } }));
    document.querySelectorAll('.accept-request,.decline-request').forEach(btn => btn.addEventListener('click', async () => { const status = btn.classList.contains('accept-request') ? 'Accepted' : 'Declined'; try { await api(`/api/requests/${btn.dataset.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); toast(`Request ${status.toLowerCase()}.`); showDashboard(); loadListings(); } catch (e) { toast(e.message); } }));
  } catch (err) { $('#dashboardContent').textContent = err.message; }
}

$('#loginBtn').addEventListener('click', () => authModal('login'));
$('#signupBtn').addEventListener('click', () => authModal('register'));
['heroGiveBtn','postTopBtn','ctaPostBtn','emptyPostBtn'].forEach(id => $('#' + id).addEventListener('click', postModal));
$('#exploreBtn').addEventListener('click', () => $('#explore').scrollIntoView({ behavior: 'smooth' }));
$('#searchInput').addEventListener('input', e => { state.query = e.target.value.trim(); clearTimeout(loadListings.timer); loadListings.timer = setTimeout(loadListings, 250); });
$('#categoryFilter').addEventListener('change', e => { state.category = e.target.value; updatePills(); loadListings(); });
function updatePills() { document.querySelectorAll('.pill').forEach(p => p.classList.toggle('active', p.dataset.category === state.category)); }
$('#categoryPills').addEventListener('click', e => { const pill = e.target.closest('.pill'); if (!pill) return; state.category = pill.dataset.category; $('#categoryFilter').value = state.category; updatePills(); loadListings(); });

(async function init() { try { const data = await api('/api/me'); state.user = data.user; } catch (_) { state.user = null; } renderNav(); await loadListings(); })();
