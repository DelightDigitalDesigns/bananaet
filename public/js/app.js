// Screen management
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showRegister() {
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('register-form').style.display = 'flex';
  document.getElementById('auth-error').textContent = '';
}

function showLogin() {
  document.getElementById('register-form').style.display = 'none';
  document.getElementById('login-form').style.display = 'flex';
  document.getElementById('auth-error').textContent = '';
}

function showError(msg) {
  document.getElementById('auth-error').textContent = msg;
}

// Auth
async function register() {
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;
  const inviteCode = document.getElementById('reg-invite').value.trim();

  if (!username || !password || !inviteCode) {
    return showError('Fill in all fields');
  }

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, inviteCode })
    });
    const data = await res.json();

    if (!res.ok) {
      return showError(data.error);
    }

    enterDashboard(data.user, 0);
  } catch (err) {
    showError('Connection error');
  }
}

async function login() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  if (!username || !password) {
    return showError('Enter your username and password');
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (!res.ok) {
      return showError(data.error);
    }

    enterDashboard(data.user, data.dailyBonus);
  } catch (err) {
    showError('Connection error');
  }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  showScreen('auth-screen');
}

function enterDashboard(user, dailyBonus) {
  currentBananas = user.bananas;
  currentUserId = user.id;
  isOwnerUser = user.isOwner;
  document.getElementById('display-username').textContent = user.username;
  document.getElementById('display-bananas').textContent = '🍌 ' + user.bananas.toLocaleString();

  // Show admin tab for owner
  if (user.isOwner) {
    document.getElementById('admin-tab').style.display = 'inline-block';
  }

  if (dailyBonus > 0) {
    document.getElementById('bonus-amount').textContent = dailyBonus.toLocaleString();
    document.getElementById('daily-bonus-banner').style.display = 'block';
    setTimeout(() => {
      document.getElementById('daily-bonus-banner').style.display = 'none';
    }, 5000);
  } else {
    document.getElementById('daily-bonus-banner').style.display = 'none';
  }

  showScreen('dashboard-screen');
  loadPacks();
}

// Tabs
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector(`.tab[onclick="switchTab('${tab}')"]`).classList.add('active');
  document.getElementById(`tab-${tab}`).classList.add('active');

  if (tab === 'shop') loadPacks();
  if (tab === 'inventory') loadInventory();
  if (tab === 'craft') loadCrafting();
  if (tab === 'trade') loadTrading();
  if (tab === 'chat') loadChat();
  if (tab === 'leaderboard') loadLeaderboard();
  if (tab === 'admin') loadAdmin();
}

// Rarity display helpers
const RARITY_LABELS = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
  chroma_shiny: 'Chroma ✨',
  chroma_rainbow: 'Chroma 🌈',
  mystical: 'Mystical',
  bananarang: 'Bananarang',
  astronomical: 'Astronomical'
};

const RARITY_EMOJIS = {
  common: '⬜',
  rare: '🔵',
  epic: '🟣',
  legendary: '🟡',
  chroma_shiny: '✨',
  chroma_rainbow: '🌈',
  mystical: '🔴',
  bananarang: '🍌',
  astronomical: '⭐'
};

// Shop
let currentBananas = 0;

