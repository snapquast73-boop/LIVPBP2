(function (global) {
  'use strict';

  let currentDate = UI.todayStr();
  let currentTab = 'all';
  let feedItems = [];
  let countdown = 30;
  let soundOn = localStorage.getItem('livpbp_sound') === '1';
  let notifyOn = localStorage.getItem('livpbp_notify') === '1';

  function init() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('date')) currentDate = params.get('date');

    feedItems = FeedLog.loadDate(currentDate);
    syncDateUI();
    bindControls();
    renderAll();
    scanSchedule();

    setInterval(() => {
      countdown -= 1;
      if (countdown <= 0) {
        countdown = 30;
        scanSchedule();
      }
      const cdEl = document.getElementById('countdown');
      if (cdEl) cdEl.textContent = `${countdown}s`;
    }, 1000);
  }

  function syncDateUI() {
    const picker = document.getElementById('date-picker');
    const label = document.getElementById('date-label');
    if (picker) picker.value = currentDate;
    if (label) label.textContent = UI.formatDateLabel(currentDate);
  }

  function bindControls() {
    const soundBtn = document.getElementById('sound-toggle-btn');
    const notifyBtn = document.getElementById('notify-toggle-btn');
    const refreshBtn = document.getElementById('refresh-btn');

    const updateButtons = () => {
      if (soundBtn) soundBtn.textContent = soundOn ? '🔊 Sound On' : '🔇 Sound Off';
      if (notifyBtn) notifyBtn.textContent = notifyOn ? '🔴 Run Alerts On' : '⚪ Run Alerts Off';
    };
    updateButtons();

    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        soundOn = !soundOn;
        localStorage.setItem('livpbp_sound', soundOn ? '1' : '0');
        updateButtons();
      });
    }
    if (notifyBtn) {
      notifyBtn.addEventListener('click', async () => {
        if (!notifyOn && 'Notification' in window && Notification.permission === 'default') {
          await Notification.requestPermission();
        }
        notifyOn = !notifyOn;
        localStorage.setItem('livpbp_notify', notifyOn ? '1' : '0');
        updateButtons();
      });
    }
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        countdown = 30;
        scanSchedule();
      });
    }
  }

  async function scanSchedule() {
    const statusLine = document.getElementById('status-line');
    if (statusLine) statusLine.textContent = 'Scanning games for reviews & challenges…';
    try {
      const sched = await MLBAPI.getSchedule(currentDate);
      const dates = sched.dates || [];
      const games = dates.length ? (dates[0].games || []) : [];
      const activeOrFinal = games.filter((g) => g.status && g.status.abstractGameState !== 'Preview');

      const feeds = await Promise.all(
        activeOrFinal.map((g) => MLBAPI.getGameLive(g.gamePk).catch(() => null))
      );

      const collected = [];
      feeds.forEach((f) => {
        if (f) collected.push(...Reviews.extractGameReviews(f));
      });

      const byId = new Map();
      feedItems.forEach((item) => byId.set(item.id, item));
      collected.forEach((item) => byId.set(item.id, item));
      feedItems = Array.from(byId.values()).sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
      FeedLog.saveDate(currentDate, feedItems);

      renderAll();
      if (statusLine) {
        statusLine.textContent = `Updated ${new Date().toLocaleTimeString()} · Scanned ${activeOrFinal.length} game(s)`;
      }
    } catch (err) {
      console.error(err);
      if (statusLine) statusLine.textContent = `Error scanning schedule: ${err.message}`;
    }
  }

  function renderAll() {
    renderBanner();
    renderStats();
    renderTabs();
    renderFeed();
  }

  function renderBanner() {
    const el = document.getElementById('banner');
    if (!el) return;
    const atRisk = feedItems.filter((i) => i.runsAtRisk > 0 && i.inProgress);
    el.innerHTML = atRisk.length
      ? `<div class="banner-box">⚠️ <strong>Runs at Risk:</strong> ${atRisk.map((i) => `${i.awayAbbr} @ ${i.homeAbbr} (${i.runsAtRisk})`).join(', ')}</div>`
      : '';
  }

  function renderStats() {
    const el = document.getElementById('feed-stats');
    if (!el) return;
    const nonAbs = feedItems.filter((i) => i.category !== 'abs');
    const absCount = feedItems.filter((i) => i.category === 'abs').length;
    const activeCount = feedItems.filter((i) => i.inProgress).length;
    const riskCount = feedItems.filter((i) => i.runsAtRisk > 0).length;

    el.innerHTML = `
      <div class="stat-box"><div class="stat-val">${nonAbs.length}</div><div class="stat-lbl">Reviews & Challenges</div></div>
      <div class="stat-box"><div class="stat-val">${absCount}</div><div class="stat-lbl">ABS Challenges</div></div>
      <div class="stat-box"><div class="stat-val">${activeCount}</div><div class="stat-lbl">Under Review</div></div>
      <div class="stat-box"><div class="stat-val">${riskCount}</div><div class="stat-lbl">Runs at Risk</div></div>
    `;
  }

  function renderTabs() {
    const el = document.getElementById('feed-tabs');
    if (!el) return;
    const tabs = [
      { id: 'all', label: 'All' },
      { id: 'abs', label: 'ABS' },
      { id: 'challenge', label: 'Challenges' },
      { id: 'review', label: 'Reviews' },
      { id: 'boundary', label: 'Boundary Calls' },
      { id: 'active', label: 'Under Review' },
      { id: 'risk', label: '⚠️ Runs at Risk' },
    ];
    el.innerHTML = tabs
      .map((t) => `<button class="tab-btn ${currentTab === t.id ? 'tab-on' : ''}" data-tab="${t.id}">${t.label}</button>`)
      .join('');
    el.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentTab = btn.dataset.tab;
        renderTabs();
        renderFeed();
      });
    });
  }

  function renderFeed() {
    const el = document.getElementById('feed-list');
    if (!el) return;
    const filtered = feedItems.filter((i) => {
      if (currentTab === 'all') return i.category !== 'abs';
      if (currentTab === 'active') return i.inProgress;
      if (currentTab === 'risk') return i.runsAtRisk > 0;
      return i.category === currentTab;
    });

    if (!filtered.length) {
      el.innerHTML = '<div class="empty-state">No matching review events for this date/filter.</div>';
      return;
    }

    el.innerHTML = filtered.map((i) => `
      <article class="feed-card ${i.runsAtRisk > 0 ? 'risk' : ''}">
        <div class="feed-card-head">
          <div>
            <strong>${UI.esc(i.awayAbbr)} @ ${UI.esc(i.homeAbbr)}</strong>
            <span style="color:var(--muted);">· ${UI.esc(i.halfInning || '')} ${i.inning || ''} · ${UI.esc(i.label)}</span>
          </div>
          <div>
            ${i.runsAtRisk > 0 ? `<span class="pill pill-risk">⚠️ ${i.runsAtRisk} Run(s) at Risk</span>` : ''}
            <span class="pill ${i.inProgress ? 'pill-review' : 'pill-final'}">${UI.esc(i.outcome)}</span>
          </div>
        </div>
        <div>${UI.esc(i.reason)}</div>
        <div style="margin-top:6px; font-size:12px; color:var(--muted);">
          Score: ${i.awayScore ?? '-'}–${i.homeScore ?? '-'} · <a href="game.html?gamePk=${i.gamePk}">Open Game →</a>
        </div>
      </article>
    `).join('');
  }

  function prevDay() {
    currentDate = UI.shiftDate(currentDate, -1);
    feedItems = FeedLog.loadDate(currentDate);
    syncDateUI();
    renderAll();
    scanSchedule();
  }

  function nextDay() {
    currentDate = UI.shiftDate(currentDate, 1);
    feedItems = FeedLog.loadDate(currentDate);
    syncDateUI();
    renderAll();
    scanSchedule();
  }

  function today() {
    currentDate = UI.todayStr();
    feedItems = FeedLog.loadDate(currentDate);
    syncDateUI();
    renderAll();
    scanSchedule();
  }

  function pickDate() {
    const picker = document.getElementById('date-picker');
    if (picker && picker.value) {
      currentDate = picker.value;
      feedItems = FeedLog.loadDate(currentDate);
      syncDateUI();
      renderAll();
      scanSchedule();
    }
  }

  global.ReplayFeed = { prevDay, nextDay, today, pickDate };
  document.addEventListener('DOMContentLoaded', init);
})(window);
