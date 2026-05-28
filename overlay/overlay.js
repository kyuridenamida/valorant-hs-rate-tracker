// HS Tracker - Overlay Script

const GAUGE_CIRCUMFERENCE = 314.16; // 2π × r=50
const THRESHOLD = (typeof CONFIG !== 'undefined' && CONFIG.HS_THRESHOLD != null)
  ? CONFIG.HS_THRESHOLD
  : 50;

// DOM refs
const gaugeArc     = document.getElementById('gauge-arc');
const gaugeGlow    = document.getElementById('gauge-glow');
const gaugePct     = document.getElementById('gauge-pct');
const statKills    = document.getElementById('stat-kills');
const statHs       = document.getElementById('stat-hs');
const statRate     = document.getElementById('stat-rate');
const killFeed     = document.getElementById('kill-feed');
const modeBadge    = document.getElementById('mode-badge');
const dangerBanner = document.getElementById('danger-banner');
const app          = document.getElementById('app');

let currentIsDanger = false;

// Overwolf からのメッセージ受信
overwolf.windows.onMessageReceived.addListener(msg => {
  if (msg.id !== 'stats') return;
  try {
    const data = JSON.parse(msg.content);
    dispatch(data);
  } catch (e) {
    console.error('Overlay parse error:', e);
  }
});

function dispatch(data) {
  switch (data.type) {
    case 'stats_update':
      updateUI(data.stats, data.lastKill);
      break;
    case 'reset':
      resetUI();
      break;
    case 'match_start':
      resetUI();
      modeBadge.textContent = 'DM';
      modeBadge.style.color = '#00d4ff';
      modeBadge.style.borderColor = 'rgba(0,212,255,0.3)';
      modeBadge.style.background = 'rgba(0,212,255,0.15)';
      break;
    case 'match_end':
      modeBadge.textContent = 'END';
      modeBadge.style.color = '#ffd700';
      if (data.stats) updateUI(data.stats, null);
      break;
    case 'mode_change':
      modeBadge.textContent = data.isDeathmatch ? 'DM' : 'LIVE';
      break;
  }
}

function updateUI(stats, lastKill) {
  const hsRate = parseFloat(stats.hsRate) || 0;
  const hasKills = stats.totalKills > 0;

  // 数値更新
  statKills.textContent = stats.totalKills;
  statHs.textContent    = stats.hsKills;
  statRate.textContent  = hsRate.toFixed(1) + '%';

  // 円形ゲージ + DANGER/SAFE 状態
  updateGauge(hsRate, hasKills);

  // キルフィード更新
  if (lastKill) {
    addKillEntry(lastKill);
  }

  // 点滅エフェクト
  triggerFlash();
}

function updateGauge(hsRate, hasKills) {
  const offset = GAUGE_CIRCUMFERENCE * (1 - hsRate / 100);

  gaugeArc.style.strokeDashoffset  = offset;
  gaugeGlow.style.strokeDashoffset = offset;
  gaugePct.textContent = hsRate.toFixed(1) + '%';

  // キルがまだない場合はニュートラル（シアン）のまま
  if (!hasKills) {
    const neutral = '#00d4ff';
    gaugeArc.style.stroke  = neutral;
    gaugeGlow.style.stroke = neutral;
    gaugePct.style.fill    = neutral;
    setDangerState(false, false);
    return;
  }

  const isDanger = hsRate < THRESHOLD;
  const color = isDanger ? '#ff4757' : '#2ed573';

  gaugeArc.style.stroke  = color;
  gaugeGlow.style.stroke = color;
  gaugePct.style.fill    = color;

  setDangerState(isDanger, true);
}

function setDangerState(isDanger, active) {
  if (!active) {
    app.classList.remove('is-danger', 'is-safe');
    dangerBanner.classList.remove('visible');
    currentIsDanger = false;
    return;
  }

  currentIsDanger = isDanger;

  if (isDanger) {
    app.classList.add('is-danger');
    app.classList.remove('is-safe');
    dangerBanner.classList.add('visible');
  } else {
    app.classList.add('is-safe');
    app.classList.remove('is-danger');
    dangerBanner.classList.remove('visible');
  }
}

function addKillEntry(kill) {
  // 「waiting」プレースホルダーを除去
  const empty = killFeed.querySelector('.kill-feed-empty');
  if (empty) empty.remove();

  const entry = document.createElement('div');
  entry.className = 'kill-entry ' + (kill.headshot ? 'is-hs' : 'is-normal');

  entry.innerHTML = `
    <div class="kill-dot"></div>
    <div class="kill-weapon">${escapeHtml(kill.weapon)}</div>
    ${kill.headshot ? '<div class="kill-hs-tag">HS</div>' : ''}
  `;

  killFeed.insertBefore(entry, killFeed.firstChild);

  // MAX_RECENT_KILLS 件を超えたら古いものを削除
  const entries = killFeed.querySelectorAll('.kill-entry');
  if (entries.length > 6) {
    entries[entries.length - 1].remove();
  }
}

function resetUI() {
  statKills.textContent = '0';
  statHs.textContent    = '0';
  statRate.textContent  = '0.0%';
  updateGauge(0, false);
  killFeed.innerHTML = '<div class="kill-feed-empty">— waiting for kills —</div>';
}

function triggerFlash() {
  const cls = currentIsDanger ? 'flash-danger' : 'flash-safe';
  app.classList.remove('flash-safe', 'flash-danger');
  void app.offsetWidth;
  app.classList.add(cls);
  setTimeout(() => app.classList.remove(cls), 400);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
