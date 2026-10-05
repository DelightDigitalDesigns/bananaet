-- Bananalet Database Schema

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  invite_code TEXT NOT NULL,
  is_owner INTEGER DEFAULT 0,
  is_superadmin INTEGER DEFAULT 0,
  bananas INTEGER DEFAULT 1500,
  last_login TEXT,
  last_daily_claim TEXT,
  showcase_character_id INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  banned INTEGER DEFAULT 0,
  muted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  username TEXT NOT NULL,
  room TEXT NOT NULL DEFAULT 'main',
  message TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS server_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invite_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  created_by INTEGER REFERENCES users(id),
  used_by INTEGER REFERENCES users(id),
  used INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS seasons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  theme TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  rarity TEXT NOT NULL CHECK(rarity IN ('common','rare','epic','legendary','chroma_shiny','chroma_rainbow','mystical','bananarang','astronomical')),
  season_id INTEGER REFERENCES seasons(id),
  image_path TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  character_id INTEGER REFERENCES characters(id),
  count INTEGER DEFAULT 1,
  potassium_level INTEGER DEFAULT 0,
  obtained_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, character_id)
);

CREATE TABLE IF NOT EXISTS packs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  cost INTEGER NOT NULL,
  season_id INTEGER REFERENCES seasons(id),
  max_rarity TEXT NOT NULL,
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS pack_odds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pack_id INTEGER REFERENCES packs(id),
  rarity TEXT NOT NULL,
  weight REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS badges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#FFD700',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_badges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  badge_id INTEGER REFERENCES badges(id),
  assigned_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, badge_id)
);

CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user_id INTEGER REFERENCES users(id),
  to_user_id INTEGER REFERENCES users(id),
  from_character_id INTEGER REFERENCES characters(id),
  to_character_id INTEGER REFERENCES characters(id),
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','cancelled')),
  created_at TEXT DEFAULT (datetime('now'))
);
