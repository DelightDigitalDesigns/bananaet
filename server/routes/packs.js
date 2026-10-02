const express = require('express');
const router = express.Router();
const { getDb } = require('../db/init');
const { requireAuth } = require('../middleware/auth');
const { openPack } = require('../gacha');

// List available packs
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  try {
    const packs = db.prepare(`
      SELECT p.*, s.name as season_name, s.theme as season_theme
      FROM packs p
      JOIN seasons s ON p.season_id = s.id
      WHERE p.active = 1
      ORDER BY p.cost ASC
    `).all();

    // Attach odds to each pack
    const packsWithOdds = packs.map(pack => {
      const odds = db.prepare(
        'SELECT rarity, weight FROM pack_odds WHERE pack_id = ? ORDER BY weight DESC'
      ).all(pack.id);
      return { ...pack, odds };
    });

    res.json(packsWithOdds);
  } finally {
    db.close();
  }
});

// Open a pack
router.post('/:id/open', requireAuth, (req, res) => {
  try {
    const result = openPack(req.session.userId, parseInt(req.params.id));
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
