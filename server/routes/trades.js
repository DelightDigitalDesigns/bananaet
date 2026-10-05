const express = require('express');
const router = express.Router();
const { getDb } = require('../db/init');
const { requireAuth } = require('../middleware/auth');

// List all users (for trade partner selection)
router.get('/users', requireAuth, (req, res) => {
  const db = getDb();
  try {
    const users = db.prepare(
      'SELECT id, username, is_owner FROM users WHERE id != ? AND banned = 0'
    ).all(req.session.userId);
    res.json(users);
  } finally {
    db.close();
  }
});

// Create a trade offer
router.post('/offer', requireAuth, (req, res) => {
  const { toUserId, offerCharacterId, requestCharacterId } = req.body;

  if (!toUserId || !offerCharacterId) {
    return res.status(400).json({ error: 'Must specify a recipient and a character to offer' });
  }

  const db = getDb();
  try {
    // Verify sender owns the character
    const senderItem = db.prepare(
      'SELECT * FROM inventory WHERE user_id = ? AND character_id = ? AND count > 0'
    ).get(req.session.userId, offerCharacterId);

    if (!senderItem) {
      return res.status(400).json({ error: "You don't own that character" });
    }

    // If requesting a character back, verify recipient owns it
    if (requestCharacterId) {
      const recipientItem = db.prepare(
        'SELECT * FROM inventory WHERE user_id = ? AND character_id = ? AND count > 0'
      ).get(toUserId, requestCharacterId);

      if (!recipientItem) {
        return res.status(400).json({ error: "They don't own that character" });
      }
    }

    // Check for astronomical — only owner can send
    const offerChar = db.prepare('SELECT rarity FROM characters WHERE id = ?').get(offerCharacterId);
    if (offerChar && offerChar.rarity === 'astronomical') {
      const sender = db.prepare('SELECT is_owner FROM users WHERE id = ?').get(req.session.userId);
      if (!sender || !sender.is_owner) {
        return res.status(403).json({ error: 'Only the owner can trade Astronomical characters' });
      }
    }

    const result = db.prepare(
      `INSERT INTO trades (from_user_id, to_user_id, from_character_id, to_character_id)
       VALUES (?, ?, ?, ?)`
    ).run(req.session.userId, toUserId, offerCharacterId, requestCharacterId || null);

    db.close();
    res.json({ success: true, tradeId: result.lastInsertRowid });
  } catch (e) {
    db.close();
    res.status(500).json({ error: e.message });
  }
});

// Get pending trades for current user
router.get('/pending', requireAuth, (req, res) => {
  const db = getDb();
  try {
    // Incoming offers
    const incoming = db.prepare(`
      SELECT t.id, t.from_user_id, t.to_character_id,
             u.username as from_username,
             fc.name as offer_name, fc.rarity as offer_rarity, fc.id as offer_char_id,
             rc.name as request_name, rc.rarity as request_rarity, rc.id as request_char_id
      FROM trades t
      JOIN users u ON t.from_user_id = u.id
      JOIN characters fc ON t.from_character_id = fc.id
      LEFT JOIN characters rc ON t.to_character_id = rc.id
      WHERE t.to_user_id = ? AND t.status = 'pending'
      ORDER BY t.created_at DESC
    `).all(req.session.userId);

    // Outgoing offers
    const outgoing = db.prepare(`
      SELECT t.id, t.to_user_id,
             u.username as to_username,
             fc.name as offer_name, fc.rarity as offer_rarity,
             rc.name as request_name, rc.rarity as request_rarity
      FROM trades t
      JOIN users u ON t.to_user_id = u.id
      JOIN characters fc ON t.from_character_id = fc.id
      LEFT JOIN characters rc ON t.to_character_id = rc.id
      WHERE t.from_user_id = ? AND t.status = 'pending'
      ORDER BY t.created_at DESC
    `).all(req.session.userId);

    res.json({ incoming, outgoing });
  } finally {
    db.close();
  }
});

