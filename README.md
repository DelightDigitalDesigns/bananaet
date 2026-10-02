# Bananaet

A private collectible game server. Earn Bananas, open packs, collect characters across rarity tiers, trade with friends, and climb the leaderboard.

## Stack

- **Backend:** Node.js + Express
- **Database:** SQLite (via better-sqlite3)
- **Real-time:** Socket.io
- **Frontend:** Vanilla HTML/CSS/JS

## Setup

```bash
npm install
npm start
```

Server runs at `http://localhost:3000`

## Project Structure

```
bananaet/
├── server/
│   ├── routes/       # Express route handlers
│   ├── middleware/    # Auth, profanity filter
│   └── db/           # SQLite schema and queries
├── public/
│   ├── css/          # Stylesheets
│   ├── js/           # Client-side JavaScript
│   └── img/          # Character artwork
├── server.js         # Entry point
└── package.json
```
