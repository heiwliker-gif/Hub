const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const dbDir = path.join(__dirname, 'db');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new DatabaseSync(path.join(dbDir, 'saparsplit.db'));

db.exec(`
PRAGMA journal_mode = WAL;


CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_id TEXT UNIQUE NOT NULL,
  email TEXT,
  name TEXT,
  picture TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  currency TEXT DEFAULT '₸',
  date TEXT,
  budget REAL DEFAULT 600000,
  members TEXT NOT NULL DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  desc TEXT,
  amount REAL,
  payer TEXT,
  participants TEXT NOT NULL DEFAULT '[]',
  date TEXT,
  icon TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS places (
  id TEXT PRIMARY KEY,
  trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name TEXT,
  cat TEXT,
  addr TEXT,
  desc TEXT,
  cost REAL DEFAULT 0,
  fav INTEGER DEFAULT 0,
  lat REAL,
  lng REAL,
  created_at TEXT DEFAULT (datetime('now'))
);


CREATE INDEX IF NOT EXISTS idx_trips_user ON trips(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_trip ON expenses(trip_id);
CREATE INDEX IF NOT EXISTS idx_places_trip ON places(trip_id);
`);


module.exports = db;
