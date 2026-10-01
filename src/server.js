const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'feedback.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

app.use(express.json());

app.get('/healthz', (_req, res) => res.status(200).send('ok'));

app.get('/api/info', (_req, res) => {
  res.json({
    service: 'feedback-api',
    version: process.env.APP_VERSION || '1.0.0',
    env: process.env.APP_ENV || 'dev',
  });
});

app.get('/api/feedback', (_req, res) => {
  const rows = db.prepare('SELECT * FROM feedback ORDER BY id DESC LIMIT 50').all();
  res.json(rows);
});

app.post('/api/feedback', (req, res) => {
  const { name, rating, comment } = req.body || {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name is required' });
  }
  const r = Number(rating);
  if (!Number.isInteger(r) || r < 1 || r > 5) {
    return res.status(400).json({ error: 'rating must be an integer 1-5' });
  }
  const stmt = db.prepare('INSERT INTO feedback (name, rating, comment) VALUES (?, ?, ?)');
  const info = stmt.run(name.trim(), r, comment ? String(comment).trim() : null);
  const row = db.prepare('SELECT * FROM feedback WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`feedback-api listening on :${PORT}, db=${DB_PATH}`);
});
