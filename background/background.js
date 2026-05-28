// HS Tracker - Background Script
// VALORANT Game ID: 21640

const GAME_ID = 21640;

const WEAPON_NAMES = {
  'TX_Hud_Volcano': 'Vandal',
  'TX_Hud_Spectre': 'Spectre',
  'Vandal': 'Vandal',
  'Phantom': 'Phantom',
  'Operator': 'Operator',
  'Odin': 'Odin',
  'Ares': 'Ares',
  'Bulldog': 'Bulldog',
  'Guardian': 'Guardian',
  'Marshal': 'Marshal',
  'Outlaw': 'Outlaw',
  'Judge': 'Judge',
  'Bucky': 'Bucky',
  'Frenzy': 'Frenzy',
  'Classic': 'Classic',
  'Ghost': 'Ghost',
  'Sheriff': 'Sheriff',
  'Shorty': 'Shorty',
  'Stinger': 'Stinger',
  'Spectre': 'Spectre',
  'Melee': 'Knife',
};

let stats = {
  totalKills: 0,
  hsKills: 0,
  weaponStats: {},
  recentKills: [],
  matchActive: false,
  isDeathmatch: false,
  myName: null,
  sessionStart: null,
};

let overlayWindowId = null;
let periodicTimer = null;

// ── 起動 ──────────────────────────────────────────
overwolf.windows.getCurrentWindow(() => {
  init();
});

function init() {
  openOverlay();
  registerHotkeys();
  registerGameEvents();
  checkGameRunning();
}

// ── オーバーレイ ──────────────────────────────────
function openOverlay() {
  overwolf.windows.obtainDeclaredWindow('overlay', result => {
    if (!result.success) return;
    overlayWindowId = result.window.id;
    overwolf.windows.restore(overlayWindowId, () => {});
  });
}

function registerHotkeys() {
  overwolf.settings.hotkeys.onPressed.addListener(event => {
    if (event.name === 'toggle_overlay') toggleOverlay();
  });
}

function toggleOverlay() {
  if (!overlayWindowId) return;
  overwolf.windows.getWindowState(overlayWindowId, result => {
    const state = result.window_state_ex;
    if (state === 'normal' || state === 'maximized') {
      overwolf.windows.hide(overlayWindowId, () => {});
    } else {
      overwolf.windows.restore(overlayWindowId, () => {});
    }
  });
}

function sendToOverlay(message) {
  if (!overlayWindowId) return;
  overwolf.windows.sendMessage(overlayWindowId, 'stats', JSON.stringify(message), () => {});
}

// ── ゲームイベント ────────────────────────────────
function checkGameRunning() {
  overwolf.games.getRunningGameInfo(info => {
    if (info && Math.floor(info.id / 10) === GAME_ID) {
      setupFeatures();
    }
  });
}

function registerGameEvents() {
  overwolf.games.onGameInfoUpdated.addListener(info => {
    if (!info || !info.gameInfo) return;
    if (Math.floor(info.gameInfo.id / 10) === GAME_ID && info.gameInfo.isRunning) {
      setupFeatures();
    } else if (!info.gameInfo.isRunning) {
      handleGameStop();
    }
  });

  overwolf.games.events.onNewEvents.addListener(handleNewEvents);
  overwolf.games.events.onInfoUpdates2.addListener(handleInfoUpdates);
  overwolf.games.events.onError.addListener(err => {
    console.error('Game events error:', err);
    // 再試行
    setTimeout(setupFeatures, 5000);
  });
}

function setupFeatures() {
  const features = ['kill', 'match_info', 'me'];
  overwolf.games.events.setRequiredFeatures(features, result => {
    if (!result.success) {
      console.warn('setRequiredFeatures failed, retrying...', result);
      setTimeout(() => setupFeatures(), 3000);
    }
  });
}

function handleGameStop() {
  resetStats();
  stopPeriodicSend();
}

// ── イベント処理 ──────────────────────────────────
function handleInfoUpdates(info) {
  if (!info || !info.info) return;

  if (info.info.me) {
    if (info.info.me.player_name) {
      stats.myName = info.info.me.player_name;
    }
  }

  if (info.info.match_info) {
    const mi = info.info.match_info;

    if (mi.game_mode !== undefined) {
      const isDM = String(mi.game_mode).toLowerCase().includes('deathmatch');
      if (isDM !== stats.isDeathmatch) {
        stats.isDeathmatch = isDM;
        sendToOverlay({ type: 'mode_change', isDeathmatch: isDM });
      }
    }

    if (mi.round_report !== undefined) {
      try {
        const report = typeof mi.round_report === 'string'
          ? JSON.parse(mi.round_report)
          : mi.round_report;
        onMatchEnd(report);
      } catch (e) {}
    }
  }
}

