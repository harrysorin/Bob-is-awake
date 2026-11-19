const $ = id => document.getElementById(id);
const get = p => fetch(p).then(r => r.json());
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// speed buttons
for (const b of document.querySelectorAll('#speed button')) {
  b.onclick = () => fetch('/api/admin/speed', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ speed: +b.dataset.spd }) });
}
function setActiveSpeed(speed) {
  for (const b of document.querySelectorAll('#speed button')) b.classList.toggle('on', +b.dataset.spd === speed);
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

async function loadDiary() {
  const d = await get('/api/diary');
  $('diary').innerHTML = d.length
    ? d.map(e => `<div class="entry"><div class="day-label">${esc(e.day)}</div><div class="body">${esc(e.text)}</div></div>`).join('')
    : '<p class="note">No diary yet. It writes one at the end of each day.</p>';
}
async function loadLog() {
  const ev = await get('/api/events');
  $('log').innerHTML = ev.length
    ? ev.map(e => `<div class="log-line"><span>${e.hm}</span>${esc(e.text)}</div>`).join('')
    : '<p class="note">Nothing yet.</p>';
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
