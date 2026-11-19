// Matchmaking, invitation code validation, room state synchronization, and ready system.
(function (global) {
  const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  const MP_ARENAS = [
    { id: 'arena', name: 'Data Center Arena' },
    { id: 'bbcorp', name: 'BB Corp Arena' },
    { id: 'mainroad', name: 'Main Street Arena' },
    { id: 'netcafe', name: 'Net Cafe Arena' },
    { id: 'hospital', name: 'Hospital Arena' },
    { id: 'bank', name: 'Bank Arena' },
    { id: 'supply', name: 'Corp Supply Arena' },
    { id: 'terminal_bay', name: 'Terminal Bay' },
    { id: 'server_shaft', name: 'Server Shaft' },
    { id: 'control_deck', name: 'Control Deck' },
    { id: 'executive_floor', name: 'Executive Floor' },
  ];

  const MP_CATEGORIES = [
    'ALL',
    'Computer Systems',
    'Networking & Security',
    'Programming',
    'Database',
  ];

  function generateCode(existingCodes) {
    for (let attempt = 0; attempt < 25; attempt++) {
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
      if (!existingCodes.has(code)) return code;
    }
    return `B${Date.now().toString(36).slice(-5).toUpperCase()}`;
  }

  function shuffleArray(items) {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function buildSynchronizedQuestionPool(category) {
    const bank = (typeof QUESTION_BANK !== 'undefined' ? QUESTION_BANK : global.QUESTION_BANK) || { easy: [], medium: [], hard: [] };
    const collect = [];
    for (const [difficulty, list] of Object.entries(bank)) {
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        if (category && category !== 'ALL' && item.category !== category) continue;
        collect.push({
          q: item.q,
          choices: [...item.choices],
          answer: item.answer,
          explain: item.explain,
          category: item.category,
          topic: item.topic,
          difficulty,
        });
      }
    }
    if (!collect.length) {
      for (const [difficulty, list] of Object.entries(bank)) {
        if (!Array.isArray(list)) continue;
        for (const item of list) {
          collect.push({
            q: item.q,
            choices: [...item.choices],
            answer: item.answer,
            explain: item.explain,
            category: item.category,
            topic: item.topic,
            difficulty,
          });
        }
      }
    }
    return shuffleArray(collect);
  }

  class MultiplayerMatchmaking {
    constructor(network) {
      this.network = network;
      this.players = [];
      this.publicRooms = [];
      this.currentRoom = null;
      this.role = null; // 'host' | 'guest' | null
      this.notification = null;
      this.incomingInvite = null;
      this.invitedClientIds = new Set();
      this.listeners = new Set();
      this.matchListeners = new Set();
      this.forfeitListeners = new Set();
      this.moveListeners = new Set();
      this.connection = { connected: false, mode: 'offline' };
      this.isBusy = false;
      this.lastLaunchedMatchId = null;
      this.pendingSyncPromise = null;

      this.bindNetworkEvents();
    }

    static get ARENAS() {
      return MP_ARENAS;
    }

    static get CATEGORIES() {
      return MP_CATEGORIES;
    }

    subscribe(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }

    onMatchStart(fn) {
      this.matchListeners.add(fn);
      return () => this.matchListeners.delete(fn);
    }

    onMatchMove(fn) {
      this.moveListeners.add(fn);
      return () => this.moveListeners.delete(fn);
    }

    onMatchForfeit(fn) {
      this.forfeitListeners.add(fn);
      return () => this.forfeitListeners.delete(fn);
    }

    notifyChange() {
      const snapshot = this.getSnapshot();
      for (const fn of this.listeners) {
        try {
          fn(snapshot);
        } catch (err) {
          console.error('MultiplayerMatchmaking listener error:', err);
        }
      }
    }

    setNotification(type, message) {
      this.notification = message ? { type, message } : null;
      this.notifyChange();
    }

    clearNotification() {
      if (!this.notification) return;
      this.notification = null;
      this.notifyChange();
    }

    getSnapshot() {
      return {
        connection: this.connection,
        players: this.players,
        publicRooms: this.publicRooms,
        currentRoom: this.currentRoom,
        role: this.role,
        notification: this.notification,
        incomingInvite: this.incomingInvite,
        invitedClientIds: [...this.invitedClientIds],
        canStartMatch: this.canStartMatch(),
        isBusy: this.isBusy,
        selfClientId: this.network.clientId,
      };
    }

    bindNetworkEvents() {
      this.network.on('connection', (conn) => {
        this.connection = conn;
        this.notifyChange();
      });

      this.network.on('state', ({ players, publicRooms }) => {
        this.players = players;
        this.publicRooms = publicRooms;
        this.notifyChange();
      });

      this.network.on('peer_disconnected', ({ clientId }) => {
        if (!this.currentRoom) return;
        const room = this.currentRoom;
        if (this.role === 'host' && room.guest && room.guest.clientId === clientId) {
          const guestName = room.guest.username || 'Challenger';
          if (room.status === 'in_match') {
            for (const fn of this.forfeitListeners) {
              fn({ winnerClientId: room.host.clientId, reason: `${guestName} disconnected.` });
            }
          }
          room.guest = null;
          room.host.ready = false;
          room.status = 'waiting';
          this.network.syncRoomSnapshot(room, `${guestName} disconnected.`);
          this.setNotification('warn', `${guestName} disconnected. Slot 2 is now waiting for a player.`);
        } else if (this.role === 'guest' && room.host && room.host.clientId === clientId) {
          const hostName = room.host.username || 'Host';
          if (room.status === 'in_match') {
            for (const fn of this.forfeitListeners) {
              fn({ winnerClientId: room.guest?.clientId, reason: `${hostName} disconnected.` });
            }
          }
          const closedCode = room.code;
          this.currentRoom = null;
          this.role = null;
          this.network.closedCodes.add(closedCode);
          this.network.leaveSupabaseRoomChannel();
          this.network.updatePresence({ status: 'Available', roomCode: null });
          this.setNotification('error', `${hostName} disconnected. The room has been closed.`);
        }
      });

      this.network.on('net_event', async (ev) => {
        const { source, type, roomCode, payload } = ev;

        if (type === 'room_invite' && payload?.roomCode) {
          if (payload.hostClientId === this.network.clientId) return;
          if (this.currentRoom && this.currentRoom.code === payload.roomCode) return;
          if (this.currentRoom && this.currentRoom.status === 'in_match') return;
          this.incomingInvite = { ...payload, receivedAt: Date.now() };
          if (global.Sound && typeof global.Sound.play === 'function') {
            try { global.Sound.play('pick'); } catch {}
          }
          this.notifyChange();
          return;
        }

        if (type === 'match_move' && this.currentRoom && roomCode === this.currentRoom.code) {
          for (const fn of this.moveListeners) fn(payload);
          return;
        }

        if (type === 'match_forfeit' && this.currentRoom && roomCode === this.currentRoom.code) {
          for (const fn of this.forfeitListeners) fn(payload);
          return;
        }

        if (type === 'match_start' && this.currentRoom && roomCode === this.currentRoom.code) {
          const incomingId = payload?.matchConfig?.matchId || null;
          if (incomingId && incomingId === this.lastLaunchedMatchId) return;
          if (incomingId) this.lastLaunchedMatchId = incomingId;
          if (payload?.room) {
            this.currentRoom = payload.room;
            this.network.activeRoomSnapshot = this.currentRoom;
          } else {
            this.currentRoom.status = 'in_match';
          }
          await this.network.updatePresence({ status: 'In Match', roomCode });
          this.notifyChange();
          for (const fn of this.matchListeners) fn(payload.matchConfig);
          return;
        }

        if (type === 'room_closed') {
          if (this.incomingInvite && this.incomingInvite.roomCode === roomCode) {
            this.incomingInvite = null;
          }
          if (this.currentRoom && this.currentRoom.code === roomCode) {
            const wasHost = this.role === 'host';
            this.currentRoom = null;
            this.role = null;
            await this.network.leaveSupabaseRoomChannel();
            await this.network.updatePresence({ status: 'Available', roomCode: null });
            if (!wasHost) {
              this.setNotification('warn', payload?.reason || 'The host closed the room.');
            } else {
              this.notifyChange();
            }
          }
          return;
        }

        if (type === 'room_state' && this.currentRoom && roomCode === this.currentRoom.code && payload?.room) {
          const incoming = payload.room;
          // Ignore stale remote room_state if we are local server-synced or host with newer mutations, unless source === 'local' or we are guest
          if (source === 'local' || this.role === 'guest') {
            this.currentRoom = incoming;
            this.network.activeRoomSnapshot = incoming;
            if (payload.notice) {
              const kind = payload.notice.includes('disconnected') || payload.notice.includes('left') ? 'warn' : 'info';
              this.setNotification(kind, payload.notice);
            } else {
              this.notifyChange();
            }
          }
          return;
        }

        // Host handles direct peer events on Supabase / BroadcastChannel
        if (this.role === 'host' && this.currentRoom && roomCode === this.currentRoom.code && source !== 'local') {
          if (type === 'join_request' && payload?.clientId) {
            const room = this.currentRoom;
            if (room.status === 'in_match') {
              await this.network.sendJoinDecision(roomCode, payload.clientId, false, {
                code: 'MATCH_STARTED',
                error: 'Cannot join: this match has already started.',
              });
              return;
            }
            if (room.guest && room.guest.clientId !== payload.clientId) {
              await this.network.sendJoinDecision(roomCode, payload.clientId, false, {
                code: 'ROOM_FULL',
                error: 'Room is full (2/2 players).',
              });
              return;
            }
            room.guest = {
              clientId: payload.clientId,
              username: payload.username || 'Challenger',
              avatar: payload.avatar || 'emerald',
              ready: false,
              connected: true,
            };
            room.status = 'full';
            room.host.ready = false;
            const notice = `${room.guest.username} joined the room.`;
            await this.network.sendJoinDecision(roomCode, payload.clientId, true, { room });
            await this.network.syncRoomSnapshot(room, notice);
            this.setNotification('info', notice);
            return;
          }

          if (type === 'set_ready' && payload?.clientId) {
            const room = this.currentRoom;
            if (room.guest && room.guest.clientId === payload.clientId) {
              room.guest.ready = Boolean(payload.ready);
              await this.network.syncRoomSnapshot(room);
              this.notifyChange();
            }
            return;
          }

          if (type === 'leave_room' && payload?.clientId) {
            const room = this.currentRoom;
            if (room.guest && room.guest.clientId === payload.clientId) {
              const guestName = room.guest.username || 'Challenger';
              const wasMatch = room.status === 'in_match';
              room.guest = null;
              room.host.ready = false;
              room.status = 'waiting';
              if (wasMatch) {
                await this.network.sendMatchForfeit(roomCode, {
                  winnerClientId: room.host.clientId,
                  reason: `${guestName} left the match.`,
                });
              }
              await this.network.syncRoomSnapshot(room, `${guestName} left the room.`);
              this.setNotification('warn', `${guestName} left the room.`);
            }
            return;
          }

          if (type === 'return_to_lobby') {
            const room = this.currentRoom;
            room.host.ready = false;
            if (room.guest) {
              room.guest.ready = false;
              room.status = 'full';
            } else {
              room.status = 'waiting';
            }
            await this.network.syncRoomSnapshot(room);
            this.notifyChange();
          }
        }

        // Guest handles host leaving or host updating settings on remote transports
        if (this.role === 'guest' && this.currentRoom && roomCode === this.currentRoom.code && source !== 'local') {
          if (type === 'leave_room' && payload?.clientId === this.currentRoom.host?.clientId) {
            const hostName = this.currentRoom.host.username || 'Host';
            this.currentRoom = null;
            this.role = null;
            await this.network.leaveSupabaseRoomChannel();
            await this.network.updatePresence({ status: 'Available', roomCode: null });
            this.setNotification('warn', payload.reason || `${hostName} closed the room.`);
          } else if (type === 'set_ready' && payload?.clientId === this.currentRoom.host?.clientId) {
            this.currentRoom.host.ready = Boolean(payload.ready);
            this.notifyChange();
          }
        }
      });
    }

    async initPlayer(profile) {
      await this.network.connect({
        username: profile.username,
        avatar: profile.avatar,
        status: this.currentRoom ? (this.currentRoom.status === 'in_match' ? 'In Match' : 'In Lobby') : 'Available',
        roomCode: this.currentRoom?.code || null,
      });
      await this.network.refresh();
    }

    async setProfile(patch) {
      await this.network.updatePresence(patch);
    }

    async refresh() {
      await this.network.refresh();
    }

    async createRoom({ visibility = 'public', arenaId = 'arena', category = 'ALL' } = {}) {
      if (this.currentRoom) await this.leaveCurrentRoom();
      const existing = new Set([
        ...this.publicRooms.map((r) => r.code),
        ...this.network.closedCodes,
      ]);
      const code = generateCode(existing);
      const arena = MP_ARENAS.find((a) => a.id === arenaId) || MP_ARENAS[0];
      const normalizedVisibility = visibility === 'private' ? 'private' : 'public';
      const room = {
        code,
        visibility: normalizedVisibility,
        status: 'waiting',
        arenaId: arena.id,
        arenaName: arena.name,
        category: MP_CATEGORIES.includes(category) ? category : 'ALL',
        maxPlayers: 2,
        host: {
          clientId: this.network.clientId,
          username: this.network.localProfile.username,
          avatar: this.network.localProfile.avatar,
          ready: false,
          connected: true,
        },
        guest: null,
        createdAt: Date.now(),
      };

      this.isBusy = true;
      this.notifyChange();
      try {
        const res = await this.network.registerRoom(room);
        if (!res.ok) {
          this.setNotification('error', res.error || 'Failed to register room with backend.');
          return res;
        }
        this.currentRoom = res.room || room;
        this.role = 'host';
        this.setNotification('info', `${normalizedVisibility === 'private' ? 'Private' : 'Public'} room ${code} created.`);
        return { ok: true, room: this.currentRoom };
      } finally {
        this.isBusy = false;
        this.notifyChange();
      }
    }

    async joinRoomByCode(rawCode) {
      const code = String(rawCode || '').trim().toUpperCase();
      if (!code || !/^[A-Z0-9]{4,8}$/.test(code)) {
        const error = 'Enter a valid invitation code (e.g. K9M4X2).';
        return { ok: false, code: 'INVALID_FORMAT', error };
      }
      if (this.currentRoom) {
        if (this.currentRoom.code === code) {
          return { ok: false, code: 'SELF_JOIN', error: 'You are already in this room.' };
        }
        await this.leaveCurrentRoom();
      }

      this.isBusy = true;
      this.notifyChange();
      try {
        const res = await this.network.joinRoom(code, {
          username: this.network.localProfile.username,
          avatar: this.network.localProfile.avatar,
        });
        if (!res.ok) {
          return res;
        }
        this.currentRoom = res.room;
        this.role = res.room.host?.clientId === this.network.clientId ? 'host' : 'guest';
        this.setNotification('info', `Joined ${res.room.host?.username || 'Host'}'s room (${res.room.code}).`);
        return { ok: true, room: this.currentRoom };
      } finally {
        this.isBusy = false;
        this.notifyChange();
      }
    }

    async joinPublicRoom(code) {
      const res = await this.joinRoomByCode(code);
      if (!res.ok) {
        this.setNotification('error', res.error);
        await this.refresh();
      }
      return res;
    }

    async toggleReady() {
      if (!this.currentRoom) return;
      const room = this.currentRoom;
      const isHost = this.role === 'host';
      const slot = isHost ? room.host : room.guest;
      if (!slot) return;
      slot.ready = !slot.ready;
      this.notifyChange();
      const syncWork = (async () => {
        await this.network.sendReady(room.code, slot.ready);
        if (isHost) {
          await this.network.syncRoomSnapshot(room);
        }
      })();
      this.pendingSyncPromise = syncWork;
      try {
        await syncWork;
      } finally {
        if (this.pendingSyncPromise === syncWork) this.pendingSyncPromise = null;
      }
    }

    async updateSettings({ arenaId, category }) {
      if (!this.currentRoom || this.role !== 'host') return;
      const room = this.currentRoom;
      const arena = MP_ARENAS.find((a) => a.id === arenaId) || MP_ARENAS[0];
      room.arenaId = arena.id;
      room.arenaName = arena.name;
      if (MP_CATEGORIES.includes(category)) room.category = category;
      room.host.ready = false;
      if (room.guest) room.guest.ready = false;
      this.notifyChange();
      await this.network.updateRoomSettings(room.code, {
        arenaId: room.arenaId,
        arenaName: room.arenaName,
        category: room.category,
      });
      await this.network.syncRoomSnapshot(room, 'Match settings updated. Ready status reset.');
    }

    canStartMatch() {
      const r = this.currentRoom;
      return Boolean(
        r &&
        this.role === 'host' &&
        r.status !== 'in_match' &&
        r.host?.connected &&
        r.guest &&
        r.guest.connected &&
        r.host.ready &&
        r.guest.ready
      );
    }

    async startMatch() {
      if (this.pendingSyncPromise) {
        try { await this.pendingSyncPromise; } catch {}
      }
      if (!this.canStartMatch()) {
        const error = 'Both players must be connected and Ready before starting.';
        this.setNotification('error', error);
        return { ok: false, error };
      }
      const room = this.currentRoom;
      room.status = 'in_match';
      const matchConfig = {
        matchId: `${room.code}-${Date.now().toString(36)}`,
        roomCode: room.code,
        arenaId: room.arenaId,
        arenaName: room.arenaName,
        category: room.category,
        seed: Math.floor(Math.random() * 1000000),
        baseStats: { maxHp: 100, maxMana: 100, attack: 12, defense: 2, empowerCost: 20 },
        questions: buildSynchronizedQuestionPool(room.category),
        host: { ...room.host },
        guest: { ...room.guest },
      };

      const res = await this.network.sendMatchStart(room.code, room, matchConfig);
      if (res && !res.ok) {
        room.status = 'full';
        this.setNotification('error', res.error || 'Could not start match.');
        this.notifyChange();
        return res;
      }

      this.lastLaunchedMatchId = matchConfig.matchId;
      this.notifyChange();
      for (const fn of this.matchListeners) fn(matchConfig);
      return { ok: true, matchConfig };
    }

    async leaveCurrentRoom() {
      if (!this.currentRoom) return;
      const room = this.currentRoom;
      const wasHost = this.role === 'host';
      const code = room.code;
      this.currentRoom = null;
      this.role = null;
      this.invitedClientIds.clear();
      if (wasHost) {
        await this.network.closeRoom(code, `${room.host.username} closed the room.`);
        this.setNotification('info', `Room ${code} closed.`);
      } else {
        await this.network.leaveRoom(code, `${room.guest?.username || 'Challenger'} left the room.`);
        this.setNotification('info', `Left room ${code}.`);
      }
    }

    async invitePlayer(targetClientId) {
      if (!this.currentRoom) {
        const created = await this.createRoom({ visibility: 'public', arenaId: 'arena', category: 'ALL' });
        if (!created?.ok) return created || { ok: false, error: 'Could not create room to send invite.' };
      }
      const room = this.currentRoom;
      if (!room || room.guest) {
        return { ok: false, error: 'Room already has 2 players.' };
      }
      const invitePayload = {
        roomCode: room.code,
        visibility: room.visibility,
        hostClientId: this.network.clientId,
        hostName: this.network.localProfile.username,
        hostAvatar: this.network.localProfile.avatar,
        arenaName: room.arenaName,
        category: room.category,
      };
      if (targetClientId === 'all') {
        const waiting = this.players.filter((p) => !p.isSelf && (p.status || 'Available') === 'Available');
        if (!waiting.length) {
          this.setNotification('warn', 'No available waiting players in the lobby right now.');
          return { ok: false, error: 'No available waiting players in the lobby.' };
        }
        for (const p of waiting) {
          this.invitedClientIds.add(p.clientId);
          await this.network.sendRoomInvite(p.clientId, invitePayload);
        }
        this.setNotification('info', `Invited ${waiting.length} waiting player${waiting.length === 1 ? '' : 's'} to Room ${room.code}.`);
        return { ok: true, count: waiting.length };
      }
      const target = this.players.find((p) => p.clientId === targetClientId);
      this.invitedClientIds.add(targetClientId);
      await this.network.sendRoomInvite(targetClientId, invitePayload);
      this.setNotification('info', `Invited ${target?.username || 'player'} to Room ${room.code}.`);
      return { ok: true };
    }

    async acceptInvite() {
      const inv = this.incomingInvite;
      if (!inv || !inv.roomCode) return { ok: false, error: 'Invitation has expired.' };
      this.incomingInvite = null;
      if (this.currentRoom) {
        if (this.currentRoom.code === inv.roomCode) return { ok: true, room: this.currentRoom };
        await this.leaveCurrentRoom();
      }
      return await this.joinRoomByCode(inv.roomCode);
    }

    declineInvite() {
      this.incomingInvite = null;
      this.notifyChange();
    }

    async sendMatchMove(movePayload) {
      if (!this.currentRoom) return;
      await this.network.sendMatchMove(this.currentRoom.code, movePayload);
    }

    async fetchMatchMoves() {
      if (!this.currentRoom) return [];
      return await this.network.fetchRoomMatchMoves(this.currentRoom.code);
    }

    async forfeitMatch(reason) {
      if (!this.currentRoom) return;
      const room = this.currentRoom;
      const winnerClientId = this.role === 'host' ? room.guest?.clientId : room.host?.clientId;
      await this.network.sendMatchForfeit(room.code, {
        winnerClientId,
        reason: reason || `${this.network.localProfile.username} forfeited the match.`,
      });
    }

    async returnRoomToLobby() {
      if (!this.currentRoom) return;
      const room = this.currentRoom;
      room.host.ready = false;
      if (room.guest) {
        room.guest.ready = false;
        room.status = 'full';
      } else {
        room.status = 'waiting';
      }
      await this.network.updatePresence({ status: 'In Lobby', roomCode: room.code });
      await this.network.sendReturnToLobby(room.code);
      if (this.role === 'host') {
        await this.network.syncRoomSnapshot(room);
      }
      this.notifyChange();
    }
  }

  global.MultiplayerMatchmaking = MultiplayerMatchmaking;
})(window);
