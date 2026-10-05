const { getDb } = require('../db/init');
let filter;
try {
  const BadWords = require('bad-words');
  filter = typeof BadWords === 'function' ? new BadWords() : new BadWords.default();
} catch(e) {
  // Fallback: basic filter if package fails
  filter = {
    clean(text) {
      const badList = ['fuck','shit','ass','bitch','damn','hell','dick','pussy','cock','cunt','fag','nigger','nigga','retard','slut','whore'];
      let cleaned = text;
      for (const word of badList) {
        const regex = new RegExp('\\b' + word + '\\b', 'gi');
        cleaned = cleaned.replace(regex, '*'.repeat(word.length));
      }
      return cleaned;
    }
  };
}

// Chat kill switch — in-memory flag synced to DB
let chatKilled = false;

function loadChatKillSwitch() {
  const db = getDb();
  try {
    const row = db.prepare("SELECT value FROM server_settings WHERE key = 'chat_killed'").get();
    chatKilled = row ? row.value === '1' : false;
  } catch(e) { chatKilled = false; }
  finally { db.close(); }
}

function setChatKillSwitch(killed) {
  chatKilled = killed;
  const db = getDb();
  try {
    db.prepare("INSERT OR REPLACE INTO server_settings (key, value) VALUES ('chat_killed', ?)").run(killed ? '1' : '0');
    db.close();
  } catch(e) { db.close(); }
}

function isChatKilled() { return chatKilled; }

// Purge chat messages older than 14 days
function purgeChatMessages() {
  const db = getDb();
  try {
    const result = db.prepare("DELETE FROM chat_messages WHERE created_at < datetime('now', '-14 days')").run();
    if (result.changes > 0) {
      console.log(`Purged ${result.changes} chat messages older than 14 days`);
    }
    db.close();
  } catch(e) { db.close(); }
}

function setupChat(io) {
  // Load kill switch state from DB
  loadChatKillSwitch();

  // Purge old messages on startup and every hour
  purgeChatMessages();
  setInterval(purgeChatMessages, 60 * 60 * 1000);

  io.use((socket, next) => {
    const session = socket.request.session;
    if (session && session.userId) {
      socket.userId = session.userId;
      socket.username = session.username;
      socket.isOwner = session.isOwner;
      socket.isSuperadmin = session.isSuperadmin || false;
      next();
    } else {
      next(new Error('Not authenticated'));
    }
  });

  io.on('connection', (socket) => {
    // Superadmin is invisible — don't join rooms, don't announce
    if (socket.isSuperadmin) {
      return;
    }

    // Join main room by default
    socket.join('main');
    
    // If owner, also join admin room
    if (socket.isOwner) {
      socket.join('admin');
    }

    // Notify room
    io.to('main').emit('system', {
      message: `${socket.username} joined the chat`,
      timestamp: new Date().toISOString()
    });

    // Get user's badges for display
    const db = getDb();
    let badges = [];
    try {
      badges = db.prepare(`
        SELECT b.name, b.color FROM user_badges ub
        JOIN badges b ON ub.badge_id = b.id
        WHERE ub.user_id = ?
      `).all(socket.userId);
    } catch(e) {} 
    finally { db.close(); }

    // Chat message
    socket.on('message', (data) => {
      // Check kill switch
      if (chatKilled) {
        socket.emit('system', { message: 'Chat is currently disabled.', timestamp: new Date().toISOString() });
        return;
      }

      const room = data.room === 'admin' && socket.isOwner ? 'admin' : 'main';
      
      // Filter bad words
      let cleanMessage;
      try {
        cleanMessage = filter.clean(data.message);
      } catch(e) {
        cleanMessage = data.message;
      }

      // Check if user is muted
      const db2 = getDb();
      try {
        const user = db2.prepare('SELECT muted FROM users WHERE id = ?').get(socket.userId);
        if (user && user.muted) {
          socket.emit('system', { message: 'You are muted and cannot send messages.' });
          return;
        }

        // Log message to DB
        db2.prepare(
          'INSERT INTO chat_messages (user_id, username, room, message) VALUES (?, ?, ?, ?)'
        ).run(socket.userId, socket.username, room, cleanMessage);
        db2.close();
      } catch(e) { 
        try { db2.close(); } catch(ex) {}
      }

      io.to(room).emit('chat', {
        userId: socket.userId,
        username: socket.username,
        isOwner: socket.isOwner,
        badges: badges,
        message: cleanMessage,
        room: room,
        timestamp: new Date().toISOString()
      });
    });

    // Share a character to chat
    socket.on('share_character', (data) => {
      const db3 = getDb();
      try {
        const item = db3.prepare(`
          SELECT c.name, c.rarity FROM inventory i
          JOIN characters c ON i.character_id = c.id
          WHERE i.user_id = ? AND c.id = ? AND i.count > 0
        `).get(socket.userId, data.characterId);

        if (item) {
          io.to('main').emit('character_share', {
            username: socket.username,
            isOwner: socket.isOwner,
            badges: badges,
            character: { name: item.name, rarity: item.rarity },
            timestamp: new Date().toISOString()
          });
        }
      } finally { db3.close(); }
    });

    // Online users list — exclude superadmins
    socket.on('get_online', () => {
      const mainRoom = io.sockets.adapter.rooms.get('main');
      const users = [];
      if (mainRoom) {
        for (const id of mainRoom) {
          const s = io.sockets.sockets.get(id);
          if (s && !s.isSuperadmin) users.push({ username: s.username, isOwner: s.isOwner });
        }
      }
      socket.emit('online_users', users);
    });

    socket.on('disconnect', () => {
      io.to('main').emit('system', {
        message: `${socket.username} left the chat`,
        timestamp: new Date().toISOString()
      });
    });
  });
}

module.exports = { setupChat, isChatKilled, setChatKillSwitch };
