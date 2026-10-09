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

    // Pre-fetch all war records in bulk
    const warWins = {};
    const warLosses = {};
    const warDraws = {};

    const winsRows = db.prepare(`
      SELECT winner_id, COUNT(*) as c FROM war_results WHERE winner_id IS NOT NULL AND is_draw = 0 GROUP BY winner_id
    `).all();
    for (const r of winsRows) warWins[r.winner_id] = r.c;

    const lossRows = db.prepare(`
      SELECT loser_id, COUNT(*) as c FROM (
        SELECT CASE WHEN winner_id = player1_id THEN player2_id ELSE player1_id END as loser_id
        FROM war_results WHERE winner_id IS NOT NULL AND is_draw = 0
      ) GROUP BY loser_id
    `).all();
    for (const r of lossRows) warLosses[r.loser_id] = r.c;

    const drawRows = db.prepare(`
      SELECT player_id, COUNT(*) as c FROM (
        SELECT player1_id as player_id FROM war_results WHERE is_draw = 1
        UNION ALL
        SELECT player2_id as player_id FROM war_results WHERE is_draw = 1
      ) GROUP BY player_id
    `).all();
    for (const r of drawRows) warDraws[r.player_id] = r.c;

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
        rarestTier,
        warWins: warWins[user.id] || 0,
        warLosses: warLosses[user.id] || 0,
        warDraws: warDraws[user.id] || 0
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
