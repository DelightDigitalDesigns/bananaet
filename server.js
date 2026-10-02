const express = require('express');
const session = require('express-session');
const path = require('path');
const { initialize } = require('./server/db/init');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'bananaet-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 days
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/auth', require('./server/routes/auth'));
app.use('/api/packs', require('./server/routes/packs'));
app.use('/api/inventory', require('./server/routes/inventory'));
app.use('/api/trades', require('./server/routes/trades'));
app.use('/api/crafting', require('./server/routes/crafting'));
app.use('/api/admin', require('./server/routes/admin'));

// Serve index for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize database (async), then start server
initialize().then(() => {
  app.listen(PORT, () => {
    console.log(`Bananalet running at http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
