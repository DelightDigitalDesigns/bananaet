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
  const inviteCode = document.getElementById('reg-invite').value.trim();

  if (!username || !inviteCode) {
    return showError('Fill in both fields');
  }

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, inviteCode })
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

  if (!username) {
    return showError('Enter your username');
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
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
  document.getElementById('display-username').textContent = user.username;
  document.getElementById('display-bananas').textContent = '🍌 ' + user.bananas.toLocaleString();

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
    document.getElementById('reveal-emoji').textContent = RARITY_EMOJIS[data.character.rarity] || '❓';
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
        <div class="inv-emoji">${RARITY_EMOJIS[item.rarity] || '❓'}</div>
        <div class="inv-name">${item.name}</div>
        <div class="inv-rarity rarity-${item.rarity}">${RARITY_LABELS[item.rarity] || item.rarity}</div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load inventory', err);
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
