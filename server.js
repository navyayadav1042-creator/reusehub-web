const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database(path.join(__dirname, 'reusehub.db'));

db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    item_condition TEXT NOT NULL,
    exchange_type TEXT NOT NULL,
    location TEXT NOT NULL,
    image_url TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Available',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL,
    requester_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(listing_id, requester_id),
    FOREIGN KEY(listing_id) REFERENCES listings(id),
    FOREIGN KEY(requester_id) REFERENCES users(id)
  );
`);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  name: 'reusehub.sid',
  secret: process.env.SESSION_SECRET || 'change-this-development-secret-before-deployment',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 8 }
}));
app.use(express.static(path.join(__dirname, 'public')));

function safeUser(user) {
  return user ? { id: user.id, name: user.name, email: user.email } : null;
}
function requireLogin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Please log in first.' });
  next();
}
function cleanText(value, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(req.session.userId);
  res.json({ user: safeUser(user) });
});

app.post('/api/register', async (req, res) => {
  const name = cleanText(req.body.name, 80);
  const email = cleanText(req.body.email, 160).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (name.length < 2) return res.status(400).json({ error: 'Name must contain at least 2 characters.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)').run(name, email, hash);
    req.session.userId = Number(result.lastInsertRowid);
    res.status(201).json({ user: { id: Number(result.lastInsertRowid), name, email } });
  } catch (err) {
    if (String(err.code).includes('SQLITE_CONSTRAINT')) return res.status(409).json({ error: 'This email is already registered. Please log in.' });
    console.error(err); res.status(500).json({ error: 'Could not create account.' });
  }
});

app.post('/api/login', async (req, res) => {
  const email = cleanText(req.body.email, 160).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Incorrect email or password.' });
  req.session.userId = user.id;
  res.json({ user: safeUser(user) });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('reusehub.sid');
    res.json({ success: true });
  });
});

app.get('/api/listings', (req, res) => {
  const q = cleanText(req.query.q, 100);
  const category = cleanText(req.query.category, 50);
  const params = [];
  let sql = `SELECT l.*, u.name AS owner_name FROM listings l JOIN users u ON u.id = l.user_id WHERE l.status = 'Available'`;
  if (q) { sql += ` AND (l.title LIKE ? OR l.description LIKE ? OR l.location LIKE ?)`; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (category && category !== 'All') { sql += ' AND l.category = ?'; params.push(category); }
  sql += ' ORDER BY l.id DESC LIMIT 100';
  res.json({ listings: db.prepare(sql).all(...params) });
});

app.post('/api/listings', requireLogin, (req, res) => {
  const title = cleanText(req.body.title, 100);
  const description = cleanText(req.body.description, 700);
  const category = cleanText(req.body.category, 40);
  const itemCondition = cleanText(req.body.item_condition, 30);
  const exchangeType = cleanText(req.body.exchange_type, 30);
  const location = cleanText(req.body.location, 100);
  const imageUrl = cleanText(req.body.image_url, 500);
  const allowedCategories = ['Books', 'Clothing', 'Electronics', 'Home', 'Sports', 'Other'];
  const allowedConditions = ['New', 'Like new', 'Good', 'Used'];
  const allowedTypes = ['Free donation', 'Exchange'];
  if (title.length < 3 || description.length < 10 || !location) return res.status(400).json({ error: 'Add a title, a description (at least 10 characters), and a location.' });
  if (!allowedCategories.includes(category) || !allowedConditions.includes(itemCondition) || !allowedTypes.includes(exchangeType)) return res.status(400).json({ error: 'Choose valid category, condition, and listing type.' });
  if (imageUrl && !/^https:\/\//i.test(imageUrl)) return res.status(400).json({ error: 'Image URL must start with https://.' });
  const result = db.prepare(`INSERT INTO listings (user_id, title, description, category, item_condition, exchange_type, location, image_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(req.session.userId, title, description, category, itemCondition, exchangeType, location, imageUrl);
  res.status(201).json({ listing: db.prepare('SELECT l.*, u.name AS owner_name FROM listings l JOIN users u ON u.id=l.user_id WHERE l.id=?').get(result.lastInsertRowid) });
});

app.get('/api/my-listings', requireLogin, (req, res) => {
  const listings = db.prepare('SELECT * FROM listings WHERE user_id = ? ORDER BY id DESC').all(req.session.userId);
  res.json({ listings });
});

app.delete('/api/listings/:id', requireLogin, (req, res) => {
  const id = Number(req.params.id);
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
  if (!listing) return res.status(404).json({ error: 'Listing not found.' });
  if (listing.user_id !== req.session.userId) return res.status(403).json({ error: 'You can only remove your own listing.' });
  db.prepare('DELETE FROM requests WHERE listing_id = ?').run(id);
  db.prepare('DELETE FROM listings WHERE id = ?').run(id);
  res.json({ success: true });
});

app.post('/api/listings/:id/request', requireLogin, (req, res) => {
  const id = Number(req.params.id);
  const listing = db.prepare('SELECT * FROM listings WHERE id = ? AND status = ?').get(id, 'Available');
  if (!listing) return res.status(404).json({ error: 'This item is no longer available.' });
  if (listing.user_id === req.session.userId) return res.status(400).json({ error: 'You cannot request your own item.' });
  const message = cleanText(req.body.message, 400);
  if (message.length < 5) return res.status(400).json({ error: 'Please write a short message (at least 5 characters).' });
  try {
    db.prepare('INSERT INTO requests (listing_id, requester_id, message) VALUES (?, ?, ?)').run(id, req.session.userId, message);
    res.status(201).json({ success: true, message: 'Request sent to the item owner.' });
  } catch (err) {
    if (String(err.code).includes('SQLITE_CONSTRAINT')) return res.status(409).json({ error: 'You have already requested this item.' });
    console.error(err); res.status(500).json({ error: 'Could not send request.' });
  }
});

app.get('/api/requests/received', requireLogin, (req, res) => {
  const requests = db.prepare(`SELECT r.id, r.message, r.status, r.created_at, l.title AS item_title, u.name AS requester_name, u.email AS requester_email
    FROM requests r JOIN listings l ON l.id=r.listing_id JOIN users u ON u.id=r.requester_id
    WHERE l.user_id = ? ORDER BY r.id DESC`).all(req.session.userId);
  res.json({ requests });
});

app.patch('/api/requests/:id', requireLogin, (req, res) => {
  const id = Number(req.params.id);
  const status = cleanText(req.body.status, 20);
  if (!['Accepted', 'Declined'].includes(status)) return res.status(400).json({ error: 'Invalid request status.' });
  const request = db.prepare(`SELECT r.id, r.listing_id, l.user_id AS owner_id FROM requests r JOIN listings l ON l.id=r.listing_id WHERE r.id=?`).get(id);
  if (!request) return res.status(404).json({ error: 'Request not found.' });
  if (request.owner_id !== req.session.userId) return res.status(403).json({ error: 'Only the item owner can update this request.' });
  db.prepare('UPDATE requests SET status=? WHERE id=?').run(status, id);
  if (status === 'Accepted') db.prepare("UPDATE listings SET status='Unavailable' WHERE id=?").run(request.listing_id);
  res.json({ success: true });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`ReuseHub running at http://localhost:${PORT}`));
