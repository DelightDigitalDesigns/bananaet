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

// Add custom words to filter if needed
// filter.addWords('customword1', 'customword2');

function setupChat(io) {
  io.use((socket, next) => {
    const session = socket.request.session;
    if (session && session.userId) {
      socket.userId = session.userId;
      socket.username = session.username;
      socket.isOwner = session.isOwner;
      next();
    } else {
      next(new Error('Not authenticated'));
    }
  });

  io.on('connection', (socket) => {
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
      } finally { db2.close(); }

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

    // Online users list
    socket.on('get_online', () => {
      const mainRoom = io.sockets.adapter.rooms.get('main');
      const users = [];
      if (mainRoom) {
        for (const id of mainRoom) {
          const s = io.sockets.sockets.get(id);
          if (s) users.push({ username: s.username, isOwner: s.isOwner });
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

module.exports = { setupChat };
