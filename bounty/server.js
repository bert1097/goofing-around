#!/usr/bin/env node
/* Bounty server. No dependencies: `node server.js` and open the printed URL.
 *
 *   PORT=3000            port to listen on
 *   DATA_FILE=...        where the data lives (default ./data/bounty.json)
 *   ADMIN_EMAILS=a@b.co  comma-separated emails that become admins on signup
 *   --demo               load sample data and show one-tap demo logins
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const core = require('./public/core.js');

const PORT = Number(process.env.PORT) || 3000;
const DEMO = process.argv.includes('--demo') || process.env.DEMO === '1';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', DEMO ? 'demo.json' : 'bounty.json');
const PUBLIC = path.join(__dirname, 'public');
const SESSION_DAYS = 30;

// ---------- storage: one JSON file, written atomically ----------

let db = core.emptyDb();
if (fs.existsSync(DATA_FILE)) db = Object.assign(db, JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
db.sessions = db.sessions || {};

function save() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DATA_FILE);
}

// ---------- passwords and sessions ----------

const scrypt = (password, salt) =>
  new Promise((resolve, reject) => crypto.scrypt(password, salt, 32, (err, key) => (err ? reject(err) : resolve(key))));

async function hash(password) {
  const salt = crypto.randomBytes(16);
  return 'scrypt:' + salt.toString('hex') + ':' + (await scrypt(password, salt)).toString('hex');
}
async function verify(password, stored) {
  const [kind, salt, key] = String(stored).split(':');
  if (kind !== 'scrypt' || !salt || !key) return false;
  const want = Buffer.from(key, 'hex');
  const got = await scrypt(password, Buffer.from(salt, 'hex'));
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

const app = core.createCore({
  db,
  hash,
  verify,
  adminEmails: (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean),
});

function sessionUser(req) {
  const m = /(?:^|;\s*)sid=([a-f0-9]{48})/.exec(req.headers.cookie || '');
  const s = m && db.sessions[m[1]];
  if (!s) return { token: m && m[1], userId: null };
  if (Date.now() - s.at > SESSION_DAYS * 864e5) {
    delete db.sessions[m[1]];
    return { token: null, userId: null };
  }
  return { token: m[1], userId: s.userId };
}

function cookie(req, token, maxAge) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

// Slow down password guessing: 10 failed logins per address per 15 minutes.
const failures = new Map();
function tooManyFailures(ip) {
  const f = failures.get(ip);
  return !!f && f.count >= 10 && Date.now() - f.since < 15 * 60e3;
}
function noteFailure(ip) {
  const f = failures.get(ip);
  if (!f || Date.now() - f.since > 15 * 60e3) failures.set(ip, { count: 1, since: Date.now() });
  else f.count++;
}

// ---------- http ----------

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

function send(res, status, body, headers) {
  const text = JSON.stringify(body);
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers));
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 100e3) {
        reject(Object.assign(new Error('too large'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (e) {
        reject(Object.assign(new Error('bad json'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

async function api(req, res, route) {
  if (route === '/config') return send(res, 200, { ok: true, demo: DEMO });
  const ip = req.socket.remoteAddress || '';
  const write = req.method !== 'GET';
  // Writes must be JSON, which a cross-site form cannot send.
  if (write && !/^application\/json/.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'Send JSON.' });
  if (route === '/login' && tooManyFailures(ip)) return send(res, 429, { error: 'Too many attempts. Try again in a few minutes.' });

  const body = write ? await readBody(req) : {};
  const session = sessionUser(req);
  const out = await app.handle({ method: req.method, path: route, body, userId: session.userId });
  const headers = {};
  if (route === '/login' && out.status === 401) noteFailure(ip);
  if (out.login) {
    const token = crypto.randomBytes(24).toString('hex');
    db.sessions[token] = { userId: out.login, at: Date.now() };
    headers['Set-Cookie'] = cookie(req, token, SESSION_DAYS * 86400);
  }
  if (out.logout) {
    if (session.token) delete db.sessions[session.token];
    headers['Set-Cookie'] = cookie(req, '', 0);
  }
  if (write && out.status < 400) save();
  send(res, out.status, out.body, headers);
}

const CSP = "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; frame-ancestors 'none'";

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep) || !TYPES[path.extname(file)]) return send(res, 404, { error: 'Not found.' });
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: 'Not found.' });
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': CSP });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname.startsWith('/api/')) {
    api(req, res, pathname.slice(4)).catch((e) => {
      if (!e.status) console.error(e);
      if (!res.headersSent) send(res, e.status || 500, { error: e.status ? 'That request could not be read.' : 'Something went wrong on our side.' });
    });
  } else if (req.method === 'GET') serveStatic(req, res, pathname);
  else send(res, 405, { error: 'Not allowed.' });
});

(async () => {
  if (DEMO && (await core.seed(db, hash))) save();
  server.listen(PORT, () => console.log(`Bounty is running at http://localhost:${PORT}${DEMO ? ' (demo data)' : ''}`));
})();
