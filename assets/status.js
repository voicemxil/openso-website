/* OpenSO website — live server status widget.
 *
 * Mirrors what the OpenSO Launcher shows on its home screen: it polls the SAME public endpoint,
 *   GET {api}/userapi/status
 * (server time, game version, players/lots online, per-shard status, busiest lots) and renders a
 * glanceable "server status" card. The endpoint is cached server-side (~10s) and CORS-open
 * (Access-Control-Allow-Origin: *), so a plain browser fetch works and polling every ~30s is plenty.
 *
 * Response shape (camelCase JSON):
 *   { serverTime, gameVersion, playersOnline, lotsOnline,
 *     shards: [ { id, name, status, version, playersOnline, lotsOnline, ownedLots } ],
 *     topLots: [ { shardId, name, location, players } ] }
 *
 * Network/JSON failure -> the card shows an honest "offline" state with placeholders (matching the
 * launcher, which keeps working while the status endpoint is down).
 */
(function () {
  var API = (window.OPENSO_API_BASE || 'https://api.openso.org').replace(/\/+$/, '');
  var POLL_MS = 30000; // steady poll; launcher uses ~10s in-app, 30s is gentler for a web page

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* GameClock — mirrors the launcher's GameClock / FSO's TSOTime.FromUTC: the city's game clock is
     global and derived purely from UTC (a game day = 2 real hours; odd real hours are offset by an
     in-game hour), so we can compute the in-game time of day locally from the server's reported UTC. */
  function inGameTime(utc) {
    var cycle = (utc.getUTCHours() % 2 === 1) ? 3600 : 0;
    cycle += utc.getUTCMinutes() * 60 + utc.getUTCSeconds();
    return { h: Math.floor(cycle / 300), m: Math.floor((cycle % 300) / 5) };
  }
  function formatGameClock(utc) {
    var t = inGameTime(utc);
    var h12 = (t.h % 12 === 0) ? 12 : t.h % 12;
    var mm = (t.m < 10 ? '0' : '') + t.m;
    return h12 + ':' + mm + ' ' + (t.h < 12 ? 'AM' : 'PM');
  }
  function two(n) { return (n < 10 ? '0' : '') + n; }
  function formatUpdated(d) {
    return 'Updated ' + two(d.getHours()) + ':' + two(d.getMinutes()) + ':' + two(d.getSeconds());
  }

  // Server time anchor, so the in-game clock keeps ticking between polls without re-fetching.
  var serverUtc = null;      // Date: server's reported UTC at last successful poll
  var syncedAt = null;       // Date: local time when we anchored serverUtc
  var online = false;

  function setDot(isOnline) {
    var dot = $('ss-dot');
    if (dot) dot.className = 'ss-dot ' + (isOnline ? 'is-up' : 'is-down');
  }

  function renderOffline() {
    online = false; serverUtc = null;
    var root = $('server-status');
    if (root) root.classList.add('is-offline');
    setDot(false);
    setText('ss-fab-label', 'Server offline');
    setText('ss-server-name', 'OpenSO');
    setText('ss-server-status', 'Offline');
    setText('ss-players', '—');
    setText('ss-lots', '—');
    setText('ss-clock', '—');
    setText('ss-version', '—');
    var lots = $('ss-lots-list');
    if (lots) { lots.innerHTML = ''; }
    var lotsWrap = $('ss-busiest');
    if (lotsWrap) lotsWrap.hidden = true;
  }

  function setText(id, val) { var el = $(id); if (el) el.textContent = val; }

  function render(s) {
    var root = $('server-status');
    if (root) root.classList.remove('is-offline');

    var shard = (s.shards && s.shards[0]) || null;
    var status = (shard && shard.status) || 'Down';
    // ShardStatus: Up / Down / Busy / Full / Closed / Frontier — Up/Busy/Full are reachable.
    online = (status === 'Up' || status === 'Busy' || status === 'Full');
    setDot(online);
    setText('ss-server-name', (shard && shard.name) || 'OpenSO');
    setText('ss-server-status', status === 'Up' ? 'Online' : status);
    // Collapsed-pill summary: "N online" when reachable, else the status label.
    setText('ss-fab-label', online ? (numberOr(s.playersOnline) + ' online') : status);

    setText('ss-players', numberOr(s.playersOnline));
    setText('ss-lots', numberOr(s.lotsOnline));
    setText('ss-version', s.gameVersion || '—');

    // Anchor the in-game clock to the server's reported UTC.
    var t = s.serverTime ? new Date(s.serverTime) : null;
    if (t && !isNaN(t)) { serverUtc = t; syncedAt = new Date(); tickClock(); }
    else { setText('ss-clock', '—'); serverUtc = null; }

    renderBusiest(s.topLots || []);
  }

  function numberOr(n) {
    return (typeof n === 'number' && isFinite(n)) ? n.toLocaleString() : '—';
  }

  function renderBusiest(lots) {
    var wrap = $('ss-busiest');
    var list = $('ss-lots-list');
    if (!wrap || !list) return;
    if (!lots.length) { wrap.hidden = true; list.innerHTML = ''; return; }
    wrap.hidden = false;
    list.innerHTML = lots.slice(0, 5).map(function (l) {
      // Lot render thumbnail — same URL the launcher builds: {api}/userapi/city/{shardId}/{location}.png
      var thumb = API + '/userapi/city/' + encodeURIComponent(l.shardId) + '/' + encodeURIComponent(l.location) + '.png';
      var name = l.name || 'Unnamed lot';
      var players = (typeof l.players === 'number') ? l.players : 0;
      return '' +
        '<li class="ss-lot">' +
          '<span class="ss-lot-thumb" style="background-image:url(\'' + esc(thumb) + '\')"></span>' +
          '<span class="ss-lot-name">' + esc(name) + '</span>' +
          '<span class="ss-lot-players">' + players + ' <span class="ss-lot-players-lbl">' +
            (players === 1 ? 'player' : 'players') + '</span></span>' +
        '</li>';
    }).join('');
  }

  // Advance the displayed in-game clock from the anchored server UTC + elapsed local time.
  function tickClock() {
    if (!serverUtc || !syncedAt) return;
    var now = serverUtc.getTime() + (Date.now() - syncedAt.getTime());
    setText('ss-clock', formatGameClock(new Date(now)));
  }

  var inFlight = false;
  async function load() {
    if (inFlight) return;
    inFlight = true;
    var btn = $('ss-refresh');
    try {
      var res = await fetch(API + '/userapi/status', { cache: 'no-store' });
      if (!res.ok) throw new Error('status ' + res.status);
      var data = await res.json();
      render(data);
      setText('ss-updated', formatUpdated(new Date()));
    } catch (e) {
      renderOffline();
      // Leave the "Updated …" caption showing the last successful time (honest data age); if we've
      // never succeeded this session it stays at its initial placeholder.
    } finally {
      inFlight = false;
      if (btn) btn.disabled = false;
    }
  }

  // Expand/collapse the panel above the pill; remember the choice within the session.
  function setOpen(open) {
    var root = $('server-status'), panel = $('ss-panel'), toggle = $('ss-toggle');
    if (!root || !panel || !toggle) return;
    root.setAttribute('data-open', open ? 'true' : 'false');
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    try { localStorage.setItem('openso_ss_open', open ? '1' : '0'); } catch (e) {}
  }

  function wire() {
    var refresh = $('ss-refresh');
    if (refresh) refresh.addEventListener('click', function () { refresh.disabled = true; load(); });

    var toggle = $('ss-toggle');
    if (toggle) toggle.addEventListener('click', function () { setOpen($('ss-panel').hidden); });
    var close = $('ss-close');
    if (close) close.addEventListener('click', function () { setOpen(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { var p = $('ss-panel'); if (p && !p.hidden) setOpen(false); }
    });
    var stored = null; try { stored = localStorage.getItem('openso_ss_open'); } catch (e) {}
    setOpen(stored === '1'); // default collapsed

    load();
    setInterval(load, POLL_MS);
    setInterval(tickClock, 1000); // keep the in-game clock visibly ticking between polls
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
