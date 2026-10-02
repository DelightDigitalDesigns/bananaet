const express = require('express');
const router = express.Router();
const { getDb } = require('../db/init');
const { requireAuth, requireOwner } = require('../middleware/auth');

// Give bananas to a user (owner only)
router.post('/bananas', requireAuth, requireOwner, (req, res) => {
  const { userId, amount } = req.body;
  const targetId = userId || req.session.userId; // default to self

  const db = getDb();
  try {
    db.prepare('UPDATE users SET bananas = ? WHERE id = ?').run(amount, targetId);
    const user = db.prepare('SELECT id, username, bananas FROM users WHERE id = ?').get(targetId);
    db.close();
    res.json({ success: true, user });
  } catch (e) {
    db.close();
    res.status(500).json({ error: e.message });
  }
});

// Generate invite codes (owner only)
router.post('/invite-codes', requireAuth, requireOwner, (req, res) => {
  const { codes } = req.body;
  if (!codes || !Array.isArray(codes)) {
    return res.status(400).json({ error: 'Provide an array of codes' });
  }

  const db = getDb();
  try {
    const insert = db.prepare('INSERT INTO invite_codes (code, created_by) VALUES (?, ?)');
    const created = [];
    for (const code of codes) {
      try {
        insert.run(code.trim(), req.session.userId);
        created.push(code.trim());
      } catch (e) {
        // duplicate code, skip
      }
    }
    db.close();
    res.json({ success: true, created });
  } catch (e) {
    db.close();
    res.status(500).json({ error: e.message });
  }
});

// List all users (owner only)
router.get('/users', requireAuth, requireOwner, (req, res) => {
  const db = getDb();
  try {
    const users = db.prepare(
      'SELECT id, username, bananas, is_owner, banned, muted, created_at, last_login FROM users'
    ).all();
    res.json(users);
  } finally {
    db.close();
  }
});

// Ban/unban a user (owner only)
router.post('/ban', requireAuth, requireOwner, (req, res) => {
  const { userId, banned } = req.body;
  const db = getDb();
  try {
    db.prepare('UPDATE users SET banned = ? WHERE id = ?').run(banned ? 1 : 0, userId);
    db.close();
    res.json({ success: true });
  } catch (e) {
    db.close();
    res.status(500).json({ error: e.message });
  }
});

// Mute/unmute a user (owner only)
router.post('/mute', requireAuth, requireOwner, (req, res) => {
  const { userId, muted } = req.body;
  const db = getDb();
  try {
    db.prepare('UPDATE users SET muted = ? WHERE id = ?').run(muted ? 1 : 0, userId);
    db.close();
    res.json({ success: true });
  } catch (e) {
    db.close();
    res.status(500).json({ error: e.message });
  }
});

// Create a badge (owner only)
router.post('/badges', requireAuth, requireOwner, (req, res) => {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Badge name required' });

  const db = getDb();
  try {
    const result = db.prepare(
      'INSERT INTO badges (name, color, created_by) VALUES (?, ?, ?)'
    ).run(name.trim(), color || '#FFD700', req.session.userId);
    db.close();
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    db.close();
    res.status(500).json({ error: e.message });
  }
});

// List all badges
router.get('/badges', requireAuth, requireOwner, (req, res) => {
  const db = getDb();
  try {
    const badges = db.prepare('SELECT * FROM badges ORDER BY created_at DESC').all();
    res.json(badges);
  } finally {
    db.close();
  }
});

// Assign a badge to a user (owner only)
router.post('/badges/assign', requireAuth, requireOwner, (req, res) => {
  const { userId, badgeId } = req.body;
  if (!userId || !badgeId) return res.status(400).json({ error: 'userId and badgeId required' });

  const db = getDb();
  try {
    db.prepare(
      'INSERT OR IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)'
    ).run(userId, badgeId);
    db.close();
    res.json({ success: true });
  } catch (e) {
    db.close();
    res.status(500).json({ error: e.message });
  }
});

// Remove a badge from a user (owner only)
router.post('/badges/remove', requireAuth, requireOwner, (req, res) => {
  const { userId, badgeId } = req.body;
  const db = getDb();
  try {
    db.prepare('DELETE FROM user_badges WHERE user_id = ? AND badge_id = ?').run(userId, badgeId);
    db.close();
    res.json({ success: true });
  } catch (e) {
    db.close();
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
