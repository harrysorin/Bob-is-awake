import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { think } from './brain.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = +process.env.PORT || 3001;
// Listen only on this computer unless HOST is set (e.g. HOST=0.0.0.0 to expose on the network).
const HOST = process.env.HOST || '127.0.0.1';

// --- admin auth: only someone with ADMIN_TOKEN may change speed or force a thought ---
// If ADMIN_TOKEN is not set, a random one is generated at startup and printed to the console,
// so only the person running the server can see it.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || randomBytes(24).toString('base64url');
const sha = s => createHash('sha256').update(String(s)).digest();
const ADMIN_HASH = sha(ADMIN_TOKEN);
function isAdmin(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  return !!m && timingSafeEqual(sha(m[1]), ADMIN_HASH);
}

// --- dynamic game clock ---
let SPEED = 1;
let _realBase = Date.now(), _gameBase = Date.now();
const gameNow = () => _gameBase + (Date.now() - _realBase) * SPEED;
function setSpeed(s) { _gameBase = gameNow(); _realBase = Date.now(); SPEED = s; console.log(`[speed] x${s}`); }

// --- DB ---
mkdirSync(join(ROOT, 'data'), { recursive: true });
const db = new DatabaseSync(join(ROOT, 'data', 'world.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
  CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, day TEXT, hm TEXT, kind TEXT, text TEXT);
  CREATE TABLE IF NOT EXISTS diary (id INTEGER PRIMARY KEY, day TEXT, text TEXT);
  -- one diary entry per day; needed by the upsert in writeDiary (also fixes older databases)
  DELETE FROM diary WHERE id NOT IN (SELECT MAX(id) FROM diary GROUP BY day);
  CREATE UNIQUE INDEX IF NOT EXISTS diary_day ON diary(day);
`);
const kvGet = k => { const r = db.prepare('SELECT v FROM kv WHERE k=?').get(k); return r ? JSON.parse(r.v) : null; };
const kvSet = (k, v) => db.prepare('INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k, JSON.stringify(v));

// resume the game clock where it stopped, so a restart after running fast doesn't move time backward
_gameBase = Math.max(_gameBase, kvGet('gameTime') || 0);

// --- epoch: when this consciousness first awoke ---
const EPOCH = (() => { const e = kvGet('epoch'); if (e) return e; const n = Date.now(); kvSet('epoch', n); return n; })();

function clock(ms) {
  const elapsed = Math.max(0, ms - EPOCH);
  const totalMin = Math.floor(elapsed / 60_000);
  const day = Math.floor(totalMin / 1440) + 1;
  const minOfDay = totalMin % 1440;
  const h = Math.floor(minOfDay / 60), m = minOfDay % 60;
  return { day, h, m, hm: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`, totalMin };
}
const dayKey = ms => `Day ${clock(ms).day}`;

function logEvent(kind, text) {
  const c = clock(gameNow());
  db.prepare('INSERT INTO events(day,hm,kind,text) VALUES(?,?,?,?)').run(dayKey(gameNow()), c.hm, kind, text);
  broadcast({ type: 'event', kind, text, hm: c.hm });
}

// --- state ---
let S = kvGet('state') || { thought: '' };
let thinking = false, diaryWriting = false;
let lastThoughtTime = 0, lastThoughtText = '';
// lastDiaryDay = N means diaries up to Day N-1 are done (or had nothing to write)
let lastDiaryDay = kvGet('lastDiaryDay') || 0;
let lastDiaryAttempt = 0;

// --- tick ---
let last = gameNow(), lastReal = Date.now();
const THINK_INTERVAL = 60_000; // every game-minute

function tick() {
  lastReal = Date.now();
  const now = gameNow();
  last = now;
  const c = clock(now);
  // while paused, keep viewers up to date but don't think or write
  if (SPEED === 0) return broadcast({ type: 'state', thought: S.thought, clock: c, speed: SPEED });

  // periodic thought
  if (!thinking && now - lastThoughtTime > THINK_INTERVAL) {
    lastThoughtTime = now;
    doThink(c);
  }

  // diary for every finished day that doesn't have one yet (catches up after downtime, retries failures)
  const nextDiary = Math.max(1, lastDiaryDay);
  if (!diaryWriting && nextDiary < c.day && Date.now() - lastDiaryAttempt > 60_000) {
    lastDiaryAttempt = Date.now();
    writeDiary(nextDiary);
  }

  broadcast({ type: 'state', thought: S.thought, clock: c, speed: SPEED });
}

