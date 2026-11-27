// Multiplayer networking transport layer:
// Supports cross-computer Supabase Realtime (Presence + Broadcast + optional public.multiplayer_rooms),
// local HTTP server endpoints (/api/mp/* when served via serve-local.ps1), and same-origin BroadcastChannel.
(function (global) {
  const CLIENT_ID_STORAGE_KEY = 'bytebound-mp-client-id-v1';
  const SUPABASE_CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

  function withTimeout(promise, ms = 1200) {
    if (!promise || typeof promise.then !== 'function') return Promise.resolve(null);
    return Promise.race([
      promise.catch(() => null),
      new Promise((resolve) => global.setTimeout(() => resolve(null), ms)),
    ]);
  }

  function generateClientId() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    const rnd = Math.random().toString(36).slice(2, 10);
    return `bb-${Date.now().toString(36)}-${rnd}`;
  }

  function getSessionClientId() {
    try {
      let id = sessionStorage.getItem(CLIENT_ID_STORAGE_KEY);
      if (!id) {
        id = generateClientId();
        sessionStorage.setItem(CLIENT_ID_STORAGE_KEY, id);
      }
      return id;
    } catch {
      return generateClientId();
    }
  }

  function getConfig() {
    const cfg = global.SUPABASE_CONFIG;
    if (!cfg || typeof cfg.url !== 'string' || typeof cfg.anonKey !== 'string') return null;
    const url = cfg.url.trim().replace(/\/+$/, '');
    const anonKey = cfg.anonKey.trim();
    if (!/^https:\/\/[^/]+$/i.test(url) || !anonKey) return null;
    return { url, anonKey };
  }

  class MultiplayerNetwork {
    constructor() {
      this.clientId = getSessionClientId();
      this.handlers = new Map();
      this.localProfile = { username: 'Player', avatar: 'cpu', status: 'Available', roomCode: null };
      this.activeRoomSnapshot = null;

      this.connected = false;
      this.connectionMode = 'offline'; // 'supabase' | 'local' | 'channel' | 'offline'
      this.lastError = '';

      this.localServerAvailable = false;
      this.localSeq = 0;
      this.localPollTimer = 0;
      this.pollMode = 'idle'; // 'idle' | 'lobby' | 'match'

      this.bc = null;
      this.bcPeers = new Map();
      this.bcPublicRooms = new Map();

      this.sbClient = null;
      this.sbLobbyChannel = null;
      this.sbRoomChannel = null;
      this.sbRoomCode = null;
      this.sbConnected = false;
      this.sbRoomsTableAvailable = true;
      this.sbSdkPromise = null;

      this.heartbeatTimer = 0;
      this.closedCodes = new Set();
      this.seenMessages = new Set();
      this.serverPlayers = [];
      this.serverPublicRooms = [];
      this.serverAllRooms = {};
      this.supabasePlayers = [];
      this.supabasePublicRooms = new Map();
      this.disconnectTimers = new Map();
      this.lastSeenByClient = new Map();
      this.beforeUnloadBound = false;
      this.lastEmittedStateKey = '';
      this.sbTickCount = 0;
    }

    recordPeerSeen(clientId) {
      if (!clientId || clientId === this.clientId) return;
      this.lastSeenByClient.set(clientId, Date.now());
      const existingTimer = this.disconnectTimers.get(clientId);
      if (existingTimer) {
        global.clearTimeout(existingTimer);
        this.disconnectTimers.delete(clientId);
      }
    }

    isPeerAlive(clientId) {
      if (!clientId) return false;
      if (clientId === this.clientId) return true;
      const now = Date.now();
      const lobbyState = this.sbLobbyChannel?.presenceState?.();
      if (lobbyState && Array.isArray(lobbyState[clientId]) && lobbyState[clientId].length > 0) return true;
      const roomState = this.sbRoomChannel?.presenceState?.();
      if (roomState && Array.isArray(roomState[clientId]) && roomState[clientId].length > 0) return true;
      if (this.serverPlayers.some((p) => p.clientId === clientId && (now - p.receivedAt) < 40000)) return true;
      const bcPeer = this.bcPeers.get(clientId);
      if (bcPeer && (now - bcPeer.receivedAt) < 40000) return true;
      const lastSeen = this.lastSeenByClient.get(clientId) || 0;
      return (now - lastSeen) < 4000;
    }

    scheduleDisconnectVerification(clientId, roomCode = null, source = 'presence', delayMs = 4500) {
      if (!clientId || clientId === this.clientId) return;
      if (this.isPeerAlive(clientId) && source !== 'bye') return;
      if (this.disconnectTimers.has(clientId)) return;
      const timer = global.setTimeout(() => {
        this.disconnectTimers.delete(clientId);
        if (this.isPeerAlive(clientId)) return;
        this.emit('peer_disconnected', { clientId, roomCode, source });
      }, delayMs);
      this.disconnectTimers.set(clientId, timer);
    }

    on(event, fn) {
      if (!this.handlers.has(event)) this.handlers.set(event, new Set());
      this.handlers.get(event).add(fn);
      return () => this.handlers.get(event)?.delete(fn);
    }

    emit(event, detail) {
      const set = this.handlers.get(event);
      if (!set) return;
      for (const fn of set) {
        try {
          fn(detail);
        } catch (err) {
          console.error(`MultiplayerNetwork handler error (${event}):`, err);
        }
      }
    }

    markSeen(msgId) {
      if (!msgId) return false;
      if (this.seenMessages.has(msgId)) return true;
      this.seenMessages.add(msgId);
      if (this.seenMessages.size > 400) {
        const first = this.seenMessages.values().next().value;
        this.seenMessages.delete(first);
      }
      return false;
    }

    nextMsgId() {
      return `${this.clientId}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 7)}`;
    }

    updateConnectionState() {
      const modes = [];
      if (this.sbConnected) modes.push('supabase');
      if (this.localServerAvailable) modes.push('local');
      if (this.bc) modes.push('channel');

      if (this.sbConnected) this.connectionMode = 'supabase';
      else if (this.localServerAvailable) this.connectionMode = 'local';
      else if (this.bc) this.connectionMode = 'channel';
      else this.connectionMode = 'offline';

      this.connected = modes.length > 0;
      this.emit('connection', {
        connected: this.connected,
        mode: this.connectionMode,
        supabase: this.sbConnected,
        localServer: this.localServerAvailable,
        error: this.lastError,
      });
    }

    async connect(profile) {
      if (profile) {
        this.localProfile = { ...this.localProfile, ...profile };
      }
      this.bindUnload();
      this.initBroadcastChannel();

      await this.probeLocalServer();
      if (this.localServerAvailable) {
        await this.postLocalEvent('presence', null, this.localProfile);
        if (this.pollMode === 'idle') this.pollMode = 'lobby';
        this.startLocalPolling();
      }

      // Connect Supabase Realtime without blocking offline environments.
      this.connectSupabase().catch((err) => {
        console.warn('Supabase Realtime unavailable, continuing with available transports:', err?.message || err);
      });

      this.startHeartbeat();
      this.updateConnectionState();
      this.emitMergedState();
      return this.connected;
    }

    setPollingMode(mode) {
      const next = (mode === 'match' || mode === 'lobby') ? mode : 'idle';
      if (this.pollMode === next && (next === 'idle' || this.localPollTimer)) return;
      this.pollMode = next;
      if (next === 'idle') {
        this.stopLocalPolling();
      } else if (this.localServerAvailable) {
        this.stopLocalPolling();
        this.startLocalPolling();
      }
    }

    stopLocalPolling() {
      if (this.localPollTimer) {
        global.clearTimeout(this.localPollTimer);
        this.localPollTimer = 0;
      }
    }

    stopHeartbeat() {
      if (this.heartbeatTimer) {
        global.clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = 0;
      }
    }

    async disconnect() {
      this.pollMode = 'idle';
      this.stopLocalPolling();
      this.stopHeartbeat();
      await this.leaveSupabaseRoomChannel();
      const lobbyCh = this.sbLobbyChannel;
      this.sbLobbyChannel = null;
      this.sbConnected = false;
      if (lobbyCh) {
        try { await lobbyCh.untrack(); } catch {}
        try { await lobbyCh.unsubscribe(); } catch {}
        if (this.sbClient && typeof this.sbClient.removeChannel === 'function') {
          try { this.sbClient.removeChannel(lobbyCh); } catch {}
        }
      }
      this.updateConnectionState();
    }

    bindUnload() {
      if (this.beforeUnloadBound) return;
      this.beforeUnloadBound = true;
      const onExit = () => {
        const room = this.activeRoomSnapshot;
        if (room && room.code && room.host?.clientId === this.clientId) {
          this.deleteDbRoom(room.code, { keepalive: true });
        }
        if (this.localServerAvailable && navigator.sendBeacon) {
          try {
            const payload = JSON.stringify({
              type: 'leave_mp',
              clientId: this.clientId,
              roomCode: this.localProfile.roomCode || '',
              payload: { reason: `${this.localProfile.username} disconnected.` },
            });
            navigator.sendBeacon('/api/mp/event', new Blob([payload], { type: 'text/plain' }));
          } catch {}
        }
        if (this.bc) {
          try {
            this.bc.postMessage({
              msgId: this.nextMsgId(),
              senderId: this.clientId,
              type: 'bc_bye',
              roomCode: this.localProfile.roomCode || null,
            });
          } catch {}
        }
      };
      global.addEventListener('pagehide', onExit);
      global.addEventListener('beforeunload', onExit);
      const onResume = () => {
        if (document.visibilityState === 'hidden') return;
        const payload = this.buildPresencePayload();
        if (this.localServerAvailable) {
          this.postLocalEvent('presence', this.localProfile.roomCode, payload);
        }
        if (this.bc) {
          this.postBroadcast('bc_presence', null, payload);
        }
        if (this.sbLobbyChannel && this.sbConnected) {
          try { this.sbLobbyChannel.track(payload); } catch {}
        }
      };
      document.addEventListener('visibilitychange', onResume);
      global.addEventListener('focus', onResume);
    }

    // ===== Local Server (/api/mp/*) =====
    async probeLocalServer() {
      if (!/^https?:$/i.test(global.location?.protocol || '')) {
        this.localServerAvailable = false;
        return false;
      }
      try {
        const res = await fetch('/api/mp/state?since=0', { cache: 'no-store' });
        if (!res.ok) {
          this.localServerAvailable = false;
          return false;
        }
        const data = await res.json();
        if (data && data.ok === true) {
          this.localServerAvailable = true;
          this.applyLocalStateSnapshot(data, { emitEvents: false });
          return true;
        }
      } catch {
        this.localServerAvailable = false;
      }
      return false;
    }

    async postLocalEvent(type, roomCode, payload = {}) {
      if (!this.localServerAvailable) return null;
      try {
        const res = await fetch('/api/mp/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({
            type,
            clientId: this.clientId,
            roomCode: roomCode || '',
            payload,
          }),
        });
        const text = await res.text();
        let data = null;
        try { data = JSON.parse(text); } catch {}
        if (!data) {
          return { ok: false, error: `Server returned status ${res.status}.` };
        }
        return data;
      } catch (err) {
        return { ok: false, code: 'NETWORK_ERROR', error: err.message || 'Network request failed.' };
      }
    }

    startLocalPolling() {
      if (this.localPollTimer || this.pollMode === 'idle' || !this.localServerAvailable) return;
      const scheduleNext = (delayMs) => {
        if (this.pollMode === 'idle' || !this.localServerAvailable) {
          this.localPollTimer = 0;
          return;
        }
        this.localPollTimer = global.setTimeout(poll, delayMs);
      };
      const poll = async () => {
        this.localPollTimer = 0;
        if (!this.localServerAvailable || this.pollMode === 'idle') return;
        let nextDelay = this.pollMode === 'match' ? 450 : 1500;
        try {
          const res = await fetch(`/api/mp/state?since=${this.localSeq}`, { cache: 'no-store' });
          if (res.status === 429 || res.status === 503) {
            const retrySec = Number(res.headers.get('Retry-After')) || 3;
            nextDelay = Math.min(10000, Math.max(2500, retrySec * 1000));
          } else if (res.ok) {
            const data = await res.json();
            if (data && data.ok) {
              this.applyLocalStateSnapshot(data, { emitEvents: true });
            }
          }
        } catch {
          nextDelay = Math.min(5000, nextDelay * 2);
        }
        scheduleNext(nextDelay);
      };
      scheduleNext(this.pollMode === 'match' ? 450 : 1500);
    }

    applyLocalStateSnapshot(data, { emitEvents = true } = {}) {
      if (Number.isFinite(data.seq)) {
        this.localSeq = Math.max(this.localSeq, data.seq);
      }
      this.serverPlayers = Array.isArray(data.players)
        ? data.players.map((p) => {
            if (p.ageMs < 15000) this.recordPeerSeen(p.clientId);
            return { ...p, receivedAt: Date.now() - (p.ageMs || 0), source: 'local' };
          })
        : [];
      this.serverPublicRooms = Array.isArray(data.publicRooms) ? data.publicRooms : [];
      this.serverAllRooms = (data.rooms && typeof data.rooms === 'object') ? data.rooms : {};
      if (Array.isArray(data.closedCodes)) {
        for (const c of data.closedCodes) this.closedCodes.add(String(c).toUpperCase());
      }
      if (emitEvents && Array.isArray(data.events)) {
        for (const ev of data.events) {
          const msgId = `local:${ev.seq}`;
          if (this.markSeen(msgId)) continue;
          if (ev.targetClientId && ev.targetClientId !== this.clientId) continue;
          this.emit('net_event', {
            source: 'local',
            type: ev.type,
            roomCode: ev.roomCode,
            payload: ev.payload,
          });
        }
      }
      this.emitMergedState();
    }

    // ===== Same-Origin BroadcastChannel =====
    initBroadcastChannel() {
      if (this.bc || typeof global.BroadcastChannel !== 'function') return;
      try {
        this.bc = new global.BroadcastChannel('bytebound_mp_v1');
        this.bc.onmessage = (event) => {
          const msg = event.data;
          if (!msg || msg.senderId === this.clientId) return;
          if (msg.msgId && this.markSeen(msg.msgId)) return;
          if (msg.targetClientId && msg.targetClientId !== this.clientId) return;

          if (msg.type === 'bc_presence') {
            this.recordPeerSeen(msg.senderId);
            this.bcPeers.set(msg.senderId, {
              ...msg.payload,
              clientId: msg.senderId,
              receivedAt: Date.now(),
              source: 'channel',
            });
            if (msg.payload?.hostingPublicRoom) {
              this.bcPublicRooms.set(msg.payload.hostingPublicRoom.code, {
                ...msg.payload.hostingPublicRoom,
                receivedAt: Date.now(),
              });
            } else {
              for (const [code, room] of this.bcPublicRooms.entries()) {
                if (room.hostClientId === msg.senderId) this.bcPublicRooms.delete(code);
              }
            }
            this.emitMergedState();
            return;
          }

          if (msg.type === 'bc_bye') {
            this.bcPeers.delete(msg.senderId);
            for (const [code, room] of this.bcPublicRooms.entries()) {
              if (room.hostClientId === msg.senderId) this.bcPublicRooms.delete(code);
            }
            this.scheduleDisconnectVerification(msg.senderId, msg.roomCode || null, 'bye', 1600);
            this.emitMergedState();
            return;
          }

          this.recordPeerSeen(msg.senderId);

          if (msg.type === 'room_probe') {
            if (this.activeRoomSnapshot && this.activeRoomSnapshot.code === msg.roomCode &&
              this.activeRoomSnapshot.host?.clientId === this.clientId) {
              this.postBroadcast('room_probe_reply', msg.roomCode, { room: this.activeRoomSnapshot }, msg.senderId);
            }
            return;
          }

          if (msg.type === 'room_closed') {
            this.closedCodes.add(String(msg.roomCode || '').toUpperCase());
            this.bcPublicRooms.delete(msg.roomCode);
          }

          this.emit('net_event', {
            source: 'channel',
            senderId: msg.senderId,
            type: msg.type,
            roomCode: msg.roomCode,
            payload: msg.payload,
          });
        };
        this.postBroadcast('bc_presence', null, this.buildPresencePayload());
      } catch {
        this.bc = null;
      }
    }

    postBroadcast(type, roomCode, payload, targetClientId = null) {
      if (!this.bc) return;
      try {
        this.bc.postMessage({
          msgId: this.nextMsgId(),
          senderId: this.clientId,
          targetClientId,
          type,
          roomCode,
          payload,
        });
      } catch {}
    }

    // ===== Supabase Realtime (Internet Cross-Computer Transport) =====
    async loadSupabaseSdk() {
      if (global.supabase && typeof global.supabase.createClient === 'function') {
        return global.supabase;
      }
      if (this.sbSdkPromise) return this.sbSdkPromise;
      this.sbSdkPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = SUPABASE_CDN_URL;
        script.async = true;
        const timer = global.setTimeout(() => {
          reject(new Error('Timed out loading Supabase Realtime SDK.'));
        }, 4000);
        script.onload = () => {
          global.clearTimeout(timer);
          if (global.supabase && typeof global.supabase.createClient === 'function') {
            resolve(global.supabase);
          } else {
            reject(new Error('Supabase SDK did not initialize.'));
          }
        };
        script.onerror = () => {
          global.clearTimeout(timer);
          reject(new Error('Failed to load Supabase SDK.'));
        };
        document.head.appendChild(script);
      });
      return this.sbSdkPromise;
    }

    async connectSupabase() {
      const cfg = getConfig();
      if (!cfg) return false;
      if (this.sbConnected && this.sbLobbyChannel) return true;

      const sdk = await this.loadSupabaseSdk();
      if (!this.sbClient) {
        this.sbClient = sdk.createClient(cfg.url, cfg.anonKey, {
          realtime: { params: { eventsPerSecond: 10 } },
        });
      }

      if (!this.sbLobbyChannel) {
        const channel = this.sbClient.channel('bytebound:lobby:v1', {
          config: {
            presence: { key: this.clientId },
            broadcast: { self: false },
          },
        });
        channel
          .on('presence', { event: 'sync' }, () => this.syncSupabasePresence())
          .on('presence', { event: 'join' }, () => this.syncSupabasePresence())
          .on('presence', { event: 'leave' }, ({ key, currentPresences, leftPresences }) => {
            const leftId = key || leftPresences?.[0]?.clientId;
            this.syncSupabasePresence();
            if (!leftId || leftId === this.clientId) return;
            if (Array.isArray(currentPresences) && currentPresences.length > 0) return;
            const state = channel.presenceState?.() || {};
            if (Array.isArray(state[leftId]) && state[leftId].length > 0) return;
            this.scheduleDisconnectVerification(leftId, null, 'supabase');
          })
          .on('broadcast', { event: 'lobby_event' }, ({ payload }) => {
            if (!payload || payload.senderId === this.clientId) return;
            if (payload.msgId && this.markSeen(payload.msgId)) return;
            this.recordPeerSeen(payload.senderId);
            if (payload.type === 'public_room_remove') {
              this.supabasePublicRooms.delete(payload.roomCode);
              this.emitMergedState();
            } else if (payload.type === 'public_room_upsert' && payload.room) {
              this.supabasePublicRooms.set(payload.room.code, payload.room);
              this.emitMergedState();
            } else if (payload.type === 'room_closed') {
              this.closedCodes.add(String(payload.roomCode || '').toUpperCase());
              this.supabasePublicRooms.delete(payload.roomCode);
              this.emitMergedState();
            } else if (payload.type === 'room_invite' && payload.invite) {
              if (payload.targetClientId && payload.targetClientId !== this.clientId) return;
              this.emit('net_event', {
                source: 'supabase',
                senderId: payload.senderId,
                type: 'room_invite',
                roomCode: payload.roomCode,
                payload: payload.invite,
              });
            }
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'multiplayer_rooms' }, (pgPayload) => {
            this.handleDbRoomRealtimeEvent(pgPayload);
          });

        this.sbLobbyChannel = channel;
        await new Promise((resolve) => {
          const timeout = global.setTimeout(() => resolve(false), 4500);
          channel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              global.clearTimeout(timeout);
              this.sbConnected = true;
              try {
                await channel.track(this.buildPresencePayload());
              } catch {}
              // If user already created/joined a room before Supabase finished connecting, join its room channel now.
              if (this.activeRoomSnapshot && this.activeRoomSnapshot.code) {
                const asHost = this.activeRoomSnapshot.host?.clientId === this.clientId;
                this.joinSupabaseRoomChannel(this.activeRoomSnapshot.code, asHost).catch(() => {});
              }
              this.updateConnectionState();
              this.syncSupabasePresence();
              resolve(true);
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              global.clearTimeout(timeout);
              this.sbConnected = false;
              this.updateConnectionState();
              resolve(false);
            }
          });
        });
      }
      return this.sbConnected;
    }

    syncSupabasePresence() {
      if (!this.sbLobbyChannel || typeof this.sbLobbyChannel.presenceState !== 'function') return;
      const state = this.sbLobbyChannel.presenceState();
      const players = [];
      const livePublic = new Map();
      const presentIds = new Set();
      for (const [key, metas] of Object.entries(state || {})) {
        const meta = Array.isArray(metas) && metas.length ? metas[metas.length - 1] : null;
        if (!meta || !meta.clientId) continue;
        const cid = meta.clientId || key;
        presentIds.add(cid);
        this.recordPeerSeen(cid);
        players.push({
          clientId: cid,
          username: meta.username || 'Player',
          avatar: meta.avatar || 'cpu',
          status: meta.status || 'Available',
          roomCode: meta.roomCode || null,
          receivedAt: Date.now(),
          source: 'supabase',
        });
        if (meta.hostingPublicRoom && meta.hostingPublicRoom.code && !this.closedCodes.has(meta.hostingPublicRoom.code)) {
          livePublic.set(meta.hostingPublicRoom.code, meta.hostingPublicRoom);
        }
      }
      // Preserve broadcast/DB rooms whose host is still present or recently seen, unless explicitly closed/removed.
      for (const [code, room] of this.supabasePublicRooms.entries()) {
        if (!livePublic.has(code) && !this.closedCodes.has(code) && (!room.hostClientId || presentIds.has(room.hostClientId))) {
          livePublic.set(code, room);
        }
      }
      this.supabasePlayers = players;
      this.supabasePublicRooms = livePublic;
      this.emitMergedState();
    }

    async joinSupabaseRoomChannel(code, asHost = false) {
      if (!this.sbClient || !code) return null;
      const chState = this.sbRoomChannel?.state;
      if (this.sbRoomChannel && this.sbRoomCode === code && (chState === 'joined' || chState === 'joining')) {
        return this.sbRoomChannel;
      }
      await this.leaveSupabaseRoomChannel();

      const channel = this.sbClient.channel(`bytebound:room:${code}`, {
        config: {
          presence: { key: this.clientId },
          broadcast: { self: false },
        },
      });
      this.sbRoomCode = code;
      this.sbRoomChannel = channel;

      channel
        .on('presence', { event: 'leave' }, ({ key, currentPresences, leftPresences }) => {
          const leftId = key || leftPresences?.[0]?.clientId;
          if (!leftId || leftId === this.clientId) return;
          if (Array.isArray(currentPresences) && currentPresences.length > 0) return;
          const state = channel.presenceState?.() || {};
          if (Array.isArray(state[leftId]) && state[leftId].length > 0) return;
          this.scheduleDisconnectVerification(leftId, code, 'supabase');
        })
        .on('broadcast', { event: 'room_msg' }, ({ payload }) => {
          if (!payload || payload.senderId === this.clientId) return;
          if (payload.msgId && this.markSeen(payload.msgId)) return;
          if (payload.targetClientId && payload.targetClientId !== this.clientId) return;
          this.recordPeerSeen(payload.senderId);
          if (payload.type === 'room_closed') {
            this.closedCodes.add(String(code).toUpperCase());
          }
          this.emit('net_event', {
            source: 'supabase',
            senderId: payload.senderId,
            type: payload.type,
            roomCode: code,
            payload: payload.payload,
          });
        });

      await new Promise((resolve) => {
        const timeout = global.setTimeout(() => resolve(false), 3500);
        channel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            global.clearTimeout(timeout);
            try {
              await channel.track({
                clientId: this.clientId,
                username: this.localProfile.username,
                avatar: this.localProfile.avatar,
                role: asHost ? 'host' : 'guest',
                roomSnapshot: asHost ? this.activeRoomSnapshot : null,
              });
            } catch {}
            resolve(true);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            global.clearTimeout(timeout);
            resolve(false);
          }
        });
      });

      return channel;
    }

    async leaveSupabaseRoomChannel() {
      const ch = this.sbRoomChannel;
      this.sbRoomChannel = null;
      this.sbRoomCode = null;
      if (ch) {
        try { await ch.untrack(); } catch {}
        try { await ch.unsubscribe(); } catch {}
        if (this.sbClient && typeof this.sbClient.removeChannel === 'function') {
          try { this.sbClient.removeChannel(ch); } catch {}
        }
      }
    }

    async sendSupabaseRoomBroadcast(type, roomCode, payload, targetClientId = null) {
      if (this.sbClient && roomCode && (!this.sbRoomChannel || this.sbRoomCode !== roomCode || (this.sbRoomChannel.state && this.sbRoomChannel.state !== 'joined' && this.sbRoomChannel.state !== 'joining'))) {
        const asHost = this.activeRoomSnapshot?.host?.clientId === this.clientId;
        await this.joinSupabaseRoomChannel(roomCode, asHost);
      }
      if (!this.sbRoomChannel || this.sbRoomCode !== roomCode) return;
      try {
        await withTimeout(this.sbRoomChannel.send({
          type: 'broadcast',
          event: 'room_msg',
          payload: {
            msgId: this.nextMsgId(),
            senderId: this.clientId,
            targetClientId,
            type,
            roomCode,
            payload,
          },
        }), 4000);
      } catch {}
    }

    async sendSupabaseLobbyBroadcast(type, roomCode, room = null, extra = {}) {
      if (!this.sbLobbyChannel || !this.sbConnected) return;
      try {
        await withTimeout(this.sbLobbyChannel.send({
          type: 'broadcast',
          event: 'lobby_event',
          payload: {
            msgId: this.nextMsgId(),
            senderId: this.clientId,
            type,
            roomCode,
            room,
            ...extra,
          },
        }), 1200);
      } catch {}
    }

    async sendRoomInvite(targetClientId, invitePayload) {
      const code = invitePayload?.roomCode || this.localProfile.roomCode || '';
      const payload = {
        ...invitePayload,
        roomCode: code,
        targetClientId: targetClientId || null,
      };
      if (this.localServerAvailable) {
        await this.postLocalEvent('invite_player', code, payload);
      }
      this.postBroadcast('room_invite', code, invitePayload, targetClientId || null);
      await this.sendSupabaseLobbyBroadcast('room_invite', code, null, {
        targetClientId: targetClientId || null,
        invite: invitePayload,
      });
    }

    // Optional SQL persistence in public.multiplayer_rooms (fails gracefully if schema not yet applied)
    async sbRestRoom(method, query = '', body = null, { keepalive = false, prefer = 'resolution=merge-duplicates,return=representation' } = {}) {
      const cfg = getConfig();
      if (!cfg || !this.sbRoomsTableAvailable) return null;
      try {
        const headers = {
          apikey: cfg.anonKey,
          ...(cfg.anonKey.split('.').length === 3 ? { Authorization: `Bearer ${cfg.anonKey}` } : {}),
          'Content-Type': 'application/json',
        };
        if (prefer) headers.Prefer = prefer;
        const res = await fetch(`${cfg.url}/rest/v1/multiplayer_rooms${query}`, {
          method,
          keepalive: Boolean(keepalive),
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });
        if (res.status === 404 || res.status === 400) {
          const txt = await res.text();
          if (txt.includes('multiplayer_rooms') || txt.includes('PGRST205')) {
            this.sbRoomsTableAvailable = false;
            return null;
          }
          return null;
        }
        if (!res.ok) return null;
        const text = await res.text();
        return text ? JSON.parse(text) : [];
      } catch {
        return null;
      }
    }

    async sbRpc(fnName, body = {}) {
      const cfg = getConfig();
      if (!cfg || !this.sbRoomsTableAvailable) return null;
      try {
        const res = await fetch(`${cfg.url}/rest/v1/rpc/${fnName}`, {
          method: 'POST',
          headers: {
            apikey: cfg.anonKey,
            ...(cfg.anonKey.split('.').length === 3 ? { Authorization: `Bearer ${cfg.anonKey}` } : {}),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) return null;
        const text = await res.text();
        return text ? JSON.parse(text) : null;
      } catch {
        return null;
      }
    }

    mapDbRowToPublicRoom(row) {
      if (!row || !row.code) return null;
      return {
        code: String(row.code).toUpperCase(),
        hostClientId: row.host_client_id,
        hostName: row.host_name,
        hostAvatar: row.host_avatar || 'gold',
        hostTitleId: row.room_state?.host?.titleId || '',
        arenaId: row.settings?.arenaId || 'arena',
        arenaName: row.settings?.arenaName || 'Cyber Arena',
        category: row.settings?.category || 'ALL',
        yearLevel: row.settings?.yearLevel || 4,
        status: 'waiting',
        playerCount: 1,
        maxPlayers: 2,
        createdAt: Date.parse(row.created_at || '') || Date.now(),
        source: 'db',
      };
    }

    handleDbRoomRealtimeEvent(pgPayload) {
      if (!pgPayload) return;
      const evType = String(pgPayload.eventType || pgPayload.type || '').toUpperCase();
      const rawRow = evType === 'DELETE' ? (pgPayload.old || pgPayload.record) : (pgPayload.new || pgPayload.record);
      const code = String(rawRow?.code || pgPayload.old?.code || '').trim().toUpperCase();
      if (!code) return;

      if (evType === 'DELETE' || rawRow?.status === 'closed') {
        this.supabasePublicRooms.delete(code);
        if (this.activeRoomSnapshot?.code === code && this.activeRoomSnapshot.host?.clientId !== this.clientId) {
          this.closedCodes.add(code);
          this.emit('net_event', {
            source: 'supabase',
            type: 'room_closed',
            roomCode: code,
            payload: { code, reason: 'Room closed or ended.' },
          });
        }
        this.emitMergedState();
        return;
      }

      if (rawRow.visibility === 'public' && rawRow.status === 'waiting' && !rawRow.guest_client_id) {
        this.closedCodes.delete(code);
        const mapped = this.mapDbRowToPublicRoom(rawRow);
        if (mapped) this.supabasePublicRooms.set(code, mapped);
      } else {
        this.supabasePublicRooms.delete(code);
      }
      this.emitMergedState();
    }

    async upsertDbRoom(room) {
      if (!room || !room.code) return null;
      const code = String(room.code).toUpperCase();
      return await this.sbRestRoom('POST', '', {
        code,
        visibility: room.visibility === 'private' ? 'private' : 'public',
        status: room.status || 'waiting',
        host_client_id: room.host?.clientId || this.clientId,
        host_name: room.host?.username || this.localProfile.username || 'Host',
        host_avatar: room.host?.avatar || this.localProfile.avatar || 'gold',
        guest_client_id: room.guest?.clientId || null,
        guest_name: room.guest?.username || null,
        guest_avatar: room.guest?.avatar || null,
        settings: {
          arenaId: room.arenaId,
          arenaName: room.arenaName,
          category: room.category,
          yearLevel: room.yearLevel || 4,
        },
        room_state: room,
        updated_at: new Date().toISOString(),
      });
    }

    async patchDbRoom(room) {
      if (!room || !room.code) return null;
      const code = String(room.code).toUpperCase();
      if (this.closedCodes.has(code)) return null;
      return await this.sbRestRoom('PATCH', `?code=eq.${encodeURIComponent(code)}`, {
        status: room.status || 'waiting',
        guest_client_id: room.guest?.clientId || null,
        guest_name: room.guest?.username || null,
        guest_avatar: room.guest?.avatar || null,
        settings: {
          arenaId: room.arenaId,
          arenaName: room.arenaName,
          category: room.category,
          yearLevel: room.yearLevel || 4,
        },
        room_state: room,
        updated_at: new Date().toISOString(),
      }, { prefer: 'return=representation' });
    }

    async deleteDbRoom(code, { keepalive = false } = {}) {
      const normCode = String(code || '').trim().toUpperCase();
      if (!normCode) return null;
      this.supabasePublicRooms.delete(normCode);
      return await this.sbRestRoom('DELETE', `?code=eq.${encodeURIComponent(normCode)}`, null, {
        keepalive,
        prefer: 'return=minimal',
      });
    }

    async touchDbRoom(code) {
      const normCode = String(code || '').trim().toUpperCase();
      if (!normCode || this.closedCodes.has(normCode)) return null;
      const rpcRes = await this.sbRpc('mp_heartbeat_room', {
        p_code: normCode,
        p_host_client_id: this.clientId,
      });
      if (rpcRes && typeof rpcRes === 'object') return rpcRes;
      return await this.sbRestRoom('PATCH', `?code=eq.${encodeURIComponent(normCode)}&host_client_id=eq.${encodeURIComponent(this.clientId)}`, {
        updated_at: new Date().toISOString(),
      }, { prefer: 'return=minimal' });
    }

    async pruneStaleDbRooms() {
      const rpcRes = await this.sbRpc('mp_prune_stale_rooms', { p_ttl_seconds: 60 });
      if (rpcRes && typeof rpcRes === 'object') return rpcRes;
      const staleIso = new Date(Date.now() - 65 * 1000).toISOString();
      await this.sbRestRoom('DELETE', `?or=(status.eq.closed,updated_at.lt.${encodeURIComponent(staleIso)})`, null, {
        prefer: 'return=minimal',
      });
      return { ok: true };
    }

    buildPresencePayload() {
      const hostingPublic =
        this.activeRoomSnapshot &&
        this.activeRoomSnapshot.host?.clientId === this.clientId &&
        this.activeRoomSnapshot.visibility === 'public' &&
        this.activeRoomSnapshot.status === 'waiting' &&
        !this.activeRoomSnapshot.guest
          ? {
              code: this.activeRoomSnapshot.code,
              hostClientId: this.clientId,
              hostName: this.localProfile.username,
              hostAvatar: this.localProfile.avatar,
              arenaId: this.activeRoomSnapshot.arenaId,
              arenaName: this.activeRoomSnapshot.arenaName,
              category: this.activeRoomSnapshot.category,
              yearLevel: this.activeRoomSnapshot.yearLevel || 4,
              status: 'waiting',
              playerCount: 1,
              maxPlayers: 2,
              createdAt: this.activeRoomSnapshot.createdAt,
            }
          : null;
      return {
        clientId: this.clientId,
        username: this.localProfile.username,
        avatar: this.localProfile.avatar,
        titleId: this.localProfile.titleId || '',
        status: this.localProfile.status,
        roomCode: this.localProfile.roomCode || null,
        hostingPublicRoom: hostingPublic,
      };
    }

    async updatePresence(patch) {
      this.localProfile = { ...this.localProfile, ...patch };
      const payload = this.buildPresencePayload();
      if (this.localServerAvailable) {
        await this.postLocalEvent('presence', this.localProfile.roomCode, payload);
      }
      if (this.bc) {
        this.postBroadcast('bc_presence', null, payload);
      }
      if (this.sbLobbyChannel && this.sbConnected) {
        try { await withTimeout(this.sbLobbyChannel.track(payload), 1200); } catch {}
      }
      if (this.sbRoomChannel && this.sbRoomCode && this.activeRoomSnapshot?.host?.clientId === this.clientId) {
        try {
          await withTimeout(this.sbRoomChannel.track({
            clientId: this.clientId,
            username: this.localProfile.username,
            avatar: this.localProfile.avatar,
            role: 'host',
            roomSnapshot: this.activeRoomSnapshot,
          }), 1200);
        } catch {}
      }
      this.emitMergedState();
    }

    startHeartbeat() {
      if (this.heartbeatTimer) return;
      this.heartbeatTimer = global.setInterval(() => {
        if (this.pollMode === 'idle') return;
        const now = Date.now();
        // Prune stale BroadcastChannel peers (> 45s without heartbeat; tolerates background tab throttling)
        let bcChanged = false;
        for (const [id, peer] of this.bcPeers.entries()) {
          if (now - peer.receivedAt > 45000) {
            this.bcPeers.delete(id);
            for (const [code, r] of this.bcPublicRooms.entries()) {
              if (r.hostClientId === id) this.bcPublicRooms.delete(code);
            }
            if (!this.isPeerAlive(id)) {
              this.scheduleDisconnectVerification(id, peer.roomCode || null, 'channel');
            }
            bcChanged = true;
          }
        }
        if (bcChanged) this.emitMergedState();

        const payload = this.buildPresencePayload();
        if (this.localServerAvailable) {
          this.postLocalEvent('presence', this.localProfile.roomCode, payload);
        }
        if (this.bc) {
          this.postBroadcast('bc_presence', null, payload);
        }
        this.sbTickCount = (this.sbTickCount || 0) + 1;
        if (this.sbLobbyChannel && this.sbConnected && this.sbTickCount % 5 === 0) {
          try { this.sbLobbyChannel.track(payload); } catch {}
        }
        if (this.activeRoomSnapshot?.code && this.activeRoomSnapshot.host?.clientId === this.clientId && this.sbTickCount % 7 === 0) {
          this.touchDbRoom(this.activeRoomSnapshot.code).catch(() => {});
        }
      }, 2200);
    }

    emitMergedState(force = false) {
      const playerMap = new Map();
      // Local self is always accurate immediately
      playerMap.set(this.clientId, {
        clientId: this.clientId,
        username: this.localProfile.username,
        avatar: this.localProfile.avatar,
        status: this.localProfile.status,
        roomCode: this.localProfile.roomCode || null,
        isSelf: true,
      });

      const now = Date.now();
      for (const p of [...this.serverPlayers, ...this.supabasePlayers, ...this.bcPeers.values()]) {
        if (!p || !p.clientId || p.clientId === this.clientId) continue;
        if (p.source === 'channel' && now - p.receivedAt > 45000) continue;
        const existing = playerMap.get(p.clientId);
        if (!existing || (p.source === 'supabase' && existing.source !== 'supabase')) {
          playerMap.set(p.clientId, { ...p, isSelf: false });
        }
      }

      const publicRoomMap = new Map();
      for (const r of [
        ...this.serverPublicRooms,
        ...this.supabasePublicRooms.values(),
        ...this.bcPublicRooms.values(),
      ]) {
        if (!r || !r.code) continue;
        if (r.status !== 'waiting' || (r.playerCount || 1) >= 2) continue;
        if (!publicRoomMap.has(r.code)) {
          publicRoomMap.set(r.code, r);
        }
      }

      // Deduplicate same username across stale/reloaded tabs: keep isSelf first, then newest active peer.
      const byName = new Map();
      for (const p of playerMap.values()) {
        const normName = String(p.username || '').trim().toLowerCase() || p.clientId;
        const prev = byName.get(normName);
        if (!prev) {
          byName.set(normName, p);
          continue;
        }
        if (prev.isSelf) continue;
        if (p.isSelf) {
          byName.set(normName, p);
          continue;
        }
        const prevScore = (prev.roomCode ? 1000000000000 : 0) + (prev.receivedAt || 0);
        const currScore = (p.roomCode ? 1000000000000 : 0) + (p.receivedAt || 0);
        if (currScore > prevScore) {
          byName.set(normName, p);
        }
      }

      const players = [...byName.values()];
      const publicRooms = [...publicRoomMap.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      const stateKey = JSON.stringify({
        players: players.map((p) => [p.clientId, p.username, p.avatar, p.status, p.roomCode || null, p.isSelf]),
        rooms: publicRooms.map((r) => [r.code, r.hostName, r.hostAvatar, r.arenaId, r.category, r.yearLevel || 4, r.status, r.playerCount]),
      });
      if (!force && stateKey === this.lastEmittedStateKey) return;
      this.lastEmittedStateKey = stateKey;

      this.emit('state', { players, publicRooms });
    }

    async refresh() {
      const dbPromise = (async () => {
        await this.pruneStaleDbRooms();
        const rows = await this.sbRestRoom('GET', '?visibility=eq.public&status=eq.waiting&order=updated_at.desc&limit=20', null, { prefer: null });
        if (!Array.isArray(rows)) return;
        const cutoff = Date.now() - 65 * 1000;
        const freshCodes = new Set();
        for (const row of rows) {
          const code = String(row?.code || '').toUpperCase();
          if (!code || this.closedCodes.has(code)) continue;
          const updated = Date.parse(row.updated_at || row.created_at || '') || 0;
          if (updated < cutoff || row.guest_client_id || row.status !== 'waiting') continue;
          freshCodes.add(code);
          const mapped = this.mapDbRowToPublicRoom(row);
          if (mapped) this.supabasePublicRooms.set(code, mapped);
        }
        for (const [code, room] of this.supabasePublicRooms.entries()) {
          if (room?.source === 'db' && !freshCodes.has(code)) {
            this.supabasePublicRooms.delete(code);
          }
        }
      })().catch(() => {});

      if (this.localServerAvailable) {
        try {
          const res = await fetch(`/api/mp/state?since=${this.localSeq}`, { cache: 'no-store' });
          if (res.ok) {
            const data = await res.json();
            if (data && data.ok) this.applyLocalStateSnapshot(data, { emitEvents: true });
          }
        } catch {}
      }
      this.syncSupabasePresence();
      await dbPromise;
      this.emitMergedState();
    }

    // ===== Room Operations =====
    async registerRoom(room) {
      this.activeRoomSnapshot = room;
      this.closedCodes.delete(room.code);
      if (this.localServerAvailable) {
        const res = await this.postLocalEvent('create_room', room.code, {
          visibility: room.visibility,
          arenaId: room.arenaId,
          arenaName: room.arenaName,
          category: room.category,
          yearLevel: room.yearLevel || 4,
          username: room.host.username,
          avatar: room.host.avatar,
        });
        if (res && !res.ok) return res;
      }

      const dbPromise = (getConfig() && this.sbRoomsTableAvailable)
        ? this.upsertDbRoom(room)
        : Promise.resolve(null);

      if (this.sbClient) {
        await this.joinSupabaseRoomChannel(room.code, true);
        if (room.visibility === 'public') {
          await this.sendSupabaseLobbyBroadcast('public_room_upsert', room.code, {
            code: room.code,
            hostClientId: room.host.clientId,
            hostName: room.host.username,
            hostAvatar: room.host.avatar,
            arenaId: room.arenaId,
            arenaName: room.arenaName,
            category: room.category,
            yearLevel: room.yearLevel || 4,
            status: 'waiting',
            playerCount: 1,
            maxPlayers: 2,
            createdAt: room.createdAt,
          });
        }
      }
      if (!this.localServerAvailable) {
        await dbPromise;
      }

      if (this.localServerAvailable) {
        this.updatePresence({ status: 'In Lobby', roomCode: room.code });
      } else {
        await this.updatePresence({ status: 'In Lobby', roomCode: room.code });
      }
      return { ok: true, room };
    }

    async syncRoomSnapshot(room, notice = null) {
      this.activeRoomSnapshot = room;
      if (!room) return;
      await this.updatePresence({
        status: room.status === 'in_match' ? 'In Match' : 'In Lobby',
        roomCode: room.code,
      });
      this.postBroadcast('room_state', room.code, { room, notice });
      if (this.sbConnected) {
        await this.sendSupabaseRoomBroadcast('room_state', room.code, { room, notice });
        if (room.visibility === 'public') {
          if (room.status === 'waiting' && !room.guest) {
            await this.sendSupabaseLobbyBroadcast('public_room_upsert', room.code, {
              code: room.code,
              hostClientId: room.host.clientId,
              hostName: room.host.username,
              hostAvatar: room.host.avatar,
              arenaId: room.arenaId,
              arenaName: room.arenaName,
              category: room.category,
              yearLevel: room.yearLevel || 4,
              status: 'waiting',
              playerCount: 1,
              maxPlayers: 2,
              createdAt: room.createdAt,
            });
          } else {
            await this.sendSupabaseLobbyBroadcast('public_room_remove', room.code);
          }
        }
      }
      if (getConfig() && this.sbRoomsTableAvailable) {
        await this.patchDbRoom(room);
      }
    }

    async joinRoom(rawCode, playerInfo) {
      const code = String(rawCode || '').trim().toUpperCase();
      if (!code || !/^[A-Z0-9]{4,8}$/.test(code)) {
        return { ok: false, code: 'INVALID_FORMAT', error: 'Enter a valid invitation code (e.g. K9M4X2).' };
      }

      // 1. Check local server first when available
      let localNotFound = false;
      if (this.localServerAvailable) {
        const res = await this.postLocalEvent('join_room', code, playerInfo);
        if (res && res.ok) {
          this.activeRoomSnapshot = res.room;
          if (this.sbClient) await this.joinSupabaseRoomChannel(code, false);
          if (getConfig() && this.sbRoomsTableAvailable) {
            await this.patchDbRoom(res.room);
          }
          await this.updatePresence({ status: 'In Lobby', roomCode: code });
          return { ok: true, room: res.room };
        }
        if (res && res.code !== 'NOT_FOUND') {
          return res;
        }
        localNotFound = true;
      }

      if (this.closedCodes.has(code)) {
        return { ok: false, code: 'ROOM_CLOSED', error: 'This room has expired or been closed by the host.' };
      }

      // 2. Try Supabase Realtime room channel + BroadcastChannel handshake
      let dbRoom = null;
      if (this.sbConnected || !localNotFound || this.sbClient || getConfig()) {
        const rows = await this.sbRestRoom('GET', `?code=eq.${encodeURIComponent(code)}&limit=1`, null, { prefer: null });
        if (Array.isArray(rows) && rows.length > 0) {
          dbRoom = rows[0];
          const updatedMs = Date.parse(dbRoom.updated_at || dbRoom.created_at || '') || 0;
          if (dbRoom.status === 'closed' || (updatedMs && Date.now() - updatedMs > 65 * 1000)) {
            this.closedCodes.add(code);
            await this.deleteDbRoom(code);
            this.emitMergedState();
            return { ok: false, code: 'ROOM_CLOSED', error: 'This room has expired or been closed by the host.' };
          }
          if (dbRoom.status === 'in_match') {
            return { ok: false, code: 'MATCH_STARTED', error: 'Cannot join: this match has already started.' };
          }
          if (dbRoom.guest_client_id && dbRoom.guest_client_id !== this.clientId) {
            return { ok: false, code: 'ROOM_FULL', error: 'Room is full (2/2 players).' };
          }
        }
      }

      const handshake = await this.performRemoteJoinHandshake(code, playerInfo, dbRoom);
      if (handshake.ok) {
        this.activeRoomSnapshot = handshake.room;
        await this.updatePresence({ status: 'In Lobby', roomCode: code });
      } else {
        if (handshake.code === 'HOST_DISCONNECTED' && dbRoom) {
          this.closedCodes.add(code);
          await this.deleteDbRoom(code);
          this.emitMergedState();
        }
        await this.leaveSupabaseRoomChannel();
      }
      return handshake;
    }

    async performRemoteJoinHandshake(code, playerInfo, dbRoom) {
      let hostSnapshot = null;

      // Probe BroadcastChannel + Supabase room channel in parallel
      const probePromise = new Promise((resolve) => {
        let settled = false;
        const finish = (res) => {
          if (settled) return;
          settled = true;
          cleaners.forEach((fn) => fn());
          resolve(res);
        };
        const cleaners = [];

        const offNet = this.on('net_event', (ev) => {
          if (ev.roomCode !== code) return;
          if (ev.type === 'room_probe_reply' && ev.payload?.room) {
            hostSnapshot = ev.payload.room;
            finish({ found: true, source: 'channel', room: hostSnapshot });
          }
        });
        cleaners.push(offNet);

        this.postBroadcast('room_probe', code, { requesterId: this.clientId });

        const timeout = global.setTimeout(() => finish({ found: false }), 1600);
        cleaners.push(() => global.clearTimeout(timeout));

        if (this.sbClient) {
          this.joinSupabaseRoomChannel(code, false).then((ch) => {
            if (!ch) return;
            const checkPresence = () => {
              const state = ch.presenceState?.() || {};
              for (const metas of Object.values(state)) {
                const hostMeta = Array.isArray(metas) ? metas.find((m) => m.role === 'host') : null;
                if (hostMeta) {
                  hostSnapshot = hostMeta.roomSnapshot || hostSnapshot;
                  finish({ found: true, source: 'supabase', room: hostSnapshot });
                  return true;
                }
              }
              return false;
            };
            if (checkPresence()) return;
            const timer = global.setInterval(() => {
              if (checkPresence() || settled) global.clearInterval(timer);
            }, 150);
            cleaners.push(() => global.clearInterval(timer));
          });
        }
      });

      const foundInfo = await probePromise;
      if (!foundInfo.found) {
        if (this.closedCodes.has(code)) {
          return { ok: false, code: 'ROOM_CLOSED', error: 'This room has expired or been closed by the host.' };
        }
        if (dbRoom) {
          return { ok: false, code: 'HOST_DISCONNECTED', error: 'Cannot join: the host has disconnected.' };
        }
        return { ok: false, code: 'NOT_FOUND', error: 'Invalid invitation code. No active room found.' };
      }

      if (hostSnapshot) {
        if (hostSnapshot.host?.clientId === this.clientId) {
          return { ok: false, code: 'SELF_JOIN', error: 'You are already hosting this room.' };
        }
        if (hostSnapshot.status === 'closed') {
          return { ok: false, code: 'ROOM_CLOSED', error: 'This room has expired or been closed by the host.' };
        }
        if (hostSnapshot.status === 'in_match') {
          return { ok: false, code: 'MATCH_STARTED', error: 'Cannot join: this match has already started.' };
        }
        if (hostSnapshot.guest && hostSnapshot.guest.clientId !== this.clientId) {
          return { ok: false, code: 'ROOM_FULL', error: 'Room is full (2/2 players).' };
        }
      }

      // Send join_request and await join_accepted / join_rejected
      return new Promise((resolve) => {
        let done = false;
        const cleanup = () => {
          off();
          global.clearTimeout(timer);
        };
        const off = this.on('net_event', (ev) => {
          if (ev.roomCode !== code || done) return;
          if (ev.type === 'join_accepted' && ev.payload?.room) {
            done = true;
            cleanup();
            resolve({ ok: true, room: ev.payload.room });
          } else if (ev.type === 'join_rejected') {
            done = true;
            cleanup();
            resolve({
              ok: false,
              code: ev.payload?.code || 'JOIN_REJECTED',
              error: ev.payload?.error || 'Unable to join room.',
            });
          } else if (ev.type === 'room_closed') {
            done = true;
            cleanup();
            resolve({
              ok: false,
              code: 'ROOM_CLOSED',
              error: ev.payload?.reason || 'This room was closed by the host.',
            });
          }
        });
        const timer = global.setTimeout(() => {
          if (done) return;
          done = true;
          cleanup();
          resolve({
            ok: false,
            code: 'CONNECTION_FAILED',
            error: 'Connection to the host timed out. Please try again.',
          });
        }, 3000);

        const reqPayload = { clientId: this.clientId, ...playerInfo };
        this.postBroadcast('join_request', code, reqPayload);
        this.sendSupabaseRoomBroadcast('join_request', code, reqPayload);
      });
    }

    async sendJoinDecision(code, targetClientId, accepted, data) {
      const type = accepted ? 'join_accepted' : 'join_rejected';
      this.postBroadcast(type, code, data, targetClientId);
      await this.sendSupabaseRoomBroadcast(type, code, data, targetClientId);
    }

    async sendReady(code, ready) {
      if (this.localServerAvailable) {
        await this.postLocalEvent('set_ready', code, { ready });
      }
      this.postBroadcast('set_ready', code, { clientId: this.clientId, ready });
      await this.sendSupabaseRoomBroadcast('set_ready', code, { clientId: this.clientId, ready });
    }

    async updateRoomSettings(code, settings) {
      if (this.localServerAvailable) {
        await this.postLocalEvent('update_settings', code, settings);
      }
      this.postBroadcast('update_settings', code, settings);
      await this.sendSupabaseRoomBroadcast('update_settings', code, settings);
    }

    async leaveRoom(code, reason = '') {
      this.activeRoomSnapshot = null;
      if (this.localServerAvailable) {
        await this.postLocalEvent('leave_room', code, { reason });
      }
      this.postBroadcast('leave_room', code, { clientId: this.clientId, reason });
      await this.sendSupabaseRoomBroadcast('leave_room', code, { clientId: this.clientId, reason });
      await this.leaveSupabaseRoomChannel();
      await this.updatePresence({ status: 'Available', roomCode: null });
    }

    async closeRoom(code, reason = 'Host closed the room.') {
      const normCode = String(code || '').trim().toUpperCase();
      this.activeRoomSnapshot = null;
      if (normCode) this.closedCodes.add(normCode);
      if (this.localServerAvailable) {
        await this.postLocalEvent('leave_room', normCode, { reason });
      }
      this.postBroadcast('room_closed', normCode, { code: normCode, reason });
      await this.sendSupabaseRoomBroadcast('room_closed', normCode, { code: normCode, reason });
      await this.sendSupabaseLobbyBroadcast('room_closed', normCode);
      await this.deleteDbRoom(normCode);
      await this.leaveSupabaseRoomChannel();
      await this.updatePresence({ status: 'Available', roomCode: null });
    }

    async sendMatchStart(code, room, matchConfig) {
      this.activeRoomSnapshot = room;
      this.setPollingMode('match');
      if (this.localServerAvailable) {
        const res = await this.postLocalEvent('start_match', code, { matchConfig });
        if (res && !res.ok) return res;
      }
      this.postBroadcast('match_start', code, { room, matchConfig });
      if (this.sbClient) {
        await this.sendSupabaseRoomBroadcast('match_start', code, { room, matchConfig });
        await this.sendSupabaseLobbyBroadcast('public_room_remove', code);
      }
      if (this.localServerAvailable) {
        this.updatePresence({ status: 'In Match', roomCode: code });
      } else {
        await this.updatePresence({ status: 'In Match', roomCode: code });
      }
      if (getConfig() && this.sbRoomsTableAvailable) {
        await this.patchDbRoom(room);
      }
      return { ok: true };
    }

    async sendMatchMove(code, movePayload) {
      const normCode = String(code || '').trim().toUpperCase();
      if (this.localServerAvailable) {
        await this.postLocalEvent('match_move', normCode, movePayload);
      }
      this.postBroadcast('match_move', normCode, movePayload);
      await this.sendSupabaseRoomBroadcast('match_move', normCode, movePayload);

      // Persist committed turn moves in Supabase public.multiplayer_rooms.room_state only while the match is active.
      const isLiveMatch = Boolean(
        normCode &&
        !this.closedCodes.has(normCode) &&
        this.activeRoomSnapshot &&
        this.activeRoomSnapshot.code === normCode &&
        this.activeRoomSnapshot.status === 'in_match'
      );
      if (isLiveMatch && getConfig() && this.sbRoomsTableAvailable && movePayload && !movePayload.kind && Number.isFinite(Number(movePayload.round))) {
        try {
          const rows = await this.sbRestRoom('GET', `?code=eq.${encodeURIComponent(normCode)}&select=room_state,status&limit=1`, null, { prefer: null });
          const row = Array.isArray(rows) ? rows[0] : null;
          const baseState = (row?.room_state && typeof row.room_state === 'object' && row.status === 'in_match')
            ? row.room_state
            : { ...this.activeRoomSnapshot };
          if (baseState && !this.closedCodes.has(normCode) && this.activeRoomSnapshot?.status === 'in_match') {
            const prevMoves = (baseState.matchMoves && typeof baseState.matchMoves === 'object') ? baseState.matchMoves : {};
            const key = `${movePayload.matchId || normCode}:${movePayload.round}`;
            const nextState = {
              ...baseState,
              matchMoves: {
                ...prevMoves,
                [key]: movePayload,
              },
            };
            await this.sbRestRoom('PATCH', `?code=eq.${encodeURIComponent(normCode)}&status=eq.in_match`, {
              room_state: nextState,
              updated_at: new Date().toISOString(),
            }, { prefer: 'return=minimal' });
          }
        } catch {}
      }
    }

    async fetchRoomMatchMoves(code) {
      if (!this.sbClient || !this.sbRoomsTableAvailable || !code) return [];
      try {
        const rows = await this.sbRestRoom('GET', `?code=eq.${encodeURIComponent(code)}&select=room_state&limit=1`);
        const matchMoves = Array.isArray(rows) && rows[0]?.room_state?.matchMoves;
        if (!matchMoves || typeof matchMoves !== 'object') return [];
        return Object.values(matchMoves).filter((m) => m && typeof m === 'object');
      } catch {
        return [];
      }
    }

    async sendMatchForfeit(code, payload) {
      if (this.localServerAvailable) {
        await this.postLocalEvent('match_forfeit', code, payload);
      }
      this.postBroadcast('match_forfeit', code, payload);
      await this.sendSupabaseRoomBroadcast('match_forfeit', code, payload);
    }

    async sendReturnToLobby(code) {
      this.setPollingMode('lobby');
      if (this.localServerAvailable) {
        await this.postLocalEvent('return_to_lobby', code, {});
      }
      this.postBroadcast('return_to_lobby', code, { clientId: this.clientId });
      await this.sendSupabaseRoomBroadcast('return_to_lobby', code, { clientId: this.clientId });
    }
  }

  global.MultiplayerNetwork = MultiplayerNetwork;
})(window);
