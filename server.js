require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const path = require('path');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const JWT_SECRET = process.env.JWT_SECRET;

if (!GOOGLE_CLIENT_ID || !JWT_SECRET) {
  console.error('❌ Заполните .env файл (см. .env.example): нужны GOOGLE_CLIENT_ID и JWT_SECRET');
  process.exit(1);
}

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────
//  AUTH MIDDLEWARE
// ─────────────────────────────────────────────
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'no_token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

function userPublic(u) {
  return { id: u.id, email: u.email, name: u.name, picture: u.picture };
}

// ─────────────────────────────────────────────
//  AUTH ROUTES
// ─────────────────────────────────────────────
app.post('/api/auth/google', async (req, res) => {
  const { credential } = req.body || {};
  if (!credential) return res.status(400).json({ error: 'missing_credential' });

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (e) {
    return res.status(401).json({ error: 'invalid_google_token' });
  }

  const { sub: googleId, email, name, picture } = payload;

  let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId);
  if (!user) {
    const info = db.prepare(
      'INSERT INTO users (google_id, email, name, picture) VALUES (?, ?, ?, ?)'
    ).run(googleId, email, name, picture);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  } else {
    db.prepare('UPDATE users SET email=?, name=?, picture=? WHERE id=?')
      .run(email, name, picture, user.id);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  }

  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: userPublic(user) });
});


// ─────────────────────────────────────────────
//  TRIPS ROUTES (все защищены requireAuth и scoped по user_id)
// ─────────────────────────────────────────────
app.get('/api/trips', requireAuth, (req, res) => {
  const trips = db.prepare('SELECT * FROM trips WHERE user_id = ? ORDER BY id DESC').all(req.userId);
  res.json(trips.map(t => ({
    id: t.id, name: t.name, currency: t.currency, date: t.date,
    budget: t.budget, members: JSON.parse(t.members), created_at: t.created_at,
  })));
});

app.post('/api/trips', requireAuth, (req, res) => {
  const { name, currency, date, members, budget } = req.body || {};
  if (!name) return res.status(400).json({ error: 'missing_name' });
  const info = db.prepare(
    'INSERT INTO trips (user_id, name, currency, date, budget, members) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.userId, name, currency || '₸', date || '', budget || 600000, JSON.stringify(members || []));
  res.json({ id: info.lastInsertRowid });
});

function getOwnedTrip(tripId, userId) {
  return db.prepare('SELECT * FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId);
}

app.get('/api/trips/:id', requireAuth, (req, res) => {
  const trip = getOwnedTrip(req.params.id, req.userId);
  if (!trip) return res.status(404).json({ error: 'not_found' });
  const expenses = db.prepare('SELECT * FROM expenses WHERE trip_id = ? ORDER BY id').all(trip.id);
  const places = db.prepare('SELECT * FROM places WHERE trip_id = ? ORDER BY id').all(trip.id);
  res.json({
    id: trip.id, name: trip.name, currency: trip.currency, date: trip.date,
    budget: trip.budget, members: JSON.parse(trip.members),
    expenses: expenses.map(e => ({
      id: e.id, desc: e.desc, amount: e.amount, payer: e.payer,
      participants: JSON.parse(e.participants), date: e.date, icon: e.icon,
    })),
    places: places.map(p => ({
      id: p.id, name: p.name, cat: p.cat, addr: p.addr, desc: p.desc,
      cost: p.cost, fav: !!p.fav, lat: p.lat, lng: p.lng,
    })),
  });
});

app.delete('/api/trips/:id', requireAuth, (req, res) => {
  const trip = getOwnedTrip(req.params.id, req.userId);
  if (!trip) return res.status(404).json({ error: 'not_found' });
  db.prepare('DELETE FROM trips WHERE id = ?').run(trip.id);
  res.json({ ok: true });
});

app.post('/api/trips/:id/expenses', requireAuth, (req, res) => {
  const trip = getOwnedTrip(req.params.id, req.userId);
  if (!trip) return res.status(404).json({ error: 'not_found' });
  const { id, desc, amount, payer, participants, date, icon } = req.body || {};
  const expenseId = id || ('e' + Date.now());
  db.prepare(
    'INSERT INTO expenses (id, trip_id, desc, amount, payer, participants, date, icon) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(expenseId, trip.id, desc, amount, payer, JSON.stringify(participants || []), date, icon);
  res.json({ id: expenseId });
});

app.delete('/api/trips/:id/expenses/:expenseId', requireAuth, (req, res) => {
  const trip = getOwnedTrip(req.params.id, req.userId);
  if (!trip) return res.status(404).json({ error: 'not_found' });
  db.prepare('DELETE FROM expenses WHERE id = ? AND trip_id = ?').run(req.params.expenseId, trip.id);
  res.json({ ok: true });
});

app.post('/api/trips/:id/places', requireAuth, (req, res) => {
  const trip = getOwnedTrip(req.params.id, req.userId);
  if (!trip) return res.status(404).json({ error: 'not_found' });
  const { id, name, cat, addr, desc, cost, fav, lat, lng } = req.body || {};
  const placeId = id || ('p' + Date.now());
  db.prepare(
    'INSERT INTO places (id, trip_id, name, cat, addr, desc, cost, fav, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(placeId, trip.id, name, cat, addr, desc, cost || 0, fav ? 1 : 0, lat, lng);
  res.json({ id: placeId });
});

app.delete('/api/trips/:id/places/:placeId', requireAuth, (req, res) => {
  const trip = getOwnedTrip(req.params.id, req.userId);
  if (!trip) return res.status(404).json({ error: 'not_found' });
  db.prepare('DELETE FROM places WHERE id = ? AND trip_id = ?').run(req.params.placeId, trip.id);
  res.json({ ok: true });
});

// ─────────────────────────────────────────────
//  Отдать index.html для всех остальных путей (SPA)
// ─────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ SaparSplit сервері іске қосылды: http://localhost:${PORT}`);
});