function handleNewEvents({ events }) {
  for (const event of events) {
    switch (event.name) {
      case 'kill_feed':
        handleKillFeed(event.data);
        break;
      case 'match_start':
        onMatchStart();
        break;
      case 'match_end':
        onMatchEnd(null);
        break;
    }
  }
}

function handleKillFeed(rawData) {
  let data;
  try {
    data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
  } catch (e) {
    return;
  }

  if (!isMyKill(data.attacker)) return;

  const weaponRaw = data.weapon || 'Unknown';
  const weapon = WEAPON_NAMES[weaponRaw] || weaponRaw;
  const headshot = !!data.headshot;

  stats.totalKills++;
  if (headshot) stats.hsKills++;

  if (!stats.weaponStats[weapon]) {
    stats.weaponStats[weapon] = { kills: 0, hsKills: 0 };
  }
  stats.weaponStats[weapon].kills++;
  if (headshot) stats.weaponStats[weapon].hsKills++;

  const killEntry = {
    weapon,
    headshot,
    victim: data.victim || '???',
    time: Date.now(),
  };
  stats.recentKills.unshift(killEntry);
  if (stats.recentKills.length > CONFIG.MAX_RECENT_KILLS) {
    stats.recentKills.pop();
  }

  const hsRate = calcHsRate();

  sendToOverlay({
    type: 'stats_update',
    stats: buildStatsPayload(hsRate),
    lastKill: killEntry,
  });

  if (CONFIG.WEBHOOK_EVENTS.ON_KILL) {
    sendWebhook('kill', {
      kill: killEntry,
      stats: { totalKills: stats.totalKills, hsKills: stats.hsKills, hsRate },
    });
  }
}

function isMyKill(attacker) {
  if (!attacker) return false;
  if (attacker === 'Me') return true;
  if (stats.myName && attacker === stats.myName) return true;
  return false;
}

function calcHsRate() {
  if (stats.totalKills === 0) return 0;
  return parseFloat((stats.hsKills / stats.totalKills * 100).toFixed(1));
}

function buildStatsPayload(hsRate) {
  return {
    totalKills: stats.totalKills,
    hsKills: stats.hsKills,
    hsRate: hsRate !== undefined ? hsRate : calcHsRate(),
    weaponStats: stats.weaponStats,
    recentKills: stats.recentKills,
    isDeathmatch: stats.isDeathmatch,
  };
}

// ── マッチライフサイクル ───────────────────────────
function onMatchStart() {
  resetStats();
  stats.matchActive = true;
  stats.sessionStart = new Date().toISOString();
  sendToOverlay({ type: 'match_start' });

  if (CONFIG.WEBHOOK_EVENTS.PERIODIC) {
    startPeriodicSend();
  }
}

function onMatchEnd(roundReport) {
  stats.matchActive = false;
  stopPeriodicSend();

  const payload = {
    stats: buildStatsPayload(),
    sessionStart: stats.sessionStart,
    sessionEnd: new Date().toISOString(),
  };
  if (roundReport) payload.roundReport = roundReport;

  if (CONFIG.WEBHOOK_EVENTS.ON_MATCH_END) {
    sendWebhook('match_end', payload);
  }

  sendToOverlay({ type: 'match_end', stats: buildStatsPayload() });
}

function resetStats() {
  stats.totalKills = 0;
  stats.hsKills = 0;
  stats.weaponStats = {};
  stats.recentKills = [];
  stats.matchActive = false;
  stats.sessionStart = null;
  sendToOverlay({ type: 'reset' });
}

// ── 定期送信 ──────────────────────────────────────
function startPeriodicSend() {
  stopPeriodicSend();
  periodicTimer = setInterval(() => {
    sendWebhook('periodic', { stats: buildStatsPayload() });
  }, CONFIG.PERIODIC_INTERVAL_SEC * 1000);
}

function stopPeriodicSend() {
  if (periodicTimer) {
    clearInterval(periodicTimer);
    periodicTimer = null;
  }
}

// ── Webhook ───────────────────────────────────────
async function sendWebhook(event, data) {
  const url = CONFIG.WEBHOOK_URL;
  if (!url || url === 'YOUR_WEBHOOK_URL_HERE') return;

  const body = {
    event,
    timestamp: new Date().toISOString(),
    game: 'VALORANT',
    mode: stats.isDeathmatch ? 'deathmatch' : 'unknown',
    ...data,
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn('Webhook response:', res.status);
    }
  } catch (e) {
    console.error('Webhook send error:', e);
  }
}
