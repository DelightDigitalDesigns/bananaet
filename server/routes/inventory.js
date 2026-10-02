const express = require('express');
const router = express.Router();
const { getDb } = require('../db/init');
const { requireAuth } = require('../middleware/auth');

// Get current user's inventory
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  try {
    const items = db.prepare(`
      SELECT c.id, c.name, c.rarity, c.image_path, c.season_id,
             i.count, i.obtained_at, s.name as season_name
      FROM inventory i
      JOIN characters c ON i.character_id = c.id
      JOIN seasons s ON c.season_id = s.id
      WHERE i.user_id = ?
      ORDER BY
        CASE c.rarity
          WHEN 'astronomical' THEN 9
          WHEN 'bananarang' THEN 8
          WHEN 'mystical' THEN 7
          WHEN 'chroma_rainbow' THEN 6
          WHEN 'chroma_shiny' THEN 5
          WHEN 'legendary' THEN 4
          WHEN 'epic' THEN 3
          WHEN 'rare' THEN 2
          WHEN 'common' THEN 1
        END DESC, c.name ASC
    `).all(req.session.userId);

    // Summary stats
    const totalUnique = items.length;
    const totalCount = items.reduce((sum, i) => sum + i.count, 0);
    const rarestOwned = items.length > 0 ? items[0] : null;

    res.json({
      items,
      stats: {
        totalUnique,
        totalCount,
        rarestOwned: rarestOwned ? { name: rarestOwned.name, rarity: rarestOwned.rarity } : null
      }
    });
  } finally {
    db.close();
  }
});

// Get any user's inventory (public profiles)
router.get('/user/:userId', requireAuth, (req, res) => {
  const db = getDb();
  try {
    const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(parseInt(req.params.userId));
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const items = db.prepare(`
      SELECT c.id, c.name, c.rarity, c.image_path, i.count, s.name as season_name
      FROM inventory i
      JOIN characters c ON i.character_id = c.id
      JOIN seasons s ON c.season_id = s.id
      WHERE i.user_id = ?
      ORDER BY
        CASE c.rarity
          WHEN 'astronomical' THEN 9
          WHEN 'bananarang' THEN 8
          WHEN 'mystical' THEN 7
          WHEN 'chroma_rainbow' THEN 6
          WHEN 'chroma_shiny' THEN 5
          WHEN 'legendary' THEN 4
          WHEN 'epic' THEN 3
          WHEN 'rare' THEN 2
          WHEN 'common' THEN 1
        END DESC, c.name ASC
    `).all(user.id);

    res.json({
      user: { id: user.id, username: user.username },
      items
    });
  } finally {
    db.close();
  }
});

module.exports = router;
