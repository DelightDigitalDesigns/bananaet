/**
 * Potassium Level System
 * 
 * Every card gets a "Potassium Level" (1–100) rolled at pull/craft time.
 * Ranges overlap by rarity so upsets happen — a god-roll Rare can beat
 * a bad-roll Epic. This stat powers all mini-games.
 */

const POTASSIUM_RANGES = {
  common:         { min: 10, max: 25 },
  rare:           { min: 20, max: 40 },
  epic:           { min: 35, max: 55 },
  legendary:      { min: 50, max: 70 },
  chroma_shiny:   { min: 55, max: 78 },
  chroma_rainbow: { min: 65, max: 85 },
  mystical:       { min: 75, max: 92 },
  bananarang:     { min: 88, max: 99 },
  astronomical:   { min: 95, max: 100 },
};

/**
 * Roll a potassium level for a given rarity.
 * Returns an integer in the rarity's range (inclusive).
 */
function rollPotassium(rarity) {
  const range = POTASSIUM_RANGES[rarity];
  if (!range) {
    // Unknown rarity — default to common range
    return Math.floor(Math.random() * 16) + 10;
  }
  return Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
}

/**
 * Backfill potassium levels for any inventory rows that have 0.
 * Called on server startup to handle existing data.
 */
function backfillPotassium(db) {
  const rows = db.prepare(`
    SELECT i.id, c.rarity
    FROM inventory i
    JOIN characters c ON i.character_id = c.id
    WHERE i.potassium_level = 0 OR i.potassium_level IS NULL
  `).all();

  if (rows.length === 0) return;

  for (const row of rows) {
    const level = rollPotassium(row.rarity);
    db.prepare('UPDATE inventory SET potassium_level = ? WHERE id = ?').run(level, row.id);
  }

  console.log(`Backfilled potassium levels for ${rows.length} inventory entries.`);
}

module.exports = { rollPotassium, backfillPotassium, POTASSIUM_RANGES };
