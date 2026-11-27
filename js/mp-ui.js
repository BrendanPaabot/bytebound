// Pixel-art avatar renderer, L4D-inspired 1v1 Multiplayer Lobby UI, and 1v1 Match coordinator hooks.
(function (global) {
  const AVATAR_PALETTES = {
    cpu: { label: 'Silicon Architect (CPU)', bg: '#171d1f', frame: '#f2bb61', light: '#ffe0a0', core: '#6fe3e8', dark: '#24292c' },
    terminal: { label: 'Root SysAdmin (Terminal)', bg: '#121b18', frame: '#7fd49a', light: '#b7ffce', core: '#3e7a56', dark: '#0d1412' },
    shield: { label: 'SecOps Analyst (Firewall)', bg: '#131d22', frame: '#6fe3e8', light: '#effcff', core: '#f2bb61', dark: '#1e3844' },
    database: { label: 'Cloud DBA (Server Rack)', bg: '#1d1517', frame: '#e8706a', light: '#ffd27a', core: '#7fd49a', dark: '#2f1d20' },
  };

  const LEGACY_AVATAR_MAP = {
    gold: 'cpu',
    emerald: 'terminal',
    cyan: 'shield',
    crimson: 'database',
  };

  function resolveAvatarKey(key) {
    if (AVATAR_PALETTES[key]) return key;
    if (LEGACY_AVATAR_MAP[key]) return LEGACY_AVATAR_MAP[key];
    return 'cpu';
  }

  function avatarKeyForName(name) {
    const keys = Object.keys(AVATAR_PALETTES);
    let hash = 0;
    const str = String(name || 'player');
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    }
    return keys[hash % keys.length];
  }

  function renderPixelAvatar(rawKey, size = 40) {
    const key = resolveAvatarKey(rawKey);
    const pal = AVATAR_PALETTES[key];
    if (key === 'terminal') {
      return `<svg class="mp-avatar-svg" width="${size}" height="${size}" viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true">
        <rect width="8" height="8" fill="${pal.bg}"/>
        <rect x="0" y="1" width="8" height="6" fill="${pal.frame}"/>
        <rect x="1" y="2" width="6" height="4" fill="${pal.dark}"/>
        <rect x="1" y="2" width="1" height="1" fill="${pal.light}"/>
        <rect x="2" y="3" width="1" height="1" fill="${pal.light}"/>
        <rect x="1" y="4" width="1" height="1" fill="${pal.light}"/>
        <rect x="4" y="4" width="2" height="1" fill="${pal.frame}"/>
      </svg>`;
    }
    if (key === 'shield') {
      return `<svg class="mp-avatar-svg" width="${size}" height="${size}" viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true">
        <rect width="8" height="8" fill="${pal.bg}"/>
        <rect x="1" y="1" width="6" height="4" fill="${pal.frame}"/>
        <rect x="2" y="5" width="4" height="1" fill="${pal.frame}"/>
        <rect x="3" y="6" width="2" height="1" fill="${pal.light}"/>
        <rect x="2" y="2" width="4" height="3" fill="${pal.dark}"/>
        <rect x="3" y="2" width="2" height="1" fill="${pal.core}"/>
        <rect x="3" y="3" width="2" height="2" fill="${pal.core}"/>
      </svg>`;
    }
    if (key === 'database') {
      return `<svg class="mp-avatar-svg" width="${size}" height="${size}" viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true">
        <rect width="8" height="8" fill="${pal.bg}"/>
        <rect x="1" y="1" width="6" height="1" fill="${pal.frame}"/>
        <rect x="1" y="2" width="6" height="1" fill="${pal.dark}"/>
        <rect x="5" y="1" width="1" height="1" fill="${pal.core}"/>
        <rect x="1" y="3" width="6" height="1" fill="${pal.frame}"/>
        <rect x="1" y="4" width="6" height="1" fill="${pal.dark}"/>
        <rect x="5" y="3" width="1" height="1" fill="${pal.light}"/>
        <rect x="1" y="5" width="6" height="1" fill="${pal.frame}"/>
        <rect x="1" y="6" width="6" height="1" fill="${pal.dark}"/>
        <rect x="5" y="5" width="1" height="1" fill="${pal.core}"/>
      </svg>`;
    }
    // Default: 'cpu' microchip
    return `<svg class="mp-avatar-svg" width="${size}" height="${size}" viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true">
      <rect width="8" height="8" fill="${pal.bg}"/>
      <rect x="2" y="0" width="1" height="1" fill="${pal.frame}"/>
      <rect x="5" y="0" width="1" height="1" fill="${pal.frame}"/>
      <rect x="2" y="7" width="1" height="1" fill="${pal.frame}"/>
      <rect x="5" y="7" width="1" height="1" fill="${pal.frame}"/>
      <rect x="0" y="2" width="1" height="1" fill="${pal.frame}"/>
      <rect x="0" y="5" width="1" height="1" fill="${pal.frame}"/>
      <rect x="7" y="2" width="1" height="1" fill="${pal.frame}"/>
      <rect x="7" y="5" width="1" height="1" fill="${pal.frame}"/>
      <rect x="1" y="1" width="6" height="6" fill="${pal.frame}"/>
      <rect x="2" y="2" width="4" height="4" fill="${pal.dark}"/>
      <rect x="3" y="3" width="2" height="2" fill="${pal.core}"/>
      <rect x="2" y="2" width="1" height="1" fill="${pal.light}"/>
    </svg>`;
  }

  function renderNetworkNodeIcon(size = 40) {
    return `<svg class="mp-avatar-svg" width="${size}" height="${size}" viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true">
      <rect width="8" height="8" fill="#13191a"/>
      <rect x="3" y="1" width="2" height="1" fill="#6fe3e8"/>
      <rect x="2" y="2" width="1" height="1" fill="#6fe3e8"/>
      <rect x="5" y="2" width="1" height="1" fill="#6fe3e8"/>
      <rect x="3" y="3" width="2" height="2" fill="#f2bb61"/>
      <rect x="2" y="6" width="4" height="1" fill="#4f6466"/>
      <rect x="3" y="5" width="2" height="1" fill="#9ba39a"/>
    </svg>`;
  }

  function escHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function statusClass(status) {
    if (status === 'In Match') return 'is-in-match';
    if (status === 'In Lobby') return 'is-in-lobby';
    return 'is-available';
  }

  function formatYearShort(yearLevel) {
    const yr = typeof global.normalizeAcademicYear === 'function'
      ? global.normalizeAcademicYear(yearLevel, 4)
      : (Number.isInteger(Number(yearLevel)) ? Number(yearLevel) : 4);
    const meta = (global.MultiplayerMatchmaking?.YEAR_LEVELS || []).find((entry) => entry.year === yr);
    return meta ? meta.shortLabel : `Up to Year ${yr}`;
  }

  function countEligibleForRoom(category, yearLevel) {
    if (typeof global.getAllEligibleQuestions !== 'function') return 1;
    const pool = global.getAllEligibleQuestions(yearLevel);
    if (!category || category === 'ALL') return pool.length;
    return pool.filter((q) => q.category === category).length;
  }

  class MultiplayerUI {
    constructor(overlayEl, { onBackToMenu, onLaunchMatch }) {
      this.overlay = overlayEl;
      this.onBackToMenu = onBackToMenu;
      this.onLaunchMatch = onLaunchMatch;

      this.network = new global.MultiplayerNetwork();
      this.matchmaking = new global.MultiplayerMatchmaking(this.network);

      this.isOpen = false;
      this.subview = 'browser'; // 'browser' | 'host' | 'join' | 'room'
      this.selectedVisibility = 'public';
      this.selectedArena = 'arena';
      this.selectedCategory = 'ALL';
      this.selectedYearLevel = typeof global.getActiveAcademicYear === 'function'
        ? global.getActiveAcademicYear()
        : 4;
      this.inviteCodeDraft = '';
      this.joinError = '';
      this.copyFeedback = false;
      this.copyTimer = 0;
      this.selectedAvatar = 'cpu';
      this.lastRenderedHtml = '';
      this.deferredRender = false;
      this.snapshot = this.matchmaking.getSnapshot();

      this.matchmaking.subscribe((snap) => {
        this.snapshot = snap;
        if (snap.currentRoom && this.subview !== 'room') {
          this.subview = 'room';
        } else if (!snap.currentRoom && this.subview === 'room') {
          this.subview = 'browser';
        }
        if (this.isOpen) this.render();
      });

      this.matchmaking.onMatchStart((matchConfig) => {
        this.closeOverlayOnly();
        if (typeof this.onLaunchMatch === 'function') {
          this.onLaunchMatch(matchConfig, this.matchmaking.role, this.network.clientId);
        }
      });

      this.bindDomEvents();
    }

    initIdentity(username, { autoConnect = false } = {}) {
      const storedAvatar = (() => {
        try {
          return localStorage.getItem(`bytebound-avatar:${String(username || '').toLowerCase()}`);
        } catch {
          return null;
        }
      })();
      this.selectedAvatar = storedAvatar ? resolveAvatarKey(storedAvatar) : avatarKeyForName(username);
      const equippedTitleId = global.ByteboundQuests?.getEquippedTitleId?.() || '';
      if (this.network?.localProfile) {
        this.network.localProfile.username = username || 'Knight';
        this.network.localProfile.avatar = this.selectedAvatar;
        this.network.localProfile.titleId = equippedTitleId;
      }
      if (!autoConnect) return Promise.resolve(false);
      return this.matchmaking.initPlayer({
        username: username || 'Knight',
        avatar: this.selectedAvatar,
        titleId: equippedTitleId,
      });
    }

    async open(initialSubview = 'browser') {
      if (!this.overlay) return;
      this.isOpen = true;
      this.joinError = '';
      if (!this.snapshot.currentRoom && typeof global.getActiveAcademicYear === 'function') {
        this.selectedYearLevel = global.getActiveAcademicYear();
      }
      this.subview = this.snapshot.currentRoom ? 'room' : initialSubview;
      this.overlay.hidden = false;
      this.overlay.setAttribute('aria-hidden', 'false');
      this.render();

      const playerName = global.activePlayerName || 'Knight';
      this.matchmaking.network?.setPollingMode?.(this.snapshot.currentRoom?.status === 'in_match' ? 'match' : 'lobby');
      await this.initIdentity(playerName, { autoConnect: true });
      await this.matchmaking.refresh();
    }

    closeOverlayOnly() {
      this.isOpen = false;
      if (this.overlay) {
        this.overlay.hidden = true;
        this.overlay.setAttribute('aria-hidden', 'true');
      }
    }

    async closeAndReturnToMenu() {
      this.closeOverlayOnly();
      if (typeof this.onBackToMenu === 'function') {
        this.onBackToMenu();
      }
      if (this.snapshot.currentRoom) {
        await this.matchmaking.leaveCurrentRoom();
      }
      await this.matchmaking.network?.disconnect?.();
    }

    bindDomEvents() {
      if (!this.overlay) return;

      this.overlay.addEventListener('click', async (event) => {
        const target = event.target.closest('button, [data-mp-nav], [data-mp-act], [data-mp-join-public], [data-mp-visibility], [data-mp-avatar], [data-mp-invite]');
        if (!target) return;

        if (target.dataset.mpNav) {
          this.joinError = '';
          this.matchmaking.clearNotification();
          this.subview = target.dataset.mpNav;
          this.render();
          if (this.subview === 'join' || this.subview === 'browser') {
            this.matchmaking.refresh();
          }
          return;
        }

        if (target.dataset.mpVisibility) {
          this.selectedVisibility = target.dataset.mpVisibility === 'private' ? 'private' : 'public';
          this.render();
          return;
        }

        if (target.dataset.mpAvatar && AVATAR_PALETTES[target.dataset.mpAvatar]) {
          this.selectedAvatar = target.dataset.mpAvatar;
          try {
            const name = global.activePlayerName || 'Knight';
            localStorage.setItem(`bytebound-avatar:${name.toLowerCase()}`, this.selectedAvatar);
          } catch {}
          await this.matchmaking.setProfile({ avatar: this.selectedAvatar });
          this.render();
          return;
        }

        if (target.dataset.mpJoinPublic) {
          const code = target.dataset.mpJoinPublic;
          this.joinError = '';
          const res = await this.matchmaking.joinPublicRoom(code);
          if (!res.ok) {
            this.joinError = res.error || 'Failed to join room.';
            this.render();
          }
          return;
        }

        if (target.dataset.mpInvite) {
          this.joinError = '';
          const res = await this.matchmaking.invitePlayer(target.dataset.mpInvite);
          if (!res.ok && res.error) {
            this.matchmaking.setNotification('warn', res.error);
          }
          return;
        }

        const act = target.dataset.mpAct;
        if (!act) return;

        if (act === 'back') {
          await this.closeAndReturnToMenu();
        } else if (act === 'accept-invite') {
          this.joinError = '';
          const res = await this.matchmaking.acceptInvite();
          if (!res.ok) {
            this.joinError = res.error || 'Could not join invited room.';
            this.matchmaking.setNotification('error', this.joinError);
            this.render();
          }
        } else if (act === 'decline-invite') {
          this.matchmaking.declineInvite();
        } else if (act === 'dismiss-note') {
          this.matchmaking.clearNotification();
        } else if (act === 'refresh') {
          await this.matchmaking.refresh();
        } else if (act === 'create-room') {
          await this.matchmaking.createRoom({
            visibility: this.selectedVisibility,
            arenaId: this.selectedArena,
            category: this.selectedCategory,
            yearLevel: this.selectedYearLevel,
          });
        } else if (act === 'join-code') {
          const input = this.overlay.querySelector('#mpInviteCodeInput');
          this.inviteCodeDraft = input ? input.value : this.inviteCodeDraft;
          this.joinError = '';
          const res = await this.matchmaking.joinRoomByCode(this.inviteCodeDraft);
          if (!res.ok) {
            this.joinError = res.error || 'Invalid invitation code.';
            this.render();
          }
        } else if (act === 'copy-code') {
          const code = this.snapshot.currentRoom?.code || '';
          if (code) {
            try {
              if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(code);
            } catch {}
            this.copyFeedback = true;
            global.clearTimeout(this.copyTimer);
            this.copyTimer = global.setTimeout(() => {
              this.copyFeedback = false;
              if (this.isOpen && this.subview === 'room') this.render();
            }, 1600);
            this.render();
          }
        } else if (act === 'toggle-ready') {
          await this.matchmaking.toggleReady();
        } else if (act === 'start-match') {
          await this.matchmaking.startMatch();
        } else if (act === 'leave-room') {
          await this.matchmaking.leaveCurrentRoom();
          this.subview = 'browser';
          this.render();
        }
      });

      this.overlay.addEventListener('change', async (event) => {
        const el = event.target;
        if (el.id === 'mpHostArena') {
          this.selectedArena = el.value;
        } else if (el.id === 'mpHostCategory') {
          this.selectedCategory = el.value;
          this.render(true);
        } else if (el.id === 'mpHostYearLevel') {
          this.selectedYearLevel = Number(el.value) || 4;
          this.render(true);
        } else if (el.id === 'mpRoomArena' || el.id === 'mpRoomCategory' || el.id === 'mpRoomYearLevel') {
          const arenaSel = this.overlay.querySelector('#mpRoomArena');
          const catSel = this.overlay.querySelector('#mpRoomCategory');
          const yearSel = this.overlay.querySelector('#mpRoomYearLevel');
          await this.matchmaking.updateSettings({
            arenaId: arenaSel ? arenaSel.value : this.selectedArena,
            category: catSel ? catSel.value : this.selectedCategory,
            yearLevel: yearSel ? Number(yearSel.value) : (this.snapshot.currentRoom?.yearLevel || this.selectedYearLevel),
          });
        }
      });

      this.overlay.addEventListener('input', (event) => {
        if (event.target.id === 'mpInviteCodeInput') {
          this.inviteCodeDraft = event.target.value.toUpperCase();
        }
      });

      this.overlay.addEventListener('keydown', async (event) => {
        if (event.key === 'Enter' && event.target.id === 'mpInviteCodeInput') {
          event.preventDefault();
          this.inviteCodeDraft = event.target.value;
          this.joinError = '';
          const res = await this.matchmaking.joinRoomByCode(this.inviteCodeDraft);
          if (!res.ok) {
            this.joinError = res.error || 'Invalid invitation code.';
            this.render(true);
          }
        }
      });

      this.overlay.addEventListener('focusout', () => {
        if (this.deferredRender && this.isOpen) {
          global.setTimeout(() => {
            if (!this.isOpen) return;
            const active = document.activeElement;
            if (!active || !this.overlay.contains(active) || (active.tagName !== 'INPUT' && active.tagName !== 'SELECT')) {
              this.deferredRender = false;
              this.render(true);
            }
          }, 0);
        }
      });
    }

    connectionLabel() {
      const conn = this.snapshot.connection || {};
      if (conn.supabase) return 'ONLINE · SUPABASE REALTIME';
      if (conn.localServer) return 'ONLINE · LOCAL RELAY';
      if (conn.connected) return 'LOCAL BROWSER CHANNEL';
      return 'CONNECTING…';
    }

    renderHeader() {
      const avatarButtons = Object.entries(AVATAR_PALETTES).map(([key, pal]) => `
        <button type="button" class="mp-avatar-choice ${this.selectedAvatar === key ? 'is-selected' : ''}" data-mp-avatar="${key}" title="${escHtml(pal.label)}" aria-pressed="${this.selectedAvatar === key}">
          ${renderPixelAvatar(key, 24)}
        </button>
      `).join('');

      const inRoom = Boolean(this.snapshot.currentRoom);
      return `
        <header class="mp-header">
          <div class="mp-header-brand">
            <span class="eyebrow">1V1 ONLINE VERSUS // MATCHMAKING</span>
            <h1 id="mpOverlayTitle">1v1 Multiplayer Lobby</h1>
            <div class="mp-conn-pill ${this.snapshot.connection?.connected ? 'is-online' : 'is-offline'}">
              <span class="mp-conn-dot" aria-hidden="true"></span>
              <span>${escHtml(this.connectionLabel())}</span>
            </div>
          </div>
          <div class="mp-header-tools">
            <div class="mp-avatar-picker" aria-label="Select IT specialization icon">
              <span class="mp-avatar-label">IT SPECIALIZATION</span>
              <div class="mp-avatar-choices">${avatarButtons}</div>
            </div>
            <div class="mp-header-actions">
              ${!inRoom ? `
                <button type="button" class="mp-btn is-gold ${this.subview === 'host' ? 'is-active' : ''}" data-mp-nav="host">Host Game</button>
                <button type="button" class="mp-btn is-blue ${this.subview === 'join' ? 'is-active' : ''}" data-mp-nav="join">Join Game</button>
                <button type="button" class="mp-btn" data-mp-act="refresh">Refresh</button>
              ` : ''}
              <button type="button" class="mp-btn is-danger" data-mp-act="back">${inRoom ? 'Leave &amp; Back' : 'Back'}</button>
            </div>
          </div>
        </header>
      `;
    }

    renderNotification() {
      const note = this.snapshot.notification;
      if (!note) return '';
      return `
        <div class="mp-notice is-${escHtml(note.type || 'info')}" role="status" aria-live="polite">
          <span>${escHtml(note.message)}</span>
          <button type="button" class="mp-notice-close" data-mp-act="dismiss-note" aria-label="Dismiss notification">✕</button>
        </div>
      `;
    }

    renderInviteBanner() {
      const inv = this.snapshot.incomingInvite;
      if (!inv) return '';
      return `
        <div class="mp-invite-banner" role="alert" aria-live="assertive">
          <div class="mp-invite-banner-info">
            ${renderPixelAvatar(inv.hostAvatar, 34)}
            <div>
              <strong>Match Invitation from ${escHtml(inv.hostName || 'Host')}</strong>
              <small>${escHtml(inv.arenaName || 'Cyber Arena')} · ${escHtml(formatYearShort(inv.yearLevel))} · ${inv.visibility === 'private' ? 'Private' : 'Public'} Room ${escHtml(inv.roomCode)}</small>
            </div>
          </div>
          <div class="mp-invite-banner-actions">
            <button type="button" class="mp-btn is-green" data-mp-act="accept-invite">Accept &amp; Join</button>
            <button type="button" class="mp-btn is-danger" data-mp-act="decline-invite">Decline</button>
          </div>
        </div>
      `;
    }

    renderBrowserView() {
      const { players, publicRooms } = this.snapshot;
      const invitedSet = new Set(this.snapshot.invitedClientIds || []);
      const waitingPlayers = players.filter((p) => !p.isSelf && (p.status || 'Available') === 'Available');

      const roomsHtml = publicRooms.length
        ? publicRooms.map((r) => `
          <article class="mp-room-row" data-room-code="${escHtml(r.code)}">
            <div class="mp-room-host">
              ${renderPixelAvatar(r.hostAvatar, 38)}
              <div>
                <strong>${escHtml(r.hostName)}'s Room ${global.ByteboundQuests?.renderTitleBadgeHtml?.(r.hostTitleId || global.ByteboundQuests?.getPlayerTitle?.(r.hostName), { compact: true }) || ''}</strong>
                <small>${escHtml(r.arenaName)} · ${escHtml(r.category === 'ALL' ? 'All Disciplines' : r.category)} · ${escHtml(formatYearShort(r.yearLevel))} · Code ${escHtml(r.code)}</small>
              </div>
            </div>
            <div class="mp-room-meta">
              <span class="mp-room-status">1/2 · OPEN</span>
              <button type="button" class="mp-btn is-gold" data-mp-join-public="${escHtml(r.code)}" ${r.hostClientId === this.snapshot.selfClientId ? 'disabled' : ''}>Join</button>
            </div>
          </article>
        `).join('')
        : `
          <div class="mp-empty">
            <strong>No open public rooms right now.</strong>
            <p>Create a Public Room to wait for challengers, or join a friend via Private Invitation Code.</p>
            <button type="button" class="mp-btn is-gold" data-mp-nav="host">Host a Room</button>
          </div>
        `;

      const playersHtml = players.length
        ? players.map((p) => {
            const isAvailable = !p.isSelf && (p.status || 'Available') === 'Available';
            const alreadyInvited = invitedSet.has(p.clientId);
            return `
              <div class="mp-player-row ${p.isSelf ? 'is-self' : ''}">
                <div class="mp-player-id">
                  ${renderPixelAvatar(p.avatar, 32)}
                  <div>
                    <strong>${escHtml(p.username)} ${global.ByteboundQuests?.renderTitleBadgeHtml?.(p.titleId || global.ByteboundQuests?.getPlayerTitle?.(p.username), { compact: true }) || ''}${p.isSelf ? ' <small>(YOU)</small>' : ''}</strong>
                    <small>${p.roomCode ? `Room ${escHtml(p.roomCode)}` : 'Lobby Browser'}</small>
                  </div>
                </div>
                <div class="mp-player-actions">
                  ${isAvailable ? `<button type="button" class="mp-btn is-gold mp-btn-sm" data-mp-invite="${escHtml(p.clientId)}">${alreadyInvited ? 'Re-Invite' : 'Invite'}</button>` : ''}
                  <span class="mp-status-badge ${statusClass(p.status)}">${escHtml(p.status || 'Available')}</span>
                </div>
              </div>
            `;
          }).join('')
        : '<p class="mp-empty-inline">Waiting for player presence…</p>';

      return `
        <div class="mp-browser-grid">
          <section class="mp-panel mp-rooms-panel" aria-label="Available public rooms">
            <div class="mp-panel-head">
              <div>
                <span class="eyebrow">Public Matchmaking</span>
                <h2>Available Public Rooms (${publicRooms.length})</h2>
              </div>
              <button type="button" class="mp-btn" data-mp-act="refresh">Refresh</button>
            </div>
            <div class="mp-rooms-list">${roomsHtml}</div>
          </section>

          <section class="mp-panel mp-players-panel" aria-label="Online players">
            <div class="mp-panel-head">
              <div>
                <span class="eyebrow">Connected Roster</span>
                <h2>Players Online (${players.length})</h2>
              </div>
              ${waitingPlayers.length ? `<button type="button" class="mp-btn is-blue mp-btn-sm" data-mp-invite="all">Invite Waiting (${waitingPlayers.length})</button>` : ''}
            </div>
            <div class="mp-players-list">${playersHtml}</div>
          </section>
        </div>
      `;
    }

    renderHostView() {
      const arenas = global.MultiplayerMatchmaking.ARENAS.map((a) =>
        `<option value="${escHtml(a.id)}" ${this.selectedArena === a.id ? 'selected' : ''}>${escHtml(a.name)}</option>`
      ).join('');
      const categories = global.MultiplayerMatchmaking.CATEGORIES.map((c) =>
        `<option value="${escHtml(c)}" ${this.selectedCategory === c ? 'selected' : ''}>${escHtml(c === 'ALL' ? 'All Disciplines' : c)}</option>`
      ).join('');
      const yearOptions = (global.MultiplayerMatchmaking.YEAR_LEVELS || []).map((entry) =>
        `<option value="${entry.year}" ${Number(this.selectedYearLevel) === entry.year ? 'selected' : ''}>${escHtml(entry.label)}</option>`
      ).join('');
      const eligibleMatchCount = countEligibleForRoom(this.selectedCategory, this.selectedYearLevel);
      const yearCompatibilityNote = eligibleMatchCount === 0 && this.selectedCategory !== 'ALL'
        ? `<p class="mp-year-note is-warn">${escHtml(this.selectedCategory)} unlocks in a later academic year. Starting at ${escHtml(formatYearShort(this.selectedYearLevel))} will automatically draw from all eligible ${escHtml(formatYearShort(this.selectedYearLevel))} questions so both players stay synced.</p>`
        : `<p class="mp-year-note">Both players will receive the exact same synchronized questions from ${escHtml(formatYearShort(this.selectedYearLevel))} (${eligibleMatchCount} eligible).</p>`;

      return `
        <section class="mp-panel mp-subpanel" aria-label="Host 1v1 room">
          <div class="mp-panel-head">
            <div>
              <span class="eyebrow">Create Match Room</span>
              <h2>Host 1v1 Duel Room</h2>
            </div>
            <button type="button" class="mp-btn" data-mp-nav="browser">Back to Lobby</button>
          </div>

          <div class="mp-visibility-grid" role="radiogroup" aria-label="Room visibility">
            <button type="button" class="mp-visibility-card ${this.selectedVisibility === 'public' ? 'is-selected' : ''}" data-mp-visibility="public" aria-pressed="${this.selectedVisibility === 'public'}">
              <span class="mp-vis-badge">PUBLIC</span>
              <strong>Public Room</strong>
              <small>Visible in the public lobby browser. Any player can select and join.</small>
            </button>
            <button type="button" class="mp-visibility-card ${this.selectedVisibility === 'private' ? 'is-selected' : ''}" data-mp-visibility="private" aria-pressed="${this.selectedVisibility === 'private'}">
              <span class="mp-vis-badge">PRIVATE</span>
              <strong>Private Room</strong>
              <small>Hidden from public rooms. Only players with the invitation code can join.</small>
            </button>
          </div>

          <div class="mp-form-grid">
            <label class="mp-field">
              <span>Battle Arena</span>
              <select id="mpHostArena">${arenas}</select>
            </label>
            <label class="mp-field">
              <span>Question Discipline</span>
              <select id="mpHostCategory">${categories}</select>
            </label>
            <label class="mp-field">
              <span>Academic Year Level</span>
              <select id="mpHostYearLevel">${yearOptions}</select>
            </label>
          </div>
          ${yearCompatibilityNote}

          <div class="mp-form-footer">
            <button type="button" class="mp-btn is-gold is-lg" data-mp-act="create-room" ${this.snapshot.isBusy ? 'disabled' : ''}>
              ${this.snapshot.isBusy ? 'Registering Room…' : 'Create Room'}
            </button>
            <button type="button" class="mp-btn" data-mp-nav="browser">Cancel</button>
          </div>
        </section>
      `;
    }

    renderJoinView() {
      const { publicRooms, isBusy } = this.snapshot;
      const roomsHtml = publicRooms.length
        ? publicRooms.map((r) => `
          <article class="mp-room-row" data-room-code="${escHtml(r.code)}">
            <div class="mp-room-host">
              ${renderPixelAvatar(r.hostAvatar, 36)}
              <div>
                <strong>${escHtml(r.hostName)} ${global.ByteboundQuests?.renderTitleBadgeHtml?.(r.hostTitleId || global.ByteboundQuests?.getPlayerTitle?.(r.hostName), { compact: true }) || ''}</strong>
                <small>${escHtml(r.arenaName)} · ${escHtml(r.category === 'ALL' ? 'All' : r.category)} · ${escHtml(formatYearShort(r.yearLevel))}</small>
              </div>
            </div>
            <div class="mp-room-meta">
              <span class="mp-room-status">1/2 · WAITING</span>
              <button type="button" class="mp-btn is-gold" data-mp-join-public="${escHtml(r.code)}" ${isBusy ? 'disabled' : ''}>Join</button>
            </div>
          </article>
        `).join('')
        : '<p class="mp-empty-inline">No public rooms currently open. Ask your opponent for a Private Invitation Code or host a new room.</p>';

      return `
        <section class="mp-join-grid" aria-label="Join 1v1 room">
          <div class="mp-panel">
            <div class="mp-panel-head">
              <div>
                <span class="eyebrow">Option 1</span>
                <h2>Join Public Game</h2>
              </div>
              <button type="button" class="mp-btn" data-mp-act="refresh">Refresh</button>
            </div>
            <div class="mp-rooms-list">${roomsHtml}</div>
          </div>

          <div class="mp-panel">
            <div class="mp-panel-head">
              <div>
                <span class="eyebrow">Option 2</span>
                <h2>Join Private Game</h2>
              </div>
              <button type="button" class="mp-btn" data-mp-nav="browser">Back to Lobby</button>
            </div>
            <p class="mp-join-copy">Enter the 6-character invitation code shared by the room host.</p>
            <div class="mp-code-entry">
              <label for="mpInviteCodeInput" class="mp-sr-label">Invitation Code</label>
              <input id="mpInviteCodeInput" type="text" maxlength="8" autocomplete="off" spellcheck="false" placeholder="e.g. K9M4X2" value="${escHtml(this.inviteCodeDraft)}" />
              <button type="button" class="mp-btn is-gold is-lg" data-mp-act="join-code" ${isBusy ? 'disabled' : ''}>
                ${isBusy ? 'Validating…' : 'Join'}
              </button>
            </div>
            <div class="mp-join-error" id="mpJoinError" role="alert" ${this.joinError ? '' : 'hidden'}>${escHtml(this.joinError)}</div>
          </div>
        </section>
      `;
    }

    renderRoomView() {
      const room = this.snapshot.currentRoom;
      if (!room) return this.renderBrowserView();
      const isHost = this.snapshot.role === 'host';
      const selfSlot = isHost ? room.host : room.guest;
      const bothPresent = Boolean(room.host?.connected && room.guest?.connected);
      const bothReady = Boolean(bothPresent && room.host.ready && room.guest.ready);
      const canStart = Boolean(this.snapshot.canStartMatch);

      const statusBanner = !room.guest
        ? 'WAITING FOR PLAYER (1/2)'
        : !bothReady
          ? 'CHALLENGER JOINED — READY UP (2/2)'
          : 'ALL PLAYERS READY TO BATTLE';

      const renderSlot = (slot, slotTitle, emptyLabel) => {
        if (!slot) {
          return `
            <article class="mp-slot-card is-empty" aria-label="${escHtml(slotTitle)} empty">
              <span class="mp-slot-role">${escHtml(slotTitle)}</span>
              <div class="mp-slot-empty-avatar" aria-hidden="true">${renderNetworkNodeIcon(42)}</div>
              <strong class="mp-slot-name">${escHtml(emptyLabel)}</strong>
              <small class="mp-slot-conn">Share code ${escHtml(room.code)} or invite a lobby player</small>
              <span class="mp-ready-pill is-waiting">OPEN SLOT</span>
            </article>
          `;
        }
        const isYou = slot.clientId === this.snapshot.selfClientId;
        return `
          <article class="mp-slot-card ${slot.ready ? 'is-ready' : ''} ${isYou ? 'is-you' : ''}">
            <span class="mp-slot-role">${escHtml(slotTitle)}${isYou ? ' · YOU' : ''}</span>
            <div class="mp-slot-avatar">${renderPixelAvatar(slot.avatar, 64)}</div>
            <strong class="mp-slot-name">${escHtml(slot.username)}</strong>
            ${global.ByteboundQuests?.renderTitleBadgeHtml?.(slot.titleId || (isYou ? global.ByteboundQuests?.getEquippedTitleId?.() : global.ByteboundQuests?.getPlayerTitle?.(slot.username)), { compact: true }) || ''}
            <small class="mp-slot-conn ${slot.connected ? 'is-up' : 'is-down'}">${slot.connected ? 'CONNECTED' : 'DISCONNECTED'}</small>
            <span class="mp-ready-pill ${slot.ready ? 'is-ready' : 'is-not-ready'}">${slot.ready ? 'READY' : 'NOT READY'}</span>
          </article>
        `;
      };

      const arenas = global.MultiplayerMatchmaking.ARENAS.map((a) =>
        `<option value="${escHtml(a.id)}" ${room.arenaId === a.id ? 'selected' : ''}>${escHtml(a.name)}</option>`
      ).join('');
      const categories = global.MultiplayerMatchmaking.CATEGORIES.map((c) =>
        `<option value="${escHtml(c)}" ${room.category === c ? 'selected' : ''}>${escHtml(c === 'ALL' ? 'All Disciplines' : c)}</option>`
      ).join('');
      const roomYear = Number(room.yearLevel) || 4;
      const yearOptions = (global.MultiplayerMatchmaking.YEAR_LEVELS || []).map((entry) =>
        `<option value="${entry.year}" ${roomYear === entry.year ? 'selected' : ''}>${escHtml(entry.label)}</option>`
      ).join('');

      let hostHint = '';
      if (isHost) {
        if (!room.guest) hostHint = 'Waiting for second player to join…';
        else if (!bothReady) hostHint = 'Both players must click Ready before starting.';
        else hostHint = 'Both players ready! Equal stats (100 HP · 12 ATK) locked.';
      } else {
        hostHint = bothReady ? 'Both players ready! Waiting for Host to start match…' : 'Click Ready when you are prepared to battle.';
      }

      return `
        <section class="mp-panel mp-room-stage" aria-label="1v1 Match Room">
          <div class="mp-room-banner">
            <div class="mp-room-badges">
              <span class="mp-vis-tag">${room.visibility === 'private' ? 'PRIVATE ROOM' : 'PUBLIC ROOM'}</span>
              <span class="mp-stage-status">${escHtml(statusBanner)}</span>
            </div>
            <div class="mp-invite-box">
              <span class="mp-invite-label">INVITATION CODE</span>
              <strong class="mp-invite-code" id="mpRoomCodeText">${escHtml(room.code)}</strong>
              <button type="button" class="mp-btn is-gold" data-mp-act="copy-code">${this.copyFeedback ? 'Copied!' : 'Copy Code'}</button>
            </div>
          </div>

          <div class="mp-settings-strip">
            <div class="mp-setting-item">
              <span>ARENA</span>
              ${isHost
                ? `<select id="mpRoomArena" aria-label="Battle Arena">${arenas}</select>`
                : `<strong>${escHtml(room.arenaName)}</strong>`}
            </div>
            <div class="mp-setting-item">
              <span>QUESTIONS</span>
              ${isHost
                ? `<select id="mpRoomCategory" aria-label="Question Discipline">${categories}</select>`
                : `<strong>${escHtml(room.category === 'ALL' ? 'All Disciplines' : room.category)}</strong>`}
            </div>
            <div class="mp-setting-item">
              <span>YEAR LEVEL</span>
              ${isHost
                ? `<select id="mpRoomYearLevel" aria-label="Academic Year Level">${yearOptions}</select>`
                : `<strong>${escHtml(formatYearShort(roomYear))}</strong>`}
            </div>
            <div class="mp-setting-item">
              <span>FAIR PLAY</span>
              <strong>Equal Stats · Synced Quiz</strong>
            </div>
          </div>

          <div class="mp-slots-vs">
            ${renderSlot(room.host, 'SLOT 1 · HOST', 'Host')}
            <div class="mp-vs-emblem" aria-hidden="true">VS</div>
            ${renderSlot(room.guest, 'SLOT 2 · CHALLENGER', 'Waiting for Player')}
          </div>

          ${!room.guest ? (() => {
            const invitedSet = new Set(this.snapshot.invitedClientIds || []);
            const waitingPlayers = (this.snapshot.players || []).filter((p) => !p.isSelf && (p.status || 'Available') === 'Available');
            return `
              <div class="mp-room-invite-strip" aria-label="Invite waiting lobby players">
                <div class="mp-room-invite-head">
                  <span>WAITING IN LOBBY (${waitingPlayers.length})</span>
                  ${waitingPlayers.length ? `<button type="button" class="mp-btn is-blue mp-btn-sm" data-mp-invite="all">Invite All Waiting</button>` : ''}
                </div>
                ${waitingPlayers.length
                  ? `<div class="mp-room-invite-list">
                      ${waitingPlayers.map((p) => `
                        <div class="mp-room-invite-chip">
                          ${renderPixelAvatar(p.avatar, 24)}
                          <span>${escHtml(p.username)}</span>
                          <button type="button" class="mp-btn is-gold mp-btn-sm" data-mp-invite="${escHtml(p.clientId)}">${invitedSet.has(p.clientId) ? 'Re-Invite' : 'Invite'}</button>
                        </div>
                      `).join('')}
                    </div>`
                  : '<p class="mp-room-invite-empty">No other players are currently waiting in the lobby browser. Share your invitation code or wait for a challenger.</p>'}
              </div>
            `;
          })() : ''}

          <div class="mp-room-footer">
            <p class="mp-room-hint">${escHtml(hostHint)}</p>
            <div class="mp-room-controls">
              <button type="button" class="mp-btn is-lg ${selfSlot?.ready ? 'is-green' : 'is-gold'}" data-mp-act="toggle-ready">
                ${selfSlot?.ready ? '✓ Ready (Click to Unready)' : 'Ready Up'}
              </button>
              ${isHost ? `
                <button type="button" class="mp-btn is-lg is-start" data-mp-act="start-match" ${canStart ? '' : 'disabled'}>
                  Start Match
                </button>
              ` : ''}
              <button type="button" class="mp-btn is-danger" data-mp-act="leave-room">
                ${isHost ? 'Cancel Room' : 'Leave Room'}
              </button>
            </div>
          </div>
        </section>
      `;
    }

    render(force = false) {
      if (!this.overlay) return;
      const active = document.activeElement;
      if (!force && active && this.overlay.contains(active) && (active.tagName === 'INPUT' || active.tagName === 'SELECT')) {
        // Avoid destroying an active input/select dropdown mid-interaction; re-render on blur/change.
        this.deferredRender = true;
        return;
      }

      let body = '';
      if (this.snapshot.currentRoom || this.subview === 'room') {
        body = this.renderRoomView();
      } else if (this.subview === 'host') {
        body = this.renderHostView();
      } else if (this.subview === 'join') {
        body = this.renderJoinView();
      } else {
        body = this.renderBrowserView();
      }

      const nextHtml = `
        <div class="mp-shell" role="dialog" aria-modal="true" aria-labelledby="mpOverlayTitle">
          ${this.renderHeader()}
          ${this.renderInviteBanner()}
          ${this.renderNotification()}
          <div class="mp-body">${body}</div>
        </div>
      `;
      if (!force && nextHtml === this.lastRenderedHtml) return;
      this.lastRenderedHtml = nextHtml;
      this.deferredRender = false;
      this.overlay.innerHTML = nextHtml;
    }
  }

  global.MultiplayerUI = MultiplayerUI;
  global.ByteboundPixelAvatar = { renderPixelAvatar, AVATAR_PALETTES };
})(window);
