import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createClient } from '@libsql/client';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import ejs from 'ejs';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── EJS renderer ────────────────────────────────────────────────────────────
const render = async (view, data = {}) => {
  const tpl = await readFile(join(__dirname, 'views', `${view}.ejs`), 'utf8');
  return ejs.render(tpl, data);
};

// ─── DB ──────────────────────────────────────────────────────────────────────
const getDB = () => createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const initDB = async (db) => {
  await db.execute('CREATE TABLE IF NOT EXISTS secrets (id TEXT PRIMARY KEY, encrypted_secret TEXT NOT NULL, iv TEXT NOT NULL, encryption_key TEXT NOT NULL, auth_tag TEXT NOT NULL, password_hash TEXT, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)');
};

// ─── App ─────────────────────────────────────────────────────────────────────
const app = new Hono();

app.get('/', async (c) => {
  return c.html(await render('index', { error: null }));
});

app.post('/secret', async (c) => {
  const { secret, expiration, password } = await c.req.parseBody();
  if (!secret?.trim()) {
    return c.html(await render('index', { error: 'Secret cannot be empty.' }), 400);
  }

  const id = uuidv4();
  const db = getDB();
  await initDB(db);

  const nodeCrypto = await import('node:crypto');
  const nodeKey = nodeCrypto.randomBytes(32);
  const nodeIv = nodeCrypto.randomBytes(12);
  const cipher = nodeCrypto.createCipheriv('aes-256-gcm', nodeKey, nodeIv);
  let encryptedHex = cipher.update(secret.trim(), 'utf8', 'hex');
  encryptedHex += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  const passwordHash = password?.trim() ? await bcrypt.hash(password.trim(), 10) : null;
  const EXPIRY_MAP = { '1h': 3600, '24h': 86400, '7d': 604800, '30d': 2592000 };
  const expiresAt = Math.floor(Date.now() / 1000) + (EXPIRY_MAP[expiration] || 86400);

  await db.execute({
    sql: 'INSERT INTO secrets VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    args: [id, encryptedHex, nodeIv.toString('hex'), nodeKey.toString('hex'), authTag, passwordHash, expiresAt, Math.floor(Date.now() / 1000)]
  });

  const url = new URL(c.req.url);
  const secretUrl = `${url.protocol}//${url.host}/secret/${id}`;
  const expiryLabel = { '1h': '1 hour', '24h': '24 hours', '7d': '7 days', '30d': '30 days' }[expiration] || '24 hours';
  return c.html(await render('success', { secretUrl, expiryLabel, hasPassword: !!passwordHash }));
});

app.get('/secret/:id', async (c) => {
  const id = c.req.param('id');
  const db = getDB();
  await initDB(db);
  const result = await db.execute({ sql: 'SELECT * FROM secrets WHERE id = ?', args: [id] });
  if (!result.rows.length) {
    return c.html(await render('view', { secret: null, needsPassword: false, id, error: 'Not found or already viewed.' }));
  }
  const row = result.rows[0];
  if (row.expires_at < Math.floor(Date.now() / 1000)) {
    await db.execute({ sql: 'DELETE FROM secrets WHERE id = ?', args: [id] });
    return c.html(await render('view', { secret: null, needsPassword: false, id, error: 'Expired.' }), 410);
  }
  if (row.password_hash) {
    return c.html(await render('view', { secret: null, needsPassword: true, id, error: null }));
  }

  const nodeCrypto = await import('node:crypto');
  const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', Buffer.from(row.encryption_key, 'hex'), Buffer.from(row.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(row.auth_tag, 'hex'));
  let decrypted = decipher.update(row.encrypted_secret, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  await db.execute({ sql: 'DELETE FROM secrets WHERE id = ?', args: [id] });
  return c.html(await render('view', { secret: decrypted, needsPassword: false, id, error: null }));
});

app.post('/secret/:id', async (c) => {
  const id = c.req.param('id');
  const { password } = await c.req.parseBody();
  const db = getDB();
  await initDB(db);
  const result = await db.execute({ sql: 'SELECT * FROM secrets WHERE id = ?', args: [id] });
  if (!result.rows.length) {
    return c.html(await render('view', { secret: null, needsPassword: false, id, error: 'Not found.' }));
  }
  const row = result.rows[0];
  const match = row.password_hash ? await bcrypt.compare(password || '', row.password_hash) : true;
  if (!match) {
    return c.html(await render('view', { secret: null, needsPassword: true, id, error: 'Incorrect password.' }), 401);
  }

  const nodeCrypto = await import('node:crypto');
  const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', Buffer.from(row.encryption_key, 'hex'), Buffer.from(row.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(row.auth_tag, 'hex'));
  let decrypted = decipher.update(row.encrypted_secret, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  await db.execute({ sql: 'DELETE FROM secrets WHERE id = ?', args: [id] });
  return c.html(await render('view', { secret: decrypted, needsPassword: false, id, error: null }));
});

// ─── Start ───────────────────────────────────────────────────────────────────
const port = parseInt(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port }, () => {
  console.log(`Server running at http://localhost:${port}`);
});
