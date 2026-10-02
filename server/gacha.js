const { getDb } = require('./db/init');

/**
 * Opens a pack: deducts cost, rolls rarity, picks a random character,
 * adds to inventory. Returns the pulled character.
 */
function openPack(userId, packId) {
  const db = getDb();
  try {
    // Get pack info
    const pack = db.prepare('SELECT * FROM packs WHERE id = ? AND active = 1').get(packId);
    if (!pack) {
      throw new Error('Pack not found or not available');
    }

    // Get user
    const user = db.prepare('SELECT id, bananas FROM users WHERE id = ?').get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (user.bananas < pack.cost) {
      throw new Error(`Not enough Bananas. Need ${pack.cost}, have ${user.bananas}`);
    }

    // Get odds for this pack
    const odds = db.prepare('SELECT rarity, weight FROM pack_odds WHERE pack_id = ?').all(packId);
    if (odds.length === 0) {
      throw new Error('Pack has no configured odds');
    }

    // Roll for rarity
    const rarity = rollRarity(odds);

    // Pick a random character of that rarity from the pack's season
    // Chroma variants: pick any character from common-legendary and mark it as chroma
    let character;
    if (rarity === 'chroma_shiny' || rarity === 'chroma_rainbow') {
      // Chroma pulls a random common-legendary character as a shiny/rainbow variant
      const baseChars = db.prepare(
        `SELECT * FROM characters 
         WHERE season_id = ? AND rarity IN ('common','rare','epic','legendary')
         ORDER BY RANDOM() LIMIT 1`
      ).get(pack.season_id);

      if (!baseChars) {
        throw new Error('No characters available for chroma pull');
      }

      // Check if a chroma version of this character already exists
      const chromaName = rarity === 'chroma_shiny'
        ? `✨ ${baseChars.name}`
        : `🌈 ${baseChars.name}`;

      let chromaChar = db.prepare(
        'SELECT * FROM characters WHERE name = ? AND rarity = ? AND season_id = ?'
      ).get(chromaName, rarity, pack.season_id);

      if (!chromaChar) {
        // Create the chroma variant on the fly
        const result = db.prepare(
          'INSERT INTO characters (name, rarity, season_id, image_path) VALUES (?, ?, ?, ?)'
        ).run(chromaName, rarity, pack.season_id, baseChars.image_path);
        chromaChar = { id: result.lastInsertRowid, name: chromaName, rarity, season_id: pack.season_id };
      }

      character = chromaChar;
    } else {
      character = db.prepare(
        `SELECT * FROM characters 
         WHERE season_id = ? AND rarity = ?
         ORDER BY RANDOM() LIMIT 1`
      ).get(pack.season_id, rarity);
    }

    if (!character) {
      throw new Error(`No characters found for rarity: ${rarity}`);
    }

    // Transaction: deduct bananas + add to inventory
    const execute = db.transaction(() => {
      // Deduct cost
      db.prepare('UPDATE users SET bananas = bananas - ? WHERE id = ?').run(pack.cost, userId);

      // Add to inventory (increment if already owned)
      const existing = db.prepare(
        'SELECT id, count FROM inventory WHERE user_id = ? AND character_id = ?'
      ).get(userId, character.id);

      if (existing) {
        db.prepare('UPDATE inventory SET count = count + 1 WHERE id = ?').run(existing.id);
      } else {
        db.prepare(
          'INSERT INTO inventory (user_id, character_id) VALUES (?, ?)'
        ).run(userId, character.id);
      }
    });
    execute();

    // Get updated banana count
    const updated = db.prepare('SELECT bananas FROM users WHERE id = ?').get(userId);

    return {
      character: {
        id: character.id,
        name: character.name,
        rarity: character.rarity,
        image_path: character.image_path
      },
      newBalance: updated.bananas,
      packName: pack.name,
      cost: pack.cost
    };
  } finally {
    db.close();
  }
}

/**
 * Weighted random selection of rarity tier
 */
function rollRarity(odds) {
  const totalWeight = odds.reduce((sum, o) => sum + o.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const odd of odds) {
    roll -= odd.weight;
    if (roll <= 0) {
      return odd.rarity;
    }
  }

  // Fallback to last rarity
  return odds[odds.length - 1].rarity;
}

module.exports = { openPack };
