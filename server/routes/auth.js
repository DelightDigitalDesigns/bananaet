const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/init');

// Register a new user with invite code
router.post('/register', (req, res) => {
  const { username, password, inviteCode } = req.body;

  if (!username || !password || !inviteCode) {
    return res.status(400).json({ error: 'Username, password, and invite code required' });
  }

  if (password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  const trimmedName = username.trim();
  if (trimmedName.length < 2 || trimmedName.length > 20) {
    return res.status(400).json({ error: 'Username must be 2-20 characters' });
  }

  if (!/^[a-zA-Z0-9_]+$/.test(trimmedName)) {
    return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
  }

  const db = getDb();
  try {
    // Check invite code
    const code = db.prepare(
      'SELECT * FROM invite_codes WHERE code = ? AND used = 0'
    ).get(inviteCode.trim());

    if (!code) {
      return res.status(400).json({ error: 'Invalid or already used invite code' });
    }

    // Check username taken
    const existing = db.prepare(
      'SELECT id FROM users WHERE username = ?'
    ).get(trimmedName);

    if (existing) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    // Determine if this is the first user (owner)
    const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    const isOwner = userCount === 0 ? 1 : 0;

    // Hash password
    const passwordHash = bcrypt.hashSync(password, 10);

    // Create user
    const result = db.prepare(
      `INSERT INTO users (username, password_hash, invite_code, is_owner, last_login, last_daily_claim)
       VALUES (?, ?, ?, ?, datetime('now'), date('now'))`
    ).run(trimmedName, passwordHash, inviteCode.trim(), isOwner);

    // Mark invite code as used
    db.prepare(
      'UPDATE invite_codes SET used = 1, used_by = ? WHERE id = ?'
    ).run(result.lastInsertRowid, code.id);

    // Set session
    req.session.userId = result.lastInsertRowid;
    req.session.username = trimmedName;
    req.session.isOwner = isOwner === 1;

    res.json({
      success: true,
      user: {
        id: result.lastInsertRowid,
        username: trimmedName,
        bananas: 1500,
        isOwner: isOwner === 1
      }
    });
  } finally {
    db.close();
  }
});

// Login with existing username + password
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const db = getDb();
  try {
    const user = db.prepare(
      'SELECT * FROM users WHERE username = ? AND is_superadmin = 0'
    ).get(username.trim());

    if (!user) {
      return res.status(400).json({ error: 'User not found. Need an invite code to register.' });
    }

    if (!bcrypt.compareSync(password, user.password_hash)) {
      return res.status(400).json({ error: 'Wrong password' });
    }

    if (user.banned) {
      return res.status(403).json({ error: 'This account has been banned' });
    }

    // Check daily bonus
    const today = new Date().toISOString().split('T')[0];
    let dailyBonus = 0;

    if (user.last_daily_claim !== today) {
      dailyBonus = 4000;
      db.prepare(
        `UPDATE users SET bananas = bananas + ?, last_daily_claim = ?, last_login = datetime('now') WHERE id = ?`
      ).run(dailyBonus, today, user.id);
    } else {
      db.prepare(
        `UPDATE users SET last_login = datetime('now') WHERE id = ?`
      ).run(user.id);
    }

    // Set session
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.isOwner = user.is_owner === 1;

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        bananas: user.bananas + dailyBonus,
        isOwner: user.is_owner === 1
      },
      dailyBonus
    });
  } finally {
    db.close();
  }
});

// Get current user info
router.get('/me', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  const db = getDb();
  try {
    const user = db.prepare(
      'SELECT id, username, bananas, is_owner, last_daily_claim, created_at FROM users WHERE id = ?'
    ).get(req.session.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      username: user.username,
      bananas: user.bananas,
      isOwner: user.is_owner === 1,
      lastDailyClaim: user.last_daily_claim,
      createdAt: user.created_at
    });
  } finally {
    db.close();
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

module.exports = router;
