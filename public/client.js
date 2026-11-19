const $ = id => document.getElementById(id);
const get = p => fetch(p).then(r => r.json());

// --- admin token: speed controls only work with the token the server printed (or ADMIN_TOKEN) ---
const store = {
  get: () => { try { return localStorage.getItem('adminToken') || ''; } catch { return ''; } },
  set: v => { try { v ? localStorage.setItem('adminToken', v) : localStorage.removeItem('adminToken'); } catch {} },
};
let adminToken = store.get();
let lastAdminError = '';
const admin = async (path, body) => {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
    body: JSON.stringify(body || {}),
  });
  lastAdminError = r.ok ? '' : (await r.clone().json().catch(() => ({}))).error || '';
  return r;
};
function showAdmin(on, msg = '') {
  $('speed').hidden = !on;
  $('admin-login').hidden = on;
  $('admin-msg').textContent = msg;
}
async function unlock(token) {
  adminToken = token;
  const ok = token && (await admin('/api/admin/check').then(r => r.ok, () => false));
  if (ok) store.set(token); else { adminToken = ''; store.set(''); }
  showAdmin(ok, ok || !token ? '' : lastAdminError || 'wrong token');
}
$('admin-login').onsubmit = e => { e.preventDefault(); unlock($('admin-token').value.trim()); $('admin-token').value = ''; };
$('lock').onclick = () => { adminToken = ''; store.set(''); showAdmin(false); };
unlock(adminToken);

// speed buttons
for (const b of document.querySelectorAll('#speed button[data-spd]')) {
  b.onclick = async () => {
    const r = await admin('/api/admin/speed', { speed: +b.dataset.spd });
    if (r.status === 401) return relock();
    if (r.ok) setActiveSpeed((await r.json()).speed);
  };
}
$('think-now').onclick = async () => {
  const r = await admin('/api/admin/think');
  if (r.status === 401) relock();
};
function relock() { adminToken = ''; store.set(''); showAdmin(false, 'token expired, unlock again'); }
function setActiveSpeed(speed) {
  for (const b of document.querySelectorAll('#speed button[data-spd]')) b.classList.toggle('on', +b.dataset.spd === speed);
}

// thought display — fade out old, fade in new
let currentThought = '';
function setThought(text) {
  if (text === currentThought) return;
  currentThought = text;
  const el = $('cursor');
  el.classList.add('fading');
  setTimeout(() => {
    el.textContent = text || '…';
    el.classList.remove('fading');
  }, 600);
}

function render(s) {
  $('clock').textContent = `Day ${s.clock.day} · ${s.clock.hm}`;
  setActiveSpeed(s.speed);
  setThought(s.thought);
  const statusEl = $('status-line');
  if (!s.thought) statusEl.textContent = 'awakening';
  else statusEl.textContent = `Day ${s.clock.day} · ${s.clock.hm}`;
}

// build DOM with textContent only: model text is never parsed as HTML
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const note = text => el('p', 'note', text);

async function loadDiary() {
  const d = await get('/api/diary');
  $('diary').replaceChildren(...(d.length
    ? d.map(e => { const n = el('div', 'entry'); n.append(el('div', 'day-label', e.day), el('div', 'body', e.text)); return n; })
    : [note('No diary yet. It writes one at the end of each day.')]));
}
async function loadLog() {
  const ev = await get('/api/events');
  $('log').replaceChildren(...(ev.length
    ? ev.map(e => { const n = el('div', 'log-line'); n.append(el('span', null, e.hm), String(e.text ?? '')); return n; })
    : [note('Nothing yet.')]));
}

for (const b of document.querySelectorAll('.tabs button')) b.onclick = () => {
  for (const x of document.querySelectorAll('.tabs button')) x.classList.toggle('on', x === b);
  $('diary').hidden = b.dataset.tab !== 'diary';
  $('log').hidden   = b.dataset.tab !== 'log';
  if (b.dataset.tab === 'diary') loadDiary();
  else loadLog();
};

const es = new EventSource('/api/stream');
es.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.type === 'state') render(m);
  else if (m.type === 'event' && !$('log').hidden) loadLog();
  else if (m.type === 'diary' && !$('diary').hidden) loadDiary();
};

loadDiary();