async function doThink(c) {
  thinking = true;
  try {
    const events = db.prepare('SELECT hm, text FROM events WHERE day=? ORDER BY id DESC LIMIT 10').all(dayKey(gameNow())).reverse();
    const r = await think('think', { clock: c, thought: S.thought, events, lastThought: lastThoughtText !== S.thought ? S.thought : '' });
    lastThoughtText = S.thought;
    S.thought = r.thought;
    kvSet('state', S);
    logEvent('thought', r.thought);
  } catch (e) { console.warn('[brain] think failed:', e.message); }
  thinking = false;
}

const DIARY_MAX_EVENTS = 60; // a day has ~1440 thoughts; keep the prompt inside the model's context

async function writeDiary(n) {
  diaryWriting = true;
  const day = `Day ${n}`;
  try {
    let events = db.prepare('SELECT hm, text FROM events WHERE day=? ORDER BY id').all(day);
    if (events.length > DIARY_MAX_EVENTS) {
      const step = events.length / DIARY_MAX_EVENTS;
      events = Array.from({ length: DIARY_MAX_EVENTS }, (_, i) => events[Math.floor(i * step)]);
    }
    if (events.length) {
      const r = await think('diary', { day, events });
      db.prepare('INSERT INTO diary(day,text) VALUES(?,?) ON CONFLICT(day) DO UPDATE SET text=excluded.text').run(day, r.entry);
      broadcast({ type: 'diary' });
    }
    lastDiaryDay = n + 1;
    kvSet('lastDiaryDay', lastDiaryDay);
    lastDiaryAttempt = 0;
  } catch (e) { console.warn('[brain] diary failed, will retry:', e.message); }
  diaryWriting = false;
}

// --- SSE ---
const clients = new Set();
function broadcast(obj) { const d = `data: ${JSON.stringify(obj)}\n\n`; for (const r of clients) r.write(d); }

// --- HTTP ---
const MIME = { html: 'text/html', js: 'application/javascript', css: 'text/css', png: 'image/png', ttf: 'font/ttf', json: 'application/json' };
function json(res, status, obj) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); }

createServer(async (req, res) => {
  const p = new URL(req.url, 'http://x').pathname;

  if (p === '/api/stream') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    clients.add(res); req.on('close', () => clients.delete(res)); return;
  }
  if (p === '/api/events') return json(res, 200, db.prepare('SELECT hm, kind, text FROM events ORDER BY id DESC LIMIT 100').all());
  if (p === '/api/diary')  return json(res, 200, db.prepare('SELECT day, text FROM diary ORDER BY id DESC').all());

  if (p.startsWith('/api/admin/')) {
    if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });
    if (!isAdmin(req)) return json(res, 401, { error: 'unauthorized' });
  }
  if (p === '/api/admin/check') return json(res, 200, { ok: true });
  if (p === '/api/admin/speed') {
    let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 1024) return json(res, 413, { error: 'too large' }); }
    let s; try { s = +JSON.parse(body || '{}').speed; } catch { return json(res, 400, { error: 'bad json' }); }
    if (![0, 1, 2, 10, 100].includes(s)) return json(res, 400, { error: 'invalid speed' });
    setSpeed(s); return json(res, 200, { ok: true, speed: SPEED });
  }
  if (p === '/api/admin/think') {
    lastThoughtTime = gameNow(); // restart the regular interval from now
    const started = !thinking;
    if (started) doThink(clock(gameNow())); // think right away, even while paused
    return json(res, 200, { ok: true, started });
  }

  try {
    const fp = join(ROOT, 'public', (p === '/' ? '/index.html' : p).replace(/\.\./g, ''));
    res.writeHead(200, { 'content-type': MIME[fp.split('.').pop()] || 'application/octet-stream' });
    res.end(readFileSync(fp));
  } catch { res.writeHead(404); res.end(); }
}).listen(PORT, HOST, () => {
  console.log(`A New World: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}  (speed x${SPEED})`);
  if (!process.env.ADMIN_TOKEN) console.log(`[admin] no ADMIN_TOKEN set; this run's token is: ${ADMIN_TOKEN}`);
});

setInterval(tick, 250);
(function save() {
  try { kvSet('state', S); kvSet('gameTime', gameNow()); }
  catch (e) { console.warn('[db] save failed:', e.message); }
  setTimeout(save, 10_000);
})();