async function loadPacks() {
  try {
    const res = await fetch('/api/packs');
    if (!res.ok) return;
    const packs = await res.json();

    const grid = document.getElementById('packs-grid');
    const icons = { 'Standard Pack': '📦', 'Premium Pack': '💎', 'Ultra Pack': '🔥' };
    const classes = { 'Standard Pack': 'standard', 'Premium Pack': 'premium', 'Ultra Pack': 'ultra' };

    grid.innerHTML = packs.map(pack => {
      const canAfford = currentBananas >= pack.cost;
      return `
        <div class="pack-card ${classes[pack.name] || ''} ${canAfford ? '' : 'disabled'}"
             onclick="${canAfford ? `openPackUI(${pack.id})` : ''}">
          <div class="pack-icon">${icons[pack.name] || '📦'}</div>
          <div class="pack-name">${pack.name}</div>
          <div class="pack-cost">🍌 ${pack.cost.toLocaleString()}</div>
          <div class="pack-max">Up to ${RARITY_LABELS[pack.max_rarity]}</div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to load packs', err);
  }
}

let pendingReveal = null;

async function openPackUI(packId) {
  const overlay = document.getElementById('pack-overlay');
  const openingText = document.getElementById('pack-opening-text');
  const swipePrompt = document.getElementById('swipe-prompt');
  const swipeCard = document.getElementById('swipe-card');
  const revealCard = document.getElementById('reveal-card');
  const closeBtn = document.getElementById('reveal-close');

  // Reset state
  overlay.style.display = 'flex';
  openingText.style.display = 'block';
  openingText.textContent = 'Opening...';
  openingText.style.animation = '';
  swipePrompt.style.display = 'none';
  revealCard.style.display = 'none';
  closeBtn.style.display = 'none';
  swipeCard.classList.remove('swiped', 'swiping');
  swipeCard.style.transform = '';

  try {
    const res = await fetch(`/api/packs/${packId}/open`, { method: 'POST' });
    const data = await res.json();

    if (!res.ok) {
      openingText.textContent = data.error;
      openingText.style.animation = 'none';
      closeBtn.style.display = 'inline-block';
      return;
    }

    // Update banana count
    currentBananas = data.newBalance;
    document.getElementById('display-bananas').textContent = '🍌 ' + currentBananas.toLocaleString();

    // Store result for after swipe
    pendingReveal = data;

    // Short pause then show swipe card
    await new Promise(r => setTimeout(r, 600));
    openingText.style.display = 'none';
    swipePrompt.style.display = 'flex';

  } catch (err) {
    openingText.textContent = 'Connection error';
    openingText.style.animation = 'none';
    closeBtn.style.display = 'inline-block';
  }
}

function showRevealCard() {
  if (!pendingReveal) return;
  const data = pendingReveal;
  pendingReveal = null;

  const swipePrompt = document.getElementById('swipe-prompt');
  const revealCard = document.getElementById('reveal-card');
  const closeBtn = document.getElementById('reveal-close');

  // Hide swipe, show reveal after a beat
  setTimeout(() => {
    swipePrompt.style.display = 'none';
    revealCard.style.display = 'block';
    revealCard.className = 'reveal-card glow-' + data.character.rarity;

    document.getElementById('reveal-rarity').textContent = RARITY_LABELS[data.character.rarity] || data.character.rarity;
    document.getElementById('reveal-rarity').className = 'reveal-rarity rarity-' + data.character.rarity;

    const revealImg = document.getElementById('reveal-img');
    const revealEmoji = document.getElementById('reveal-emoji');
    if (data.character.image_path) {
      revealImg.src = data.character.image_path;
      revealImg.alt = data.character.name;
      revealImg.style.display = 'block';
      revealEmoji.style.display = 'none';
    } else {
      revealImg.style.display = 'none';
      revealEmoji.style.display = 'block';
      revealEmoji.textContent = RARITY_EMOJIS[data.character.rarity] || '❓';
    }

    document.getElementById('reveal-name').textContent = data.character.name;

    closeBtn.style.display = 'inline-block';
  }, 350);
}

// Swipe handling
(function initSwipe() {
  let startY = 0;
  let currentY = 0;
  let isDragging = false;

  function getSwipeCard() {
    return document.getElementById('swipe-card');
  }

  function onStart(e) {
    const card = getSwipeCard();
    if (!card || card.classList.contains('swiped')) return;
    isDragging = true;
    card.classList.add('swiping');
    const point = e.touches ? e.touches[0] : e;
    startY = point.clientY;
    currentY = startY;
  }

  function onMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    const card = getSwipeCard();
    if (!card) return;
    const point = e.touches ? e.touches[0] : e;
    currentY = point.clientY;
    const deltaY = currentY - startY;
    // Only allow upward swipe
    if (deltaY < 0) {
      const rotation = deltaY * 0.03;
      card.style.transform = `translateY(${deltaY}px) rotate(${rotation}deg)`;
    }
  }

  function onEnd() {
    if (!isDragging) return;
    isDragging = false;
    const card = getSwipeCard();
    if (!card) return;
    card.classList.remove('swiping');

    const deltaY = currentY - startY;

    // Threshold: swipe up at least 80px
    if (deltaY < -80) {
      card.classList.add('swiped');
      card.style.transform = '';
      showRevealCard();
    } else {
      // Snap back
      card.style.transform = '';
    }
  }

  document.addEventListener('touchstart', e => {
    if (e.target.closest('.swipe-card')) onStart(e);
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (isDragging) onMove(e);
  }, { passive: false });

  document.addEventListener('touchend', onEnd);

  // Mouse fallback for desktop testing
  document.addEventListener('mousedown', e => {
    if (e.target.closest('.swipe-card')) onStart(e);
  });
  document.addEventListener('mousemove', e => {
    if (isDragging) onMove(e);
  });
  document.addEventListener('mouseup', onEnd);
})();

function closeReveal() {
  document.getElementById('pack-overlay').style.display = 'none';
  document.getElementById('pack-opening-text').style.animation = '';
  loadPacks(); // Refresh affordability
}

// Inventory
async function loadInventory() {
  try {
    const res = await fetch('/api/inventory');
    if (!res.ok) return;
    const data = await res.json();

    // Stats
    const statsEl = document.getElementById('inventory-stats');
    statsEl.innerHTML = `
      <div class="stat-box">
        <div class="stat-number">${data.stats.totalUnique}</div>
        <div class="stat-label">Unique</div>
      </div>
      <div class="stat-box">
        <div class="stat-number">${data.stats.totalCount}</div>
        <div class="stat-label">Total</div>
      </div>
      ${data.stats.rarestOwned ? `
      <div class="stat-box">
        <div class="stat-number">${RARITY_EMOJIS[data.stats.rarestOwned.rarity] || '?'}</div>
        <div class="stat-label">Rarest: ${data.stats.rarestOwned.name}</div>
      </div>` : ''}
    `;

    // Grid
    const gridEl = document.getElementById('inventory-grid');
    if (data.items.length === 0) {
      gridEl.innerHTML = '<p style="color:#888; text-align:center; margin-top:2rem;">No characters yet. Open some packs!</p>';
      return;
    }

    gridEl.innerHTML = data.items.map(item => `
      <div class="inv-card rarity-${item.rarity}">
        ${item.count > 1 ? `<div class="inv-count">x${item.count}</div>` : ''}
        ${item.image_path
          ? `<img class="inv-img" src="${item.image_path}" alt="${item.name}">`
          : `<div class="inv-emoji">${RARITY_EMOJIS[item.rarity] || '❓'}</div>`}
        <div class="inv-name">${item.name}</div>
        <div class="inv-rarity rarity-${item.rarity}">${RARITY_LABELS[item.rarity] || item.rarity}</div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load inventory', err);
  }
}

// ===== CHAT =====
let socket = null;
let currentRoom = 'main';
let isOwnerUser = false;

function initChat() {
  if (socket) return;
  socket = io();

  socket.on('chat', (data) => {
    if (data.room !== currentRoom) return;
    appendChatMessage(data);
  });

  socket.on('system', (data) => {
    const el = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'chat-msg system-msg';
    div.textContent = data.message;
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  });

  socket.on('character_share', (data) => {
    const el = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'chat-msg share-msg';
    const badgeHtml = (data.badges || []).map(b =>
      `<span class="msg-badge" style="background:${b.color};color:#000;">${b.name}</span>`
    ).join('');
    div.innerHTML = `
      <span class="msg-user ${data.isOwner ? 'msg-owner' : ''}">${data.username}</span>
      ${badgeHtml}
      shared: ${RARITY_EMOJIS[data.character.rarity]} <span class="rarity-${data.character.rarity}" style="font-weight:600;">${data.character.name}</span>
    `;
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  });

  socket.on('online_users', (users) => {
    document.getElementById('online-count').textContent = `${users.length} online`;
  });
}

function appendChatMessage(data) {
  const el = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg';
  const badgeHtml = (data.badges || []).map(b =>
    `<span class="msg-badge" style="background:${b.color};color:#000;">${b.name}</span>`
  ).join('');
  div.innerHTML = `
    <span class="msg-user ${data.isOwner ? 'msg-owner' : ''}">${data.username}</span>
    ${badgeHtml}
    <span class="msg-text">${escapeHtml(data.message)}</span>
  `;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function sendChat() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg || !socket) return;
  socket.emit('message', { message: msg, room: currentRoom });
  input.value = '';
}

function switchRoom(room) {
  currentRoom = room;
  document.querySelectorAll('.room-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.room-btn[onclick="switchRoom('${room}')"]`).classList.add('active');
  document.getElementById('chat-messages').innerHTML = '';
}

function loadChat() {
  initChat();
  if (socket) socket.emit('get_online');
  if (isOwnerUser) {
    document.getElementById('admin-room-btn').style.display = 'inline-block';
  }
}

// ===== ADMIN =====
async function loadAdmin() {
  loadAdminUsers();
  loadAdminBadges();
}

async function loadAdminUsers() {
  try {
    const res = await fetch('/api/admin/users');
    if (!res.ok) return;
    const users = await res.json();

    // Populate banana user select
    const bananaSelect = document.getElementById('admin-banana-user');
    const badgeUserSelect = document.getElementById('admin-badge-user');
    const opts = users.map(u => `<option value="${u.id}">${u.username} (🍌${u.bananas})</option>`).join('');
    bananaSelect.innerHTML = '<option value="">Select player...</option>' + opts;
    badgeUserSelect.innerHTML = '<option value="">Select player...</option>' + opts;

    // Users list
    const listEl = document.getElementById('admin-users-list');
    listEl.innerHTML = users.map(u => `
      <div class="admin-user-row">
        <div class="admin-user-info">
          <strong>${u.username}</strong> ${u.is_owner ? '👑' : ''}
          <span class="banana-inline">🍌 ${u.bananas.toLocaleString()}</span>
          ${u.banned ? ' <span style="color:#ef4444;">BANNED</span>' : ''}
          ${u.muted ? ' <span style="color:#f59e0b;">MUTED</span>' : ''}
        </div>
        ${!u.is_owner ? `
        <div class="admin-user-actions">
          <button onclick="adminToggleMute(${u.id}, ${u.muted ? 0 : 1})">${u.muted ? 'Unmute' : 'Mute'}</button>
          <button onclick="adminToggleBan(${u.id}, ${u.banned ? 0 : 1})" style="background:${u.banned ? '#10b981' : '#ef4444'};color:#fff;">${u.banned ? 'Unban' : 'Ban'}</button>
        </div>` : ''}
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load admin users', err);
  }
}

async function loadAdminBadges() {
  try {
    const res = await fetch('/api/admin/badges');
    if (!res.ok) return;
    const badges = await res.json();
    const select = document.getElementById('admin-badge-select');
    select.innerHTML = '<option value="">Select badge...</option>' +
      badges.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
  } catch (err) {}
}

async function adminSetBananas() {
  const userId = document.getElementById('admin-banana-user').value;
  const amount = parseInt(document.getElementById('admin-banana-amount').value);
  if (!userId || isNaN(amount)) return alert('Select a player and enter an amount');

  const res = await fetch('/api/admin/bananas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: parseInt(userId), amount })
  });
  const data = await res.json();
  if (res.ok) {
    alert(`${data.user.username} now has 🍌 ${data.user.bananas.toLocaleString()}`);
    loadAdminUsers();
    // Update own display if self
    if (parseInt(userId) === currentUserId) {
      currentBananas = data.user.bananas;
      document.getElementById('display-bananas').textContent = '🍌 ' + currentBananas.toLocaleString();
    }
  } else {
    alert(data.error);
  }
}

async function adminCreateInvite() {
  const code = document.getElementById('admin-invite-input').value.trim();
  if (!code) return;

  const res = await fetch('/api/admin/invite-codes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codes: [code] })
  });
  const data = await res.json();
  if (res.ok) {
    document.getElementById('admin-invite-result').textContent = `Created: ${data.created.join(', ')}`;
    document.getElementById('admin-invite-input').value = '';
  }
}

async function adminCreateBadge() {
  const name = document.getElementById('admin-badge-name').value.trim();
  const color = document.getElementById('admin-badge-color').value;
  if (!name) return;

  const res = await fetch('/api/admin/badges', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color })
  });
  if (res.ok) {
    document.getElementById('admin-badge-name').value = '';
    loadAdminBadges();
    alert('Badge created!');
  }
}

async function adminAssignBadge() {
  const userId = document.getElementById('admin-badge-user').value;
  const badgeId = document.getElementById('admin-badge-select').value;
  if (!userId || !badgeId) return alert('Select a player and a badge');

  const res = await fetch('/api/admin/badges/assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: parseInt(userId), badgeId: parseInt(badgeId) })
  });
  if (res.ok) alert('Badge assigned!');
}

async function adminToggleMute(userId, muted) {
  await fetch('/api/admin/mute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, muted })
  });
  loadAdminUsers();
}

async function adminToggleBan(userId, banned) {
  if (banned && !confirm('Ban this player?')) return;
  await fetch('/api/admin/ban', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, banned })
  });
  loadAdminUsers();
}

// ===== LEADERBOARD =====
async function loadLeaderboard() {
  try {
    const res = await fetch('/api/leaderboard');
    if (!res.ok) return;
    const data = await res.json();

    const el = document.getElementById('leaderboard-list');
    if (data.length === 0) {
      el.innerHTML = '<p style="color:#888;">No players yet.</p>';
      return;
    }

    const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };

    el.innerHTML = data.map(entry => `
      <div class="lb-row lb-rank-${entry.rank <= 3 ? entry.rank : 'other'}">
        <div class="lb-rank">${medals[entry.rank] || '#' + entry.rank}</div>
        <div class="lb-info">
          <div class="lb-username">${entry.username} ${entry.isOwner ? '👑' : ''}</div>
          <div class="lb-stats">${entry.totalUnique} unique · ${entry.totalCount} total${entry.rarestTier ? ' · Rarest: ' + (RARITY_LABELS[entry.rarestTier] || entry.rarestTier) : ''}</div>
        </div>
        <div>
          <div class="lb-score">${entry.score.toLocaleString()}</div>
          <div class="lb-score-label">score</div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load leaderboard', err);
  }
}

let currentUserId = null;

// ===== CRAFTING =====
async function loadCrafting(keepResult) {
  try {
    const res = await fetch('/api/crafting/available');
    if (!res.ok) return;
    const recipes = await res.json();

    const el = document.getElementById('craft-recipes');
    el.innerHTML = recipes.map(r => `
      <div class="craft-card">
        <div class="craft-info">
          <span class="craft-from rarity-${r.from}">${r.count}x ${RARITY_LABELS[r.from] || r.from}</span>
          <span class="craft-count">Have: ${r.have}</span>
        </div>
        <div class="craft-arrow">⬇</div>
        <div class="craft-info">
          <span class="craft-to rarity-${r.to}">1x ${RARITY_LABELS[r.to] || r.to}</span>
        </div>
        <button class="craft-btn" ${r.canCraft > 0 ? '' : 'disabled'} onclick="doCraft('${r.from}')">
          ${r.canCraft > 0 ? 'Craft' : 'Not enough'}
        </button>
      </div>
    `).join('');

    if (!keepResult) {
      document.getElementById('craft-result').style.display = 'none';
    }
  } catch (err) {
    console.error('Failed to load crafting', err);
  }
}

async function doCraft(fromRarity) {
  try {
    const res = await fetch('/api/crafting/craft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromRarity })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error);
      return;
    }

    const resultEl = document.getElementById('craft-result');
    resultEl.style.display = 'block';
    resultEl.innerHTML = `
      <div class="craft-result-title">🎉 You crafted a new character!</div>
      ${data.result.image_path
        ? `<img src="${data.result.image_path}" alt="${data.result.name}" class="craft-result-img">`
        : `<div style="font-size:3rem;margin:0.75rem 0;">${RARITY_EMOJIS[data.result.rarity] || '❓'}</div>`}
      <div class="rarity-${data.result.rarity}" style="font-weight:700;font-size:1.1rem;">${data.result.name}</div>
      <div class="rarity-${data.result.rarity}" style="font-size:0.85rem;text-transform:uppercase;font-weight:800;letter-spacing:1px;margin-top:0.25rem;">${RARITY_LABELS[data.result.rarity]}</div>
      <div style="color:#888;font-size:0.75rem;margin-top:0.5rem;">Used ${data.consumed.count} ${RARITY_LABELS[data.consumed.rarity]} cards</div>
    `;

    resultEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Refresh recipe counts but keep the result card visible
    loadCrafting(true);
  } catch (err) {
    alert('Crafting failed');
  }
}

// ===== TRADING =====
async function loadTrading() {
  loadTradeForm();
  loadPendingTrades();
}

async function loadTradeForm() {
  try {
    // Load users
    const usersRes = await fetch('/api/trades/users');
    if (usersRes.ok) {
      const users = await usersRes.json();
      const partnerSelect = document.getElementById('trade-partner');
      partnerSelect.innerHTML = '<option value="">Select player...</option>' +
        users.map(u => `<option value="${u.id}">${u.username}${u.is_owner ? ' 👑' : ''}</option>`).join('');

      partnerSelect.onchange = () => loadPartnerInventory(partnerSelect.value);
    }

    // Load own inventory for offer selection
    const invRes = await fetch('/api/inventory');
    if (invRes.ok) {
      const data = await invRes.json();
      const offerSelect = document.getElementById('trade-offer');
      offerSelect.innerHTML = '<option value="">Your character to offer...</option>' +
        data.items.map(i => `<option value="${i.id}">${i.name} (${RARITY_LABELS[i.rarity]}) x${i.count}</option>`).join('');
    }
  } catch (err) {
    console.error('Failed to load trade form', err);
  }
}

async function loadPartnerInventory(userId) {
  const requestSelect = document.getElementById('trade-request');
  requestSelect.innerHTML = '<option value="">Request back (optional)...</option>';

  if (!userId) return;

  try {
    const res = await fetch(`/api/inventory/user/${userId}`);
    if (res.ok) {
      const data = await res.json();
      requestSelect.innerHTML = '<option value="">Request back (optional)...</option>' +
        data.items.map(i => `<option value="${i.id}">${i.name} (${RARITY_LABELS[i.rarity]})</option>`).join('');
    }
  } catch (err) {
    console.error('Failed to load partner inventory', err);
  }
}

async function sendTradeOffer() {
  const toUserId = document.getElementById('trade-partner').value;
  const offerCharacterId = document.getElementById('trade-offer').value;
  const requestCharacterId = document.getElementById('trade-request').value;
  const errorEl = document.getElementById('trade-error');

  if (!toUserId || !offerCharacterId) {
    errorEl.textContent = 'Select a player and a character to offer';
    return;
  }

  try {
    const res = await fetch('/api/trades/offer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toUserId: parseInt(toUserId),
        offerCharacterId: parseInt(offerCharacterId),
        requestCharacterId: requestCharacterId ? parseInt(requestCharacterId) : null
      })
    });
    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error;
      return;
    }

    errorEl.textContent = '';
    loadPendingTrades();
    // Reset form
    document.getElementById('trade-partner').value = '';
    document.getElementById('trade-offer').value = '';
    document.getElementById('trade-request').innerHTML = '<option value="">Request back (optional)...</option>';
  } catch (err) {
    errorEl.textContent = 'Connection error';
  }
}

