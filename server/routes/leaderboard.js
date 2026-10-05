const express = require('express');
const router = express.Router();
const { getDb } = require('../db/init');
const { requireAuth } = require('../middleware/auth');

// Rarity point values for collection score
const RARITY_POINTS = {
  common: 1,
  rare: 5,
  epic: 15,
  legendary: 50,
  chroma_shiny: 100,
  chroma_rainbow: 250,
  mystical: 500,
  bananarang: 2000,
  astronomical: 5000,
};

router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  try {
    const users = db.prepare('SELECT id, username, is_owner FROM users WHERE banned = 0 AND is_superadmin = 0').all();

    const leaderboard = users.map(user => {
      const items = db.prepare(`
        SELECT c.rarity, i.count
        FROM inventory i
        JOIN characters c ON i.character_id = c.id
        WHERE i.user_id = ?
      `).all(user.id);

      let score = 0;
      let totalUnique = items.length;
      let totalCount = 0;
      let rarestTier = null;
      let rarestValue = 0;

      for (const item of items) {
        const points = RARITY_POINTS[item.rarity] || 1;
        score += points * item.count;
        totalCount += item.count;
        if (points > rarestValue) {
          rarestValue = points;
          rarestTier = item.rarity;
        }
      }

      return {
        id: user.id,
        username: user.username,
        isOwner: user.is_owner,
        score,
        totalUnique,
        totalCount,
        rarestTier
      };
    });

    // Sort by score desc, then unique count desc
    leaderboard.sort((a, b) => b.score - a.score || b.totalUnique - a.totalUnique);

    // Add rank
    leaderboard.forEach((entry, i) => entry.rank = i + 1);

    res.json(leaderboard);
  } finally {
    db.close();
  }
});

module.exports = router;
