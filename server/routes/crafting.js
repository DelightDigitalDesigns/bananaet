const express = require('express');
const router = express.Router();
const { getDb } = require('../db/init');
const { requireAuth } = require('../middleware/auth');

// Crafting recipes
const RECIPES = [
  { from: 'common', count: 5, to: 'rare' },
  { from: 'rare', count: 4, to: 'epic' },
  { from: 'epic', count: 3, to: 'legendary' },
  { from: 'legendary', count: 3, to: 'chroma_shiny' },
];

// Get crafting recipes
router.get('/recipes', requireAuth, (req, res) => {
  res.json(RECIPES);
});

// Get craftable items (what the user can craft right now)
router.get('/available', requireAuth, (req, res) => {
  const db = getDb();
  try {
    const inventory = db.prepare(`
      SELECT c.rarity, SUM(i.count) as total
      FROM inventory i
      JOIN characters c ON i.character_id = c.id
      WHERE i.user_id = ?
      GROUP BY c.rarity
    `).all(req.session.userId);

    const counts = {};
    inventory.forEach(r => counts[r.rarity] = r.total);

    const available = RECIPES.map(recipe => ({
      ...recipe,
      have: counts[recipe.from] || 0,
      canCraft: Math.floor((counts[recipe.from] || 0) / recipe.count)
    }));

    res.json(available);
  } finally {
    db.close();
  }
});

// Craft: consume duplicates of one rarity to get a random character of the next
router.post('/craft', requireAuth, (req, res) => {
  const { fromRarity } = req.body;

  const recipe = RECIPES.find(r => r.from === fromRarity);
  if (!recipe) {
    return res.status(400).json({ error: 'Invalid crafting recipe' });
  }

  const db = getDb();
  try {
    // Get user's characters of this rarity with duplicates
    const items = db.prepare(`
      SELECT i.id, i.count, i.character_id, c.name
      FROM inventory i
      JOIN characters c ON i.character_id = c.id
      WHERE i.user_id = ? AND c.rarity = ? AND i.count > 0
      ORDER BY i.count DESC
    `).all(req.session.userId, recipe.from);

    // Count total available
    const totalAvailable = items.reduce((sum, i) => sum + i.count, 0);
    if (totalAvailable < recipe.count) {
      return res.status(400).json({
        error: `Need ${recipe.count} ${recipe.from} characters, have ${totalAvailable}`
      });
    }

    // Pick a random character of the target rarity
    // For chroma_shiny, pick a random base character and create/find its shiny variant
    let resultChar;
    if (recipe.to === 'chroma_shiny') {
      const baseChar = db.prepare(`
        SELECT * FROM characters
        WHERE rarity IN ('common','rare','epic','legendary')
        ORDER BY RANDOM() LIMIT 1
      `).get();

      if (!baseChar) {
        return res.status(500).json({ error: 'No characters available' });
      }

      const chromaName = `✨ ${baseChar.name}`;
      resultChar = db.prepare(
        'SELECT * FROM characters WHERE name = ? AND rarity = ?'
      ).get(chromaName, 'chroma_shiny');

      if (!resultChar) {
        // Build shiny image path from base
        let chromaImagePath = baseChar.image_path;
        if (chromaImagePath) {
          chromaImagePath = chromaImagePath.replace('.png', '-shiny.png');
        }
        const r = db.prepare(
          'INSERT INTO characters (name, rarity, season_id, image_path) VALUES (?, ?, ?, ?)'
        ).run(chromaName, 'chroma_shiny', baseChar.season_id, chromaImagePath);
        resultChar = { id: r.lastInsertRowid, name: chromaName, rarity: 'chroma_shiny', image_path: chromaImagePath };
      }
    } else {
      resultChar = db.prepare(`
        SELECT * FROM characters WHERE rarity = ? ORDER BY RANDOM() LIMIT 1
      `).get(recipe.to);
    }

    if (!resultChar) {
      return res.status(500).json({ error: 'No target characters available' });
    }

    // Consume the materials — take from highest-count stacks first
    let remaining = recipe.count;
    for (const item of items) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, item.count);
      db.prepare('UPDATE inventory SET count = count - ? WHERE id = ?').run(take, item.id);
      remaining -= take;
    }

    // Clean up zero-count rows
    db.prepare('DELETE FROM inventory WHERE count <= 0 AND user_id = ?').run(req.session.userId);

    // Add result to inventory
    const existing = db.prepare(
      'SELECT id FROM inventory WHERE user_id = ? AND character_id = ?'
    ).get(req.session.userId, resultChar.id);

    if (existing) {
      db.prepare('UPDATE inventory SET count = count + 1 WHERE id = ?').run(existing.id);
    } else {
      db.prepare('INSERT INTO inventory (user_id, character_id) VALUES (?, ?)').run(req.session.userId, resultChar.id);
    }

    db.close();
    res.json({
      success: true,
      consumed: { rarity: recipe.from, count: recipe.count },
      result: { id: resultChar.id, name: resultChar.name, rarity: resultChar.rarity, image_path: resultChar.image_path }
    });
  } catch (e) {
    db.close();
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
