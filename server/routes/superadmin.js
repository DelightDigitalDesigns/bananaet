const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/init');
const { requireSuperadmin } = require('../middleware/auth');
const { isChatKilled, setChatKillSwitch } = require('./chat');

// Superadmin login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const db = getDb();
  try {
    const user = db.prepare(
      'SELECT * FROM users WHERE username = ? AND is_superadmin = 1'
    ).get(username.trim());

    if (!user) {
      return res.status(400).json({ error: 'Access denied' });
    }

    if (!bcrypt.compareSync(password, user.password_hash)) {
      return res.status(400).json({ error: 'Access denied' });
    }

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.isOwner = false;
    req.session.isSuperadmin = true;

    res.json({ success: true, username: user.username });
  } finally {
    db.close();
  }
});

// Superadmin registration (only works if no superadmin exists yet)
router.post('/register', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const db = getDb();
  try {
    // Check if a superadmin already exists
    const existing = db.prepare('SELECT id FROM users WHERE is_superadmin = 1').get();
    if (existing) {
      return res.status(400).json({ error: 'Superadmin account already exists' });
    }

    // Check username not taken
    const taken = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
    if (taken) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const result = db.prepare(
      `INSERT INTO users (username, password_hash, invite_code, is_superadmin, bananas, last_login)
       VALUES (?, ?, 'superadmin', 1, 0, datetime('now'))`
    ).run(username.trim(), passwordHash);

    req.session.userId = result.lastInsertRowid;
    req.session.username = username.trim();
    req.session.isOwner = false;
    req.session.isSuperadmin = true;

    db.close();
    res.json({ success: true, username: username.trim() });
  } catch (e) {
    db.close();
    res.status(500).json({ error: e.message });
  }
});

// Check if superadmin exists (to show register vs login form)
router.get('/exists', (req, res) => {
  const db = getDb();
  try {
    const existing = db.prepare('SELECT id FROM users WHERE is_superadmin = 1').get();
    res.json({ exists: !!existing });
  } finally {
    db.close();
  }
});

// Check current session
router.get('/me', requireSuperadmin, (req, res) => {
  res.json({ username: req.session.username });
});

// Get chat logs (paginated)
router.get('/chat-logs', requireSuperadmin, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;
  const offset = (page - 1) * limit;
  const room = req.query.room || null;

  const db = getDb();
  try {
    let countSql = 'SELECT COUNT(*) as total FROM chat_messages';
    let logsSql = 'SELECT * FROM chat_messages';
    const params = [];

    if (room) {
      countSql += ' WHERE room = ?';
      logsSql += ' WHERE room = ?';
      params.push(room);
    }

    const total = db.prepare(countSql).get(...params).total;

    logsSql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const logs = db.prepare(logsSql).all(...params, limit, offset);

    res.json({
      logs: logs.reverse(),
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } finally {
    db.close();
  }
});

// Chat kill switch — get status
router.get('/chat-status', requireSuperadmin, (req, res) => {
  res.json({ killed: isChatKilled() });
});

// Chat kill switch — toggle
router.post('/chat-toggle', requireSuperadmin, (req, res) => {
  const { killed } = req.body;
  setChatKillSwitch(!!killed);
  res.json({ success: true, killed: isChatKilled() });
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

module.exports = router;
