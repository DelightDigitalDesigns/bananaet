const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'bananaet.db');

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function initialize() {
  const db = getDb();

  // Run schema
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);

  // Seed only if empty
  const seasonCount = db.prepare('SELECT COUNT(*) as c FROM seasons').get().c;
  if (seasonCount === 0) {
    seed(db);
  }

  db.close();
  console.log('Database initialized.');
}

function seed(db) {
  // Season 1
  const seasonResult = db.prepare(
    `INSERT INTO seasons (name, theme) VALUES (?, ?)`
  ).run('Season 1: War of the Worlds', 'War of the Worlds (2005)');
  const seasonId = seasonResult.lastInsertRowid;

  // Characters
  const insertChar = db.prepare(
    `INSERT INTO characters (name, rarity, season_id) VALUES (?, ?, ?)`
  );

  const characters = [
    // Common
    ['Fleeing Civilian', 'common'],
    ['News Reporter', 'common'],
    ['Military Soldier', 'common'],
    ['Abandoned Car', 'common'],
    ['Ferry Passenger', 'common'],
    // Rare
    ['Red Weed Patch', 'rare'],
    ['Crashed Airplane', 'rare'],
    ['EMP Shockwave', 'rare'],
    ['Basement Hideout', 'rare'],
    // Epic
    ['Lightning Storm', 'epic'],
    ['Alien Probe (Snake-Cam)', 'epic'],
    ['Burning Train', 'epic'],
    // Legendary
    ['Harvester Machine', 'legendary'],
    ['Hudson River Ferry', 'legendary'],
    // Mystical
    ['Alien Pilot', 'mystical'],
    // Bananarang
    ['The Red Weed Bloom', 'bananarang'],
    // Astronomical (owner-only, never in packs)
    ['Tripod', 'astronomical'],
    ['Tom Cruise (Ray Ferrier)', 'astronomical'],
    ['Uber Pod', 'astronomical'],
  ];

  const insertMany = db.transaction(() => {
    for (const [name, rarity] of characters) {
      insertChar.run(name, rarity, seasonId);
    }
  });
  insertMany();

  // Packs
  const insertPack = db.prepare(
    `INSERT INTO packs (name, cost, season_id, max_rarity) VALUES (?, ?, ?, ?)`
  );
  const standardPack = insertPack.run('Standard Pack', 500, seasonId, 'epic');
  const premiumPack = insertPack.run('Premium Pack', 2000, seasonId, 'mystical');
  const ultraPack = insertPack.run('Ultra Pack', 5000, seasonId, 'bananarang');

  // Pack odds
  const insertOdds = db.prepare(
    `INSERT INTO pack_odds (pack_id, rarity, weight) VALUES (?, ?, ?)`
  );

  // Standard Pack odds (max: epic)
  insertOdds.run(standardPack.lastInsertRowid, 'common', 55);
  insertOdds.run(standardPack.lastInsertRowid, 'rare', 30);
  insertOdds.run(standardPack.lastInsertRowid, 'epic', 15);

  // Premium Pack odds (max: mystical)
  insertOdds.run(premiumPack.lastInsertRowid, 'common', 35);
  insertOdds.run(premiumPack.lastInsertRowid, 'rare', 28);
  insertOdds.run(premiumPack.lastInsertRowid, 'epic', 20);
  insertOdds.run(premiumPack.lastInsertRowid, 'legendary', 10);
  insertOdds.run(premiumPack.lastInsertRowid, 'chroma_shiny', 4);
  insertOdds.run(premiumPack.lastInsertRowid, 'mystical', 3);

  // Ultra Pack odds (max: bananarang)
  insertOdds.run(ultraPack.lastInsertRowid, 'common', 25);
  insertOdds.run(ultraPack.lastInsertRowid, 'rare', 25);
  insertOdds.run(ultraPack.lastInsertRowid, 'epic', 20);
  insertOdds.run(ultraPack.lastInsertRowid, 'legendary', 14);
  insertOdds.run(ultraPack.lastInsertRowid, 'chroma_shiny', 8);
  insertOdds.run(ultraPack.lastInsertRowid, 'chroma_rainbow', 4);
  insertOdds.run(ultraPack.lastInsertRowid, 'mystical', 3.5);
  insertOdds.run(ultraPack.lastInsertRowid, 'bananarang', 0.5);

  // Default invite code for Gage
  db.prepare(
    `INSERT INTO invite_codes (code) VALUES (?)`
  ).run('banana1');

  console.log('Seed data loaded: Season 1 characters, packs, and invite code "banana1".');
}

module.exports = { getDb, initialize };