async function loadPendingTrades() {
  try {
    const res = await fetch('/api/trades/pending');
    if (!res.ok) return;
    const data = await res.json();

    // Incoming
    const inEl = document.getElementById('incoming-trades');
    if (data.incoming.length === 0) {
      inEl.innerHTML = '<p class="no-trades">No incoming offers</p>';
    } else {
      inEl.innerHTML = data.incoming.map(t => `
        <div class="trade-item">
          <div class="trade-details">
            <p><strong>${t.from_username}</strong> offers:</p>
            <p>${RARITY_EMOJIS[t.offer_rarity]} <span class="rarity-${t.offer_rarity}">${t.offer_name}</span></p>
            ${t.request_name ? `<p>Wants: ${RARITY_EMOJIS[t.request_rarity]} <span class="rarity-${t.request_rarity}">${t.request_name}</span></p>` : '<p style="color:#888;">Gift (no request)</p>'}
          </div>
          <div class="trade-actions">
            <button class="btn-accept" onclick="respondTrade(${t.id}, 'accept')">Accept</button>
            <button class="btn-decline" onclick="respondTrade(${t.id}, 'decline')">Decline</button>
          </div>
        </div>
      `).join('');
    }

    // Outgoing
    const outEl = document.getElementById('outgoing-trades');
    if (data.outgoing.length === 0) {
      outEl.innerHTML = '<p class="no-trades">No pending offers</p>';
    } else {
      outEl.innerHTML = data.outgoing.map(t => `
        <div class="trade-item">
          <div class="trade-details">
            <p>To: <strong>${t.to_username}</strong></p>
            <p>Offering: ${RARITY_EMOJIS[t.offer_rarity]} <span class="rarity-${t.offer_rarity}">${t.offer_name}</span></p>
            ${t.request_name ? `<p>Requesting: ${RARITY_EMOJIS[t.request_rarity]} <span class="rarity-${t.request_rarity}">${t.request_name}</span></p>` : '<p style="color:#888;">Gift</p>'}
          </div>
          <div class="trade-actions">
            <button class="btn-cancel" onclick="respondTrade(${t.id}, 'cancel')">Cancel</button>
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Failed to load trades', err);
  }
}

async function respondTrade(tradeId, action) {
  try {
    const res = await fetch(`/api/trades/${tradeId}/${action}`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error);
      return;
    }
    loadPendingTrades();
    loadTradeForm();
  } catch (err) {
    alert('Trade action failed');
  }
}

// Check if already logged in on page load
async function checkSession() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const user = await res.json();
      enterDashboard(user, 0);
    }
  } catch (err) {
    // Not logged in, stay on auth screen
  }
}

checkSession();