// Accept a trade
router.post('/:id/accept', requireAuth, (req, res) => {
  const tradeId = parseInt(req.params.id);
  const db = getDb();
  try {
    const trade = db.prepare('SELECT * FROM trades WHERE id = ? AND status = ?').get(tradeId, 'pending');

    if (!trade) {
      return res.status(404).json({ error: 'Trade not found or already resolved' });
    }

    if (trade.to_user_id !== req.session.userId) {
      return res.status(403).json({ error: 'Not your trade to accept' });
    }

    // Verify both sides still have the characters
    const fromItem = db.prepare(
      'SELECT * FROM inventory WHERE user_id = ? AND character_id = ? AND count > 0'
    ).get(trade.from_user_id, trade.from_character_id);

    if (!fromItem) {
      db.prepare("UPDATE trades SET status = 'cancelled' WHERE id = ?").run(tradeId);
      db.close();
      return res.status(400).json({ error: 'Sender no longer has that character. Trade cancelled.' });
    }

    if (trade.to_character_id) {
      const toItem = db.prepare(
        'SELECT * FROM inventory WHERE user_id = ? AND character_id = ? AND count > 0'
      ).get(trade.to_user_id, trade.to_character_id);

      if (!toItem) {
        db.prepare("UPDATE trades SET status = 'cancelled' WHERE id = ?").run(tradeId);
        db.close();
        return res.status(400).json({ error: 'You no longer have the requested character. Trade cancelled.' });
      }
    }

    // Execute the swap
    // Remove from sender, add to recipient (carry potassium from sender's card)
    const removeFromSender = db.prepare('UPDATE inventory SET count = count - 1 WHERE user_id = ? AND character_id = ?');
    const addToUser = function(userId, charId, fromUserId) {
      const existing = db.prepare('SELECT id FROM inventory WHERE user_id = ? AND character_id = ?').get(userId, charId);
      if (existing) {
        db.prepare('UPDATE inventory SET count = count + 1 WHERE id = ?').run(existing.id);
      } else {
        // Carry the potassium level from the sender's copy
        const senderEntry = db.prepare('SELECT potassium_level FROM inventory WHERE user_id = ? AND character_id = ?').get(fromUserId, charId);
        const potassium = senderEntry ? senderEntry.potassium_level : 0;
        db.prepare('INSERT INTO inventory (user_id, character_id, potassium_level) VALUES (?, ?, ?)').run(userId, charId, potassium);
      }
    };

    // Sender's character → Recipient (read potassium before decrementing)
    addToUser(trade.to_user_id, trade.from_character_id, trade.from_user_id);
    removeFromSender.run(trade.from_user_id, trade.from_character_id);

    // If two-way trade, Recipient's character → Sender
    if (trade.to_character_id) {
      addToUser(trade.from_user_id, trade.to_character_id, trade.to_user_id);
      removeFromSender.run(trade.to_user_id, trade.to_character_id);
    }

    // Clean up zero-count inventory rows
    db.prepare('DELETE FROM inventory WHERE count <= 0').run();

    // Mark trade as accepted
    db.prepare("UPDATE trades SET status = 'accepted' WHERE id = ?").run(tradeId);

    db.close();
    res.json({ success: true });
  } catch (e) {
    db.close();
    res.status(500).json({ error: e.message });
  }
});

// Decline a trade
router.post('/:id/decline', requireAuth, (req, res) => {
  const tradeId = parseInt(req.params.id);
  const db = getDb();
  try {
    const trade = db.prepare('SELECT * FROM trades WHERE id = ? AND status = ?').get(tradeId, 'pending');
    if (!trade) {
      return res.status(404).json({ error: 'Trade not found' });
    }
    if (trade.to_user_id !== req.session.userId) {
      return res.status(403).json({ error: 'Not your trade to decline' });
    }
    db.prepare("UPDATE trades SET status = 'declined' WHERE id = ?").run(tradeId);
    db.close();
    res.json({ success: true });
  } catch (e) {
    db.close();
    res.status(500).json({ error: e.message });
  }
});

// Cancel an outgoing trade
router.post('/:id/cancel', requireAuth, (req, res) => {
  const tradeId = parseInt(req.params.id);
  const db = getDb();
  try {
    const trade = db.prepare('SELECT * FROM trades WHERE id = ? AND status = ?').get(tradeId, 'pending');
    if (!trade) {
      return res.status(404).json({ error: 'Trade not found' });
    }
    if (trade.from_user_id !== req.session.userId) {
      return res.status(403).json({ error: 'Not your trade to cancel' });
    }
    db.prepare("UPDATE trades SET status = 'cancelled' WHERE id = ?").run(tradeId);
    db.close();
    res.json({ success: true });
  } catch (e) {
    db.close();
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
