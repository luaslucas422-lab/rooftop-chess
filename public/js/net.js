/* Rooftop Chess – the connection to the online server (reconnects by itself) */
(function (root) {
  'use strict';
  const listeners = new Map();
  let ws = null, wanted = false, retry = 0, retryT = null, pingT = null;
  const Net = {
    state: 'off',          // off | connecting | online
    me: null,              // welcome message: { id, name, ratings, chat, tcs, stats }
    game: null,            // the current online game state from the server
    chat: ['Hi!', 'Good luck!', 'Have fun!', 'Nice move!', 'Oops', 'Thanks!', 'Good game!', 'Well played!', 'Rematch?', 'Thinking…'],
    on(t, fn) { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t).add(fn); return () => listeners.get(t).delete(fn); },
    emit(t, m) { for (const fn of listeners.get(t) || []) { try { fn(m); } catch (e) { console.error(e); } } for (const fn of listeners.get('*') || []) { try { fn(m); } catch (e) {} } },
    url() {
      const s = (Store.data.settings.server || '').trim();
      let base = s || (location.protocol.startsWith('http') ? location.origin : '');
      if (!base) return null;
      base = base.replace(/\/+$/, '').replace(/\/chess$/, '');
      return base.replace(/^http/, 'ws') + '/chess/ws';
    },
    connect() {
      wanted = true;
      if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
      const url = this.url(); if (!url) { this.setState('off'); return; }
      this.setState('connecting');
      try { ws = new WebSocket(url); } catch (e) { this.later(); return; }
      ws.onopen = () => {
        retry = 0;
        const p = Store.data.profile;
        this.raw({ t: 'hello', token: p.token, name: p.name || 'Guest', face: p.face });
        clearInterval(pingT); pingT = setInterval(() => this.raw({ t: 'ping', at: Date.now() }), 20000);
      };
      ws.onmessage = e => {
        let m; try { m = JSON.parse(e.data); } catch (x) { return; }
        if (m.t === 'welcome') {
          this.me = m; if (m.chat) this.chat = m.chat;
          Store.data.online.id = m.id; Store.data.online.ratings = m.ratings; Store.save();
          this.setState('online');
        }
        if (m.t === 'me') { Store.data.online.ratings = m.ratings; Store.save(); }
        if (m.t === 'game' && m.you) this.game = m;   // (spectating sends games with you: null)
        if (m.t === 'end' && this.game && this.game.id === m.id) { this.game.over = m; }
        if (m.t === 'replaced') { wanted = false; UI.toast('You opened Rooftop Chess somewhere else'); }
        this.emit(m.t, m);
      };
      ws.onclose = () => { clearInterval(pingT); ws = null; this.setState(wanted ? 'connecting' : 'off'); if (wanted) this.later(); };
      ws.onerror = () => {};
    },
    later() { clearTimeout(retryT); const d = Math.min(15000, 600 * Math.pow(1.7, retry++)); retryT = setTimeout(() => { if (wanted) this.connect(); }, d); },
    disconnect() { wanted = false; clearTimeout(retryT); if (ws) try { ws.close(); } catch (e) {} },
    reconnect() { this.disconnect(); setTimeout(() => this.connect(), 50); },
    setState(s) { if (this.state !== s) { this.state = s; this.emit('state', s); } },
    raw(o) { if (ws && ws.readyState === 1) { ws.send(JSON.stringify(o)); return true; } return false; },
    send(o) { if (this.raw(o)) return true; UI.toast(this.state === 'connecting' ? 'Connecting to the server…' : 'You’re offline – online play needs the server'); this.connect(); return false; },
    /* waits until online (or gives up) */
    ready(ms) {
      if (this.state === 'online') return Promise.resolve(true);
      this.connect();
      return new Promise(res => { const off = this.on('state', s => { if (s === 'online') { off(); clearTimeout(t); res(true); } }); const t = setTimeout(() => { off(); res(false); }, ms || 8000); });
    },
  };
  root.Net = Net;
})(typeof self !== 'undefined' ? self : this);
