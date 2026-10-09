const express = require('express');
const router = express.Router();
const { getDb } = require('../db/init');
const { requireAuth } = require('../middleware/auth');

const WAR_PRIZE = 500; // Bananas for the winner
const CARDS_PER_SIDE = 3;

// Track pending challenges: challengerId -> { targetId, timestamp }
const pendingChallenges = new Map();

function setupWar(io) {
  io.on('connection', (socket) => {
    if (socket.isSuperadmin) return;

    // Send a challenge
    socket.on('war:challenge', (data) => {
      const targetId = data.targetId;
      if (!targetId || targetId === socket.userId) return;

      // Check challenger has cards
      const db = getDb();
      try {
        const count = db.prepare(
          'SELECT COUNT(*) as c FROM inventory WHERE user_id = ? AND count > 0'
        ).get(socket.userId);
        if (!count || count.c === 0) {
          socket.emit('war:error', { message: 'You need at least 1 card to battle!' });
          return;
        }
      } finally { db.close(); }

      // Clear any existing challenge from this user
      pendingChallenges.delete(socket.userId);

      // Store the challenge
      pendingChallenges.set(socket.userId, {
        targetId,
        challengerName: socket.username,
        timestamp: Date.now()
      });

      // Find target socket and send challenge
      const targetSocket = findSocketByUserId(io, targetId);
      if (!targetSocket) {
        socket.emit('war:error', { message: 'Player is not online.' });
        pendingChallenges.delete(socket.userId);
        return;
      }

      targetSocket.emit('war:incoming', {
        challengerId: socket.userId,
        challengerName: socket.username
      });

      socket.emit('war:sent', { targetName: targetSocket.username });

      // Auto-expire challenge after 30 seconds
      setTimeout(() => {
        if (pendingChallenges.has(socket.userId)) {
          pendingChallenges.delete(socket.userId);
          socket.emit('war:expired', {});
        }
      }, 30000);
    });

    // Accept a challenge
    socket.on('war:accept', (data) => {
      const challengerId = data.challengerId;
      const challenge = pendingChallenges.get(challengerId);

      if (!challenge || challenge.targetId !== socket.userId) {
        socket.emit('war:error', { message: 'Challenge expired or not found.' });
        return;
      }

      pendingChallenges.delete(challengerId);

      // Run the battle
      const result = runBattle(challengerId, socket.userId);
      if (result.error) {
        socket.emit('war:error', { message: result.error });
        const challengerSocket = findSocketByUserId(io, challengerId);
        if (challengerSocket) challengerSocket.emit('war:error', { message: result.error });
        return;
      }

      // Store result and award bananas
      {
        const db = getDb();
        try {
          db.prepare(`INSERT INTO war_results (player1_id, player2_id, winner_id, player1_total, player2_total, is_draw, prize)
            VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).run(challengerId, socket.userId, result.winnerId, result.challengerTotal, result.defenderTotal, result.isDraw ? 1 : 0, result.winnerId ? WAR_PRIZE : 0);
          if (result.winnerId) {
            db.prepare('UPDATE users SET bananas = bananas + ? WHERE id = ?').run(WAR_PRIZE, result.winnerId);
          }
          db.close();
        } catch(e) {
          try { db.close(); } catch(ex) {}
        }
      }

      // Send results to both players
      const challengerSocket = findSocketByUserId(io, challengerId);
      const resultPayload = {
        challenger: {
          userId: challengerId,
          username: challenge.challengerName,
          cards: result.challengerCards,
          total: result.challengerTotal
        },
        defender: {
          userId: socket.userId,
          username: socket.username,
          cards: result.defenderCards,
          total: result.defenderTotal
        },
        winnerId: result.winnerId,
        winnerName: result.winnerName,
        prize: result.winnerId ? WAR_PRIZE : 0,
        isDraw: result.isDraw
      };

      if (challengerSocket) challengerSocket.emit('war:result', resultPayload);
      socket.emit('war:result', resultPayload);
    });

    // Decline a challenge
    socket.on('war:decline', (data) => {
      const challengerId = data.challengerId;
      const challenge = pendingChallenges.get(challengerId);

      if (challenge && challenge.targetId === socket.userId) {
        pendingChallenges.delete(challengerId);
        const challengerSocket = findSocketByUserId(io, challengerId);
        if (challengerSocket) {
          challengerSocket.emit('war:declined', { username: socket.username });
        }
      }
    });
  });
}

/**
 * Run a Potassium War battle between two players.
 * Draws CARDS_PER_SIDE random cards from each player's inventory,
 * compares potassium totals.
 */
function runBattle(player1Id, player2Id) {
  const db = getDb();
  try {
    const p1Cards = drawCards(db, player1Id);
    const p2Cards = drawCards(db, player2Id);

    if (p1Cards.length === 0 || p2Cards.length === 0) {
      return { error: 'Both players need at least 1 card to battle.' };
    }

    const p1Total = p1Cards.reduce((sum, c) => sum + c.potassium_level, 0);
    const p2Total = p2Cards.reduce((sum, c) => sum + c.potassium_level, 0);

    let winnerId = null;
    let winnerName = null;
    let isDraw = false;

    if (p1Total > p2Total) {
      winnerId = player1Id;
      const user = db.prepare('SELECT username FROM users WHERE id = ?').get(player1Id);
      winnerName = user ? user.username : 'Player 1';
    } else if (p2Total > p1Total) {
      winnerId = player2Id;
      const user = db.prepare('SELECT username FROM users WHERE id = ?').get(player2Id);
      winnerName = user ? user.username : 'Player 2';
    } else {
      isDraw = true;
    }

    return {
      challengerCards: p1Cards,
      defenderCards: p2Cards,
      challengerTotal: p1Total,
      defenderTotal: p2Total,
      winnerId,
      winnerName,
      isDraw
    };
  } finally {
    db.close();
  }
}

/**
 * Draw random cards from a player's inventory.
 * Weighted by count — if you have x5 of a card, it's more likely to appear.
 * Returns up to CARDS_PER_SIDE unique characters.
 */
function drawCards(db, userId) {
  // Get all inventory entries with potassium
  const items = db.prepare(`
    SELECT c.id, c.name, c.rarity, c.image_path, i.count, i.potassium_level
    FROM inventory i
    JOIN characters c ON i.character_id = c.id
    WHERE i.user_id = ? AND i.count > 0 AND i.potassium_level > 0
  `).all(userId);

  if (items.length === 0) return [];

  // Build weighted pool
  const pool = [];
  for (const item of items) {
    for (let i = 0; i < item.count; i++) {
      pool.push(item);
    }
  }

  // Draw unique characters (shuffle and pick)
  const drawn = [];
  const usedIds = new Set();
  const shuffled = pool.sort(() => Math.random() - 0.5);

  for (const card of shuffled) {
    if (usedIds.has(card.id)) continue;
    usedIds.add(card.id);
    drawn.push({
      id: card.id,
      name: card.name,
      rarity: card.rarity,
      image_path: card.image_path,
      potassium_level: card.potassium_level
    });
    if (drawn.length >= CARDS_PER_SIDE) break;
  }

  return drawn;
}

function findSocketByUserId(io, userId) {
  for (const [, s] of io.sockets.sockets) {
    if (s.userId === userId && !s.isSuperadmin) return s;
  }
  return null;
}

// === REST API endpoints for war records ===

// Overall war records for all players
router.get('/records', requireAuth, (req, res) => {
  const db = getDb();
  try {
    const records = db.prepare(`
      SELECT u.id as userId, u.username,
        COALESCE(w.wins, 0) as wins,
        COALESCE(l.losses, 0) as losses,
        COALESCE(d.draws, 0) as draws
      FROM users u
      LEFT JOIN (
        SELECT winner_id, COUNT(*) as wins FROM war_results WHERE winner_id IS NOT NULL AND is_draw = 0 GROUP BY winner_id
      ) w ON u.id = w.winner_id
      LEFT JOIN (
        SELECT loser_id, COUNT(*) as losses FROM (
          SELECT CASE WHEN winner_id = player1_id THEN player2_id ELSE player1_id END as loser_id
          FROM war_results WHERE winner_id IS NOT NULL AND is_draw = 0
        ) GROUP BY loser_id
      ) l ON u.id = l.loser_id
      LEFT JOIN (
        SELECT player_id, COUNT(*) as draws FROM (
          SELECT player1_id as player_id FROM war_results WHERE is_draw = 1
          UNION ALL
          SELECT player2_id as player_id FROM war_results WHERE is_draw = 1
        ) GROUP BY player_id
      ) d ON u.id = d.player_id
      WHERE u.is_superadmin = 0 AND u.banned = 0
        AND (COALESCE(w.wins, 0) + COALESCE(l.losses, 0) + COALESCE(d.draws, 0)) > 0
      ORDER BY wins DESC, losses ASC
    `).all();
    res.json(records);
  } finally {
    db.close();
  }
});

// Head-to-head record between current user and another player
router.get('/h2h/:opponentId', requireAuth, (req, res) => {
  const opponentId = parseInt(req.params.opponentId);
  const userId = req.session.userId;
  if (!opponentId || opponentId === userId) {
    return res.json({ wins: 0, losses: 0, draws: 0 });
  }

  const db = getDb();
  try {
    const wins = db.prepare(`
      SELECT COUNT(*) as c FROM war_results
      WHERE winner_id = ? AND ((player1_id = ? AND player2_id = ?) OR (player1_id = ? AND player2_id = ?))
    `).get(userId, userId, opponentId, opponentId, userId).c;

    const losses = db.prepare(`
      SELECT COUNT(*) as c FROM war_results
      WHERE winner_id = ? AND ((player1_id = ? AND player2_id = ?) OR (player1_id = ? AND player2_id = ?))
    `).get(opponentId, userId, opponentId, opponentId, userId).c;

    const draws = db.prepare(`
      SELECT COUNT(*) as c FROM war_results
      WHERE is_draw = 1 AND ((player1_id = ? AND player2_id = ?) OR (player1_id = ? AND player2_id = ?))
    `).get(userId, opponentId, opponentId, userId).c;

    res.json({ wins, losses, draws });
  } finally {
    db.close();
  }
});

module.exports = { setupWar, warRouter: router };
