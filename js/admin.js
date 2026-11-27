// Bytebound Admin Panel — Human-Readable Operations Console
(function (global) {
  const SESSION_KEY = 'bytebound-admin-session-v1';
  const AUDIT_STORAGE_KEY = 'bytebound-admin-audit-v1';
  const YEAR_NAMES = { 1: '1st Year', 2: '2nd Year', 3: '3rd Year', 4: '4th Year' };
  const ACTION_LABELS = {
    ADMIN_LOGIN: 'Admin Signed In',
    ADMIN_LOGIN_FAILED: 'Failed Admin Login',
    ADMIN_LOGOUT: 'Admin Signed Out',
    PLAYER_SIGNUP: 'Player Signed Up',
    FORGOT_PASSWORD_REQUEST: 'Forgot Password Request',
    YEAR_CHANGE_REQUEST: 'Year Change Request',
    PLAYER_CHANGE_PASSWORD: 'Player Changed Password',
    CREATE_ACCOUNT: 'Created Account',
    CREATE_USER: 'Created Account',
    CHANGE_PASSWORD: 'Changed Password',
    PASSWORD_RESET: 'Changed Password',
    DISMISS_RESET_REQ: 'Dismissed Reset Request',
    CHANGE_YEAR_LEVEL: 'Changed Year Level',
    APPROVE_YEAR_REQ: 'Approved Year Change',
    DISMISS_YEAR_REQ: 'Dismissed Year Request',
    LOCK_ACCOUNT: 'Locked Account',
    UNLOCK_ACCOUNT: 'Unlocked Account',
    FORCE_LOGOUT: 'Signed Out Player',
    REVOKE_SESSIONS: 'Signed Out Player',
    RESET_PROGRESS: 'Reset Progress',
    DELETE_ACCOUNT: 'Deleted Account',
    DELETE_USER: 'Deleted Account',
    FORCE_CLOSE_ROOM: 'Closed 1v1 Room',
    PURGE_PVP_ENTRY: 'Removed 1v1 Score',
    REMOVE_SCORE: 'Removed Score',
    PURGE_LEADERBOARD: 'Removed Score',
    ADD_QUESTION: 'Added Question',
    EDIT_QUESTION: 'Edited Question',
    EXPORT_QUESTIONS: 'Downloaded Questions',
    EXPORT_ACCOUNTS: 'Downloaded Accounts CSV',
    EXPORT_BACKUP: 'Downloaded Full Backup',
    SECURITY_NOTICE_UPDATED: 'Security Notice',
  };

  const TAB_META = {
    overview: {
      title: 'Dashboard',
      subtitle: 'Overview of player accounts, password requests, questions, and live matches.',
    },
    users: {
      title: 'Player Accounts',
      subtitle: 'Create accounts, check progress, change passwords, update year levels, or lock/delete accounts.',
    },
    resets: {
      title: 'Player Requests',
      subtitle: 'Approve or dismiss student Year Level changes and Forgot Password requests.',
    },
    questions: {
      title: 'Questions & Year Levels',
      subtitle: 'Review, add, edit, and filter all quiz questions by subject, difficulty, and academic year.',
    },
    leaderboards: {
      title: 'Leaderboards',
      subtitle: 'View Campaign and 1v1 Multiplayer rankings, check score fairness, and remove invalid scores.',
    },
    multiplayer: {
      title: 'Live 1v1 Multiplayer',
      subtitle: 'See who is currently in the multiplayer lobby and close stuck rooms if needed.',
    },
    audit: {
      title: 'Activity Log & Downloads',
      subtitle: 'History of admin changes plus one-click CSV and backup downloads.',
    },
  };

  const state = {
    token: '',
    provider: '', // 'supabase' | 'local' | 'offline'
    supabaseNeedsMigration: false,
    supabaseAuthRejected: false,
    admin: null,
    tab: 'overview',
    latencyMs: null,
    serverInfo: {},
    users: [],
    resetRequests: [],
    yearRequests: [],
    arcadeLeaderboard: [],
    pvpLeaderboard: [],
    mpPlayers: [],
    mpRooms: [],
    auditLogs: [],
    questionBank: [],
    questionIssues: [],
    securityNotice: { active: false, severity: 'info', title: '', message: '' },
    // Filters
    userSearch: '',
    userYearFilter: 'ALL',
    userStatusFilter: 'ALL',
    qSearch: '',
    qCategory: 'ALL',
    qDifficulty: 'ALL',
    qYear: 'ALL',
    qPage: 1,
    qPageSize: 25,
    lbTab: 'arcade',
  };

  const $ = (id) => document.getElementById(id);

  function esc(val) {
    return String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function formatUptime(sec) {
    const s = Math.max(0, Number(sec) || 0);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const rem = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${rem}s`;
    return `${rem}s`;
  }

  function showToast(msg, tone = 'ok') {
    const el = $('adminToast');
    if (!el) return;
    el.className = `adm-toast is-${tone}`;
    el.textContent = msg;
    el.hidden = false;
    global.clearTimeout(showToast._timer);
    showToast._timer = global.setTimeout(() => {
      el.hidden = true;
    }, 5000);
  }

  function openModal(title, bodyHtml, footHtml = '') {
    $('adminModalTitle').textContent = title;
    $('adminModalBody').innerHTML = bodyHtml;
    $('adminModalFoot').innerHTML = footHtml;
    const bd = $('adminModalBackdrop');
    bd.hidden = false;
    bd.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    const bd = $('adminModalBackdrop');
    bd.hidden = true;
    bd.setAttribute('aria-hidden', 'true');
  }

  function readLocalAuditLogs() {
    try {
      const parsed = JSON.parse(localStorage.getItem(AUDIT_STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveLocalAuditLogs(list) {
    try {
      localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify((list || []).slice(0, 150)));
    } catch {}
  }

  function readLocalPendingList(storageKey) {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function removeLocalPendingItem(storageKey, predicate) {
    try {
      const filtered = readLocalPendingList(storageKey).filter((item) => item && !predicate(item));
      localStorage.setItem(storageKey, JSON.stringify(filtered));
    } catch {}
  }

  function pushLocalAudit(action, target, detail) {
    const entry = {
      id: `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      actor: state.admin?.username || 'sysadmin',
      action,
      target,
      detail,
    };
    state.auditLogs.unshift(entry);
    const localStored = readLocalAuditLogs();
    localStored.unshift(entry);
    saveLocalAuditLogs(localStored);
    if (state.provider === 'local' && state.token) {
      postLocalAdmin('log-activity', { adminToken: state.token, action, target, detail }).catch(() => {});
    }
    if (state.tab === 'audit' || state.tab === 'overview') {
      renderActiveTab();
    }
  }

  // ===== Question Bank Loader & Quality Validator =====
  function loadAndValidateQuestionBank(preserveMemoryEdits = false) {
    if (preserveMemoryEdits && state.questionBank.length > 0) {
      revalidateLoadedQuestions();
      return;
    }
    const bank = (typeof QUESTION_BANK !== 'undefined' ? QUESTION_BANK : global.QUESTION_BANK) || { easy: [], medium: [], hard: [] };
    const flat = [];
    for (const diff of ['easy', 'medium', 'hard']) {
      const list = Array.isArray(bank[diff]) ? bank[diff] : [];
      list.forEach((item, idx) => {
        flat.push({
          _id: `${diff}:${idx}`,
          difficulty: diff,
          index: idx,
          category: item.category || '',
          topic: item.topic || '',
          year: item.year,
          q: item.q || '',
          choices: Array.isArray(item.choices) ? [...item.choices] : ['', '', '', ''],
          answer: Number.isInteger(item.answer) ? item.answer : 0,
          explain: item.explain || '',
        });
      });
    }
    state.questionBank = flat;
    revalidateLoadedQuestions();
  }

  function revalidateLoadedQuestions() {
    const issues = [];
    const seenPrompts = new Map();
    for (const entry of state.questionBank) {
      const norm = entry.q.trim().toLowerCase();
      if (!norm) {
        issues.push({ id: entry._id, severity: 'error', msg: 'Empty question text' });
      } else if (seenPrompts.has(norm)) {
        issues.push({ id: entry._id, severity: 'warn', msg: `Duplicate question text (${seenPrompts.get(norm)})` });
      } else {
        seenPrompts.set(norm, entry._id);
      }
      if (!Number.isInteger(entry.year) || entry.year < 1 || entry.year > 4) {
        issues.push({ id: entry._id, severity: 'error', msg: `Missing or invalid Year Level (${entry.year})` });
      }
      if (!Array.isArray(entry.choices) || entry.choices.length !== 4 || entry.choices.some((c) => !String(c || '').trim())) {
        issues.push({ id: entry._id, severity: 'error', msg: 'Must have 4 non-empty answer choices' });
      }
      if (!Number.isInteger(entry.answer) || entry.answer < 0 || entry.answer >= 4) {
        issues.push({ id: entry._id, severity: 'error', msg: 'Correct answer must be A, B, C, or D' });
      }
      if (!entry.explain.trim()) {
        issues.push({ id: entry._id, severity: 'warn', msg: 'Missing explanation' });
      }
    }
    state.questionIssues = issues;
  }

  function downloadFile(filename, mime, content) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportQuestionsJson() {
    const grouped = { easy: [], medium: [], hard: [] };
    for (const q of state.questionBank) {
      if (!grouped[q.difficulty]) continue;
      grouped[q.difficulty].push({
        q: q.q,
        choices: q.choices,
        answer: q.answer,
        explain: q.explain,
        category: q.category,
        topic: q.topic,
        year: q.year,
      });
    }
    downloadFile('questions.json', 'application/json', JSON.stringify(grouped, null, 2) + '\n');
    pushLocalAudit('EXPORT_QUESTIONS', 'questions.json', `Downloaded ${state.questionBank.length} questions`);
    showToast('Downloaded questions.json. Replace data/questions.json and run node scripts/build-questions.js to apply.', 'ok');
  }

  function exportAccountsCsv() {
    const headers = ['ID', 'Username', 'Year Level', 'Status', 'Signed-In Logins', 'Best Score', 'Correct', 'Answered', 'Accuracy %', 'Source', 'Last Active'];
    const csvEscape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = state.users.map((u) => {
      const yr = Number(u.review_store?.academicYear) || 4;
      const ans = Number(u.total_answers) || 0;
      const cor = Number(u.total_correct) || 0;
      const acc = ans > 0 ? Math.round((100 * cor) / ans) : 0;
      return [
        u.id,
        u.display_name,
        YEAR_NAMES[yr] || `Year ${yr}`,
        u.is_suspended ? 'Locked' : 'Active',
        Number(u.active_sessions) || 0,
        Number(u.best_score) || 0,
        cor,
        ans,
        acc,
        u.source || 'local',
        u.last_login_at || '',
      ].map(csvEscape).join(',');
    });
    downloadFile(`bytebound-accounts-${Date.now()}.csv`, 'text/csv;charset=utf-8', [headers.join(','), ...rows].join('\n'));
    pushLocalAudit('EXPORT_ACCOUNTS', 'accounts.csv', `Downloaded CSV report for ${state.users.length} accounts`);
    showToast(`Downloaded CSV report for ${state.users.length} player accounts.`, 'ok');
  }

  // ===== Backend Connections (Supabase + Local Server + Offline Fallback) =====
  function getSupabaseConfig() {
    const cfg = global.SUPABASE_CONFIG;
    if (!cfg || typeof cfg.url !== 'string' || typeof cfg.anonKey !== 'string') return null;
    const url = cfg.url.trim().replace(/\/+$/, '');
    const anonKey = cfg.anonKey.trim();
    if (!/^https:\/\/[^/]+$/i.test(url) || !anonKey) return null;
    return { url, anonKey };
  }

  async function fetchWithBackoff(url, options = {}, { retries = 2, skipRetry = false } = {}) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const res = await fetch(url, options);
      if ((res.status === 429 || res.status === 503) && !skipRetry && attempt < retries) {
        const ra = Number(res.headers.get('Retry-After'));
        const baseMs = Number.isFinite(ra) && ra > 0 ? Math.min(12000, Math.max(500, ra * 1000)) : (700 * Math.pow(2, attempt));
        await new Promise((r) => global.setTimeout(r, baseMs + Math.floor(Math.random() * 400)));
        continue;
      }
      return res;
    }
  }

  async function postLocalAdmin(endpoint, body = {}) {
    const res = await fetchWithBackoff(`/api/admin/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(body),
    }, { skipRetry: endpoint === 'login' });
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      const err = new Error('Local server unavailable');
      err.unavailable = true;
      throw err;
    }
    const data = await res.json();
    if (!res.ok || data?.ok === false) {
      const err = new Error(data?.error || `Request failed (${res.status})`);
      err.code = res.status === 429 ? (data?.code || 'RATE_LIMITED') : (data?.code || 'ADMIN_ERROR');
      throw err;
    }
    return data;
  }

  async function callSupabaseRpc(fnName, body = {}) {
    const cfg = getSupabaseConfig();
    if (!cfg) {
      const err = new Error('Supabase not configured');
      err.unavailable = true;
      throw err;
    }
    let res;
    try {
      res = await fetchWithBackoff(`${cfg.url}/rest/v1/rpc/${fnName}`, {
        method: 'POST',
        headers: {
          apikey: cfg.anonKey,
          ...(cfg.anonKey.split('.').length === 3 ? { Authorization: `Bearer ${cfg.anonKey}` } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }, { skipRetry: fnName === 'admin_log_in' });
    } catch {
      const err = new Error('Unable to reach cloud database');
      err.unavailable = true;
      throw err;
    }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok) {
      const rawMsg = json?.message || `Request failed (${res.status})`;
      const missingRpc = res.status === 404 || /PGRST202|Could not find the function/i.test(rawMsg);
      const err = new Error(rawMsg.replace(/^[A-Z0-9_]+:\s*/i, ''));
      err.unavailable = missingRpc;
      err.rpcMissing = missingRpc;
      if (res.status === 429) err.code = 'RATE_LIMITED';
      throw err;
    }
    if (json && typeof json === 'object' && json.ok === false && json.code) {
      const err = new Error(json.error || 'Admin request failed.');
      err.code = json.code;
      throw err;
    }
    return json;
  }

  async function fetchSupabaseTable(table, query = '') {
    const cfg = getSupabaseConfig();
    if (!cfg) return [];
    try {
      const res = await fetchWithBackoff(`${cfg.url}/rest/v1/${table}${query}`, {
        headers: {
          apikey: cfg.anonKey,
          ...(cfg.anonKey.split('.').length === 3 ? { Authorization: `Bearer ${cfg.anonKey}` } : {}),
        },
      });
      if (!res.ok) return [];
      const rows = await res.json();
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }

  function scanOfflineLocalStorageUsers() {
    const byKey = new Map();
    try {
      let profileMeta = [];
      try {
        profileMeta = JSON.parse(localStorage.getItem('kings-pigs-profiles-v1') || '[]');
      } catch {}
      if (Array.isArray(profileMeta)) {
        for (const p of profileMeta) {
          if (!p || !p.id) continue;
          const k = String(p.id).toLowerCase();
          byKey.set(k, {
            id: `browser-${k}`,
            username_key: k,
            display_name: p.name || k,
            best_score: 0,
            total_kills: 0,
            total_correct: 0,
            total_answers: 0,
            active_sessions: 0,
            is_suspended: false,
            topic_progress: {},
            review_store: { academicYear: Number(localStorage.getItem(`bytebound-academic-year-v1:${encodeURIComponent(k)}`)) || 4 },
            created_at: p.createdAt || null,
            last_login_at: null,
            source: 'browser',
          });
        }
      }

      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || '';
        const m = k.match(/^kings-pigs-topic-tracker-v1:(.+)$/);
        if (!m) continue;
        const uname = decodeURIComponent(m[1]).toLowerCase();
        let tp = {};
        try { tp = JSON.parse(localStorage.getItem(k) || '{}'); } catch {}
        let attempted = 0;
        let correct = 0;
        for (const cat of Object.values(tp || {})) {
          for (const t of Object.values(cat || {})) {
            attempted += Number(t?.attempted) || 0;
            correct += Number(t?.correct) || 0;
          }
        }
        const yrRaw = localStorage.getItem(`bytebound-academic-year-v1:${m[1]}`);
        const prev = byKey.get(uname) || {
          id: `browser-${uname}`,
          username_key: uname,
          display_name: uname,
          best_score: 0,
          total_kills: 0,
          active_sessions: 0,
          is_suspended: false,
          source: 'browser',
        };
        byKey.set(uname, {
          ...prev,
          total_correct: Math.max(prev.total_correct || 0, correct),
          total_answers: Math.max(prev.total_answers || 0, attempted),
          topic_progress: tp,
          review_store: { academicYear: Number(yrRaw) || prev.review_store?.academicYear || 4 },
        });
      }
    } catch {}
    return [...byKey.values()];
  }

  function mergeDiscoveredUsers(primaryUsers, arcadeRows, pvpRows) {
    const map = new Map();
    for (const u of primaryUsers) {
      if (!u || !u.username_key) continue;
      map.set(String(u.username_key).toLowerCase(), { ...u });
    }
    // Enrich scores from public Arcade & PvP leaderboards and surface any cloud-only leaderboard players
    for (const r of arcadeRows || []) {
      const name = String(r.player_name || '').trim();
      const k = name.toLowerCase();
      if (!k) continue;
      const existing = map.get(k);
      if (existing) {
        existing.best_score = Math.max(Number(existing.best_score) || 0, Number(r.score) || 0);
        existing.total_kills = Math.max(Number(existing.total_kills) || 0, Number(r.kills) || 0);
        existing.total_correct = Math.max(Number(existing.total_correct) || 0, Number(r.correct_answers) || 0);
        existing.total_answers = Math.max(Number(existing.total_answers) || 0, Number(r.total_answers) || 0);
      } else {
        map.set(k, {
          id: `cloud-${r.user_id || r.id || k}`,
          username_key: k,
          display_name: name,
          best_score: Number(r.score) || 0,
          total_kills: Number(r.kills) || 0,
          total_correct: Number(r.correct_answers) || 0,
          total_answers: Number(r.total_answers) || 0,
          active_sessions: 0,
          is_suspended: false,
          topic_progress: {},
          review_store: { academicYear: 4 },
          last_login_at: r.submitted_at || null,
          source: 'leaderboard',
        });
      }
    }
    for (const r of pvpRows || []) {
      const name = String(r.player_name || '').trim();
      const k = name.toLowerCase();
      if (!k || map.has(k)) continue;
      map.set(k, {
        id: `pvp-${r.id || k}`,
        username_key: k,
        display_name: name,
        best_score: 0,
        total_kills: 0,
        total_correct: Number(r.correct_answers) || 0,
        total_answers: Number(r.total_answers) || 0,
        active_sessions: 0,
        is_suspended: false,
        topic_progress: {},
        review_store: { academicYear: 4 },
        last_login_at: r.updated_at || null,
        source: 'leaderboard',
      });
    }
    if (state.provider === 'offline') {
      for (const localU of scanOfflineLocalStorageUsers()) {
        const k = localU.username_key;
        if (!map.has(k)) map.set(k, localU);
      }
    }
    return [...map.values()].sort((a, b) => {
      const sa = Number(a.active_sessions) || 0;
      const sb = Number(b.active_sessions) || 0;
      if (sb !== sa) return sb - sa;
      return String(a.display_name || '').localeCompare(String(b.display_name || ''));
    });
  }

  function isLocalRuntimeHost() {
    const proto = String(global.location?.protocol || '').toLowerCase();
    const host = String(global.location?.hostname || '').toLowerCase();
    return proto === 'file:' || host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  }

  async function authenticateAdmin(username, password, mode = 'auto') {
    state.supabaseNeedsMigration = false;
    state.supabaseAuthRejected = false;
    let supabaseCredErr = null;
    const allowLocalDevFallback = isLocalRuntimeHost();

    if (mode === 'local') {
      try {
        const data = await postLocalAdmin('login', { username, password });
        return { provider: 'local', token: data.admin_token, admin: data.admin };
      } catch (err) {
        if (!err.unavailable) throw err;
        if (allowLocalDevFallback && username.trim().toLowerCase() === 'sysadmin' && password === 'bytebound-admin') {
          return { provider: 'offline', token: 'offline-dev-session', admin: { username: 'sysadmin', role: 'admin' } };
        }
        throw new Error('Local server is not running. Start serve-local.cmd first.');
      }
    }

    if (mode === 'supabase') {
      if (!getSupabaseConfig()) {
        throw new Error('Supabase is not configured in supabase-config.js.');
      }
      const data = await callSupabaseRpc('admin_log_in', { p_username: username, p_password: password });
      return { provider: 'supabase', token: data.admin_token, admin: data.admin };
    }

    // Auto mode: 1. Try Cloud (Supabase) first if configured
    if (getSupabaseConfig()) {
      try {
        const data = await callSupabaseRpc('admin_log_in', { p_username: username, p_password: password });
        return { provider: 'supabase', token: data.admin_token, admin: data.admin };
      } catch (err) {
        if (err.code === 'RATE_LIMITED') throw err;
        if (err.rpcMissing) {
          state.supabaseNeedsMigration = true;
        } else if (!err.unavailable) {
          supabaseCredErr = err;
          state.supabaseAuthRejected = true;
        }
      }
    }

    // 2. Try Local Server (/api/admin/login)
    try {
      const data = await postLocalAdmin('login', { username, password });
      return { provider: 'local', token: data.admin_token, admin: data.admin };
    } catch (err) {
      if (!err.unavailable) throw err;
    }

    // 3. Static browser fallback only on localhost/file:// when Local Server isn't running
    if (allowLocalDevFallback && username.trim().toLowerCase() === 'sysadmin' && password === 'bytebound-admin') {
      return {
        provider: 'offline',
        token: 'offline-dev-session',
        admin: { username: 'sysadmin', role: 'admin' },
      };
    }
    throw supabaseCredErr || new Error('Wrong admin username or password.');
  }

  let activeTelemetryPromise = null;
  let lastManualAdminRefreshAt = 0;

  async function refreshTelemetry(options = {}) {
    if (options.manual) {
      const now = Date.now();
      if (now - lastManualAdminRefreshAt < 3000) {
        showToast('Please wait a moment before refreshing again.', 'warn');
        return activeTelemetryPromise;
      }
      lastManualAdminRefreshAt = now;
    }
    if (activeTelemetryPromise && !options.force) {
      return activeTelemetryPromise;
    }
    activeTelemetryPromise = (async () => {
      try {
        return await runTelemetryRefresh();
      } finally {
        activeTelemetryPromise = null;
      }
    })();
    return activeTelemetryPromise;
  }

  async function runTelemetryRefresh() {
    const started = performance.now();
    loadAndValidateQuestionBank(true);

    let primaryUsers = [];
    let primaryResets = [];
    let primaryYearReqs = [];

    let serverAudits = [];
    if (state.provider === 'local') {
      const data = await postLocalAdmin('overview', { adminToken: state.token });
      state.serverInfo = data.server || { provider: 'local' };
      primaryUsers = Array.isArray(data.users) ? data.users : [];
      primaryResets = Array.isArray(data.resetRequests) ? data.resetRequests : [];
      primaryYearReqs = Array.isArray(data.yearRequests) ? data.yearRequests : [];
      state.pvpLeaderboard = Array.isArray(data.pvpLeaderboard) ? data.pvpLeaderboard : [];
      state.mpPlayers = Array.isArray(data.mpPlayers) ? data.mpPlayers : [];
      state.mpRooms = Array.isArray(data.mpRooms) ? data.mpRooms : [];
      serverAudits = Array.isArray(data.auditLogs) ? data.auditLogs : [];
      state.securityNotice = data.securityNotice && typeof data.securityNotice === 'object'
        ? data.securityNotice
        : { active: false, severity: 'info', title: '', message: '' };
      state.arcadeLeaderboard = await fetchSupabaseTable('leaderboard_entries', '?select=*&order=score.desc&limit=100');
      if (!state.pvpLeaderboard.length) {
        state.pvpLeaderboard = await fetchSupabaseTable('pvp_leaderboard_entries', '?select=*&order=rating.desc&limit=100');
      }
    } else if (state.provider === 'supabase') {
      const data = await callSupabaseRpc('admin_get_overview', { p_admin_token: state.token });
      state.serverInfo = data.server || { provider: 'supabase' };
      primaryUsers = Array.isArray(data.users) ? data.users : [];
      primaryResets = Array.isArray(data.resetRequests) ? data.resetRequests : [];
      primaryYearReqs = Array.isArray(data.yearRequests) ? data.yearRequests : [];
      serverAudits = Array.isArray(data.auditLogs) ? data.auditLogs : [];
      state.securityNotice = data.securityNotice && typeof data.securityNotice === 'object'
        ? data.securityNotice
        : { active: false, severity: 'info', title: '', message: '' };
      state.arcadeLeaderboard = await fetchSupabaseTable('leaderboard_entries', '?select=*&order=score.desc&limit=100');
      state.pvpLeaderboard = await fetchSupabaseTable('pvp_leaderboard_entries', '?select=*&order=rating.desc&limit=100');
      state.mpRooms = await fetchSupabaseTable('multiplayer_rooms', '?select=*&order=updated_at.desc&limit=50');
    } else {
      state.serverInfo = { provider: 'offline', activeSessions: 0, uptimeSeconds: 0 };
      primaryUsers = scanOfflineLocalStorageUsers();
      primaryResets = readLocalPendingList('bytebound-pending-resets-v1');
      primaryYearReqs = readLocalPendingList('bytebound-pending-year-requests-v1');
      try {
        const storedNotice = JSON.parse(localStorage.getItem('bytebound-security-notice-v1') || 'null');
        state.securityNotice = storedNotice && typeof storedNotice === 'object'
          ? storedNotice
          : { active: false, severity: 'info', title: '', message: '' };
      } catch {}
      state.arcadeLeaderboard = await fetchSupabaseTable('leaderboard_entries', '?select=*&order=score.desc&limit=100');
      state.pvpLeaderboard = await fetchSupabaseTable('pvp_leaderboard_entries', '?select=*&order=rating.desc&limit=100');
    }

    // Also include any fallback requests saved in this browser if not yet recorded on server
    const pendingResetKeys = new Set(primaryResets.filter((r) => r && r.status === 'pending').map((r) => String(r.username_key || '').toLowerCase()));
    for (const lr of readLocalPendingList('bytebound-pending-resets-v1')) {
      const lk = String(lr?.username_key || '').toLowerCase();
      if (lr && lr.status === 'pending' && lk && !pendingResetKeys.has(lk)) {
        primaryResets.push({ ...lr, _localOnly: state.provider !== 'offline' });
        pendingResetKeys.add(lk);
      }
    }
    const pendingYearKeys = new Set(primaryYearReqs.filter((r) => r && r.status === 'pending').map((r) => String(r.username_key || '').toLowerCase()));
    for (const ly of readLocalPendingList('bytebound-pending-year-requests-v1')) {
      const lk = String(ly?.username_key || '').toLowerCase();
      if (ly && ly.status === 'pending' && lk && !pendingYearKeys.has(lk)) {
        primaryYearReqs.push({ ...ly, _localOnly: state.provider !== 'offline' });
        pendingYearKeys.add(lk);
      }
    }

    // Merge server Activity Logs with browser-persisted Activity Logs (deduplicated)
    const mergedLogs = [...serverAudits];
    const seenIds = new Set(mergedLogs.map((a) => String(a?.id || '')));
    for (const la of readLocalAuditLogs()) {
      if (!la || seenIds.has(String(la.id || ''))) continue;
      const laMs = Date.parse(la.timestamp || '') || 0;
      const nearDup = mergedLogs.some(
        (sa) => sa && sa.action === la.action && sa.target === la.target && sa.detail === la.detail
          && Math.abs((Date.parse(sa.timestamp || '') || 0) - laMs) < 5000
      );
      if (!nearDup) {
        mergedLogs.push(la);
        seenIds.add(String(la.id || ''));
      }
    }
    mergedLogs.sort((a, b) => (Date.parse(b?.timestamp || '') || 0) - (Date.parse(a?.timestamp || '') || 0));
    state.auditLogs = mergedLogs;

    if (state.provider === 'offline' && !state.auditLogs.length) {
      pushLocalAudit('ADMIN_LOGIN', 'Admin Panel', 'Opened in browser view mode');
    }

    state.users = mergeDiscoveredUsers(primaryUsers, state.arcadeLeaderboard, state.pvpLeaderboard);
    state.resetRequests = primaryResets;
    state.yearRequests = primaryYearReqs;
    state.latencyMs = Math.max(1, Math.round(performance.now() - started));
    updateShellChrome();
    renderActiveTab();
  }

  // ===== Shell Chrome =====
  function updateShellChrome() {
    const pendingResets = state.resetRequests.filter((r) => r && r.status === 'pending').length;
    const pendingYearReqs = state.yearRequests.filter((r) => r && r.status === 'pending').length;
    const totalPending = pendingResets + pendingYearReqs;
    $('navBadgeUsers').textContent = String(state.users.length);
    const resetBadge = $('navBadgeResets');
    resetBadge.textContent = String(totalPending);
    resetBadge.classList.toggle('adm-badge-alert', totalPending > 0);
    $('navBadgeQuestions').textContent = String(state.questionBank.length);
    $('navBadgeRooms').textContent = String(state.mpRooms.length);
    $('adminStatusBadge').textContent = state.latencyMs !== null ? `Live · ${state.latencyMs}ms` : 'Live';
    $('adminActorChip').textContent = state.admin?.username || 'sysadmin';

    const provPill = $('adminProviderPill');
    const provText = $('adminProviderText');
    const dot = provPill?.querySelector('.adm-status-dot');
    if (state.provider === 'supabase') {
      provText.textContent = 'Connected · Cloud Database';
      dot.className = 'adm-status-dot is-ok';
    } else if (state.provider === 'local') {
      provText.textContent = 'Connected · Local Server';
      dot.className = 'adm-status-dot is-ok';
    } else {
      provText.textContent = 'Browser View Only';
      dot.className = 'adm-status-dot is-warn';
    }

    const meta = TAB_META[state.tab] || TAB_META.overview;
    $('adminPageTitle').textContent = meta.title;
    $('adminPageSubtitle').textContent = meta.subtitle;

    document.querySelectorAll('[data-adm-tab]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.admTab === state.tab);
    });
  }

  // ===== Tab Renderers =====
  function renderOverview() {
    const activeSessions = state.serverInfo.activeSessions ?? state.users.reduce((s, u) => s + (Number(u.active_sessions) || 0), 0);
    const pendingResets = state.resetRequests.filter((r) => r && r.status === 'pending');
    const pendingYearReqs = state.yearRequests.filter((r) => r && r.status === 'pending');
    const totalPendingReqs = pendingResets.length + pendingYearReqs.length;
    const errCount = state.questionIssues.filter((i) => i.severity === 'error').length;
    const yearCounts = [1, 2, 3, 4].map((yr) => ({
      yr,
      count: state.questionBank.filter((q) => q.year === yr).length,
    }));
    const discMap = {};
    for (const q of state.questionBank) {
      discMap[q.category] = (discMap[q.category] || 0) + 1;
    }

    const alertBanners = [];
    if (totalPendingReqs > 0) {
      alertBanners.push(`
        <div class="adm-alert-banner">
          <div>
            <strong>${totalPendingReqs} Pending Player Request${totalPendingReqs === 1 ? '' : 's'}</strong>
            <small>${pendingYearReqs.length} Year Level change request(s) and ${pendingResets.length} Forgot Password request(s) waiting for admin review.</small>
          </div>
          <button class="adm-btn adm-btn-primary adm-btn-sm" type="button" data-adm-tab="resets">Review Requests →</button>
        </div>
      `);
    }
    if (state.supabaseAuthRejected && state.provider !== 'supabase') {
      alertBanners.push(`
        <div class="adm-alert-banner is-info">
          <div>
            <strong>Connected via ${state.provider === 'local' ? 'Local Server' : 'Browser Preview'}</strong>
            <small>Your Cloud Supabase <code>admin_accounts</code> table rejected the default credentials (or needs syncing). Re-run <code>supabase/migration-admin-console.sql</code> in the Supabase SQL Editor if you want Cloud Admin login.</small>
          </div>
        </div>
      `);
    } else if (state.supabaseNeedsMigration && state.provider !== 'supabase') {
      alertBanners.push(`
        <div class="adm-alert-banner is-info">
          <div>
            <strong>Cloud Admin Setup Optional Note</strong>
            <small>You are connected to Local Server + public Cloud Leaderboards. To manage Cloud Supabase accounts &amp; passwords remotely, run <code>supabase/migration-admin-console.sql</code> in the Supabase SQL Editor.</small>
          </div>
        </div>
      `);
    }

    const healthRows = [
      {
        name: 'Account Storage',
        desc: state.provider === 'supabase'
          ? 'Connected to Supabase Cloud Database'
          : state.provider === 'local'
            ? `Running on Local Server (Uptime: ${formatUptime(state.serverInfo.uptimeSeconds)})`
            : 'Browser preview mode — start serve-local.ps1 to save password changes',
        pill: state.provider === 'offline' ? { cls: 'is-warn', text: 'READ-ONLY' } : { cls: 'is-ok', text: 'CONNECTED' },
      },
      {
        name: 'Question Quality Check',
        desc: `${state.questionBank.length} questions checked for missing answers, years, and duplicates`,
        pill: errCount === 0 ? { cls: 'is-ok', text: 'ALL GOOD' } : { cls: 'is-danger', text: `${errCount} TO FIX` },
      },
      {
        name: 'Multiplayer Rooms',
        desc: `${state.mpPlayers.length} player(s) online · ${state.mpRooms.length} open 1v1 room(s)`,
        pill: { cls: 'is-ok', text: 'READY' },
      },
    ];

    const recentAudit = state.auditLogs.slice(0, 6).map((a) => `
      <tr>
        <td class="adm-mono">${esc(formatDate(a.timestamp))}</td>
        <td><span class="adm-pill is-accent">${esc(ACTION_LABELS[a.action] || a.action)}</span></td>
        <td><strong>${esc(a.target)}</strong></td>
        <td>${esc(a.detail)}</td>
      </tr>
    `).join('');

    return `
      ${alertBanners.join('')}
      <section class="adm-kpi-grid" aria-label="Key numbers">
        <article class="adm-kpi-card">
          <span class="adm-kpi-label">Total Accounts</span>
          <strong class="adm-kpi-val">${state.users.length}</strong>
          <span class="adm-kpi-sub">Recorded players</span>
        </article>
        <article class="adm-kpi-card">
          <span class="adm-kpi-label">Signed-In Now</span>
          <strong class="adm-kpi-val">${activeSessions}</strong>
          <span class="adm-kpi-sub">Active player logins</span>
        </article>
        <article class="adm-kpi-card">
          <span class="adm-kpi-label">Pending Requests</span>
          <strong class="adm-kpi-val">${totalPendingReqs}</strong>
          <span class="adm-kpi-sub">${pendingYearReqs.length} year · ${pendingResets.length} password</span>
        </article>
        <article class="adm-kpi-card">
          <span class="adm-kpi-label">Quiz Questions</span>
          <strong class="adm-kpi-val">${state.questionBank.length}</strong>
          <span class="adm-kpi-sub">Y1:${yearCounts[0].count} · Y2:${yearCounts[1].count} · Y3:${yearCounts[2].count} · Y4:${yearCounts[3].count}</span>
        </article>
        <article class="adm-kpi-card">
          <span class="adm-kpi-label">Live 1v1 Rooms</span>
          <strong class="adm-kpi-val">${state.mpRooms.length}</strong>
          <span class="adm-kpi-sub">${state.mpPlayers.length} online in lobby</span>
        </article>
        <article class="adm-kpi-card">
          <span class="adm-kpi-label">Leaderboard Scores</span>
          <strong class="adm-kpi-val">${state.arcadeLeaderboard.length + state.pvpLeaderboard.length}</strong>
          <span class="adm-kpi-sub">${state.arcadeLeaderboard.length} Campaign · ${state.pvpLeaderboard.length} 1v1</span>
        </article>
      </section>

      <div class="adm-two-col">
        <section class="adm-panel">
          <header class="adm-panel-head">
            <div>
              <h3>System Status</h3>
              <small>Quick status of storage, question checks, and multiplayer</small>
            </div>
          </header>
          <div class="adm-panel-body">
            <div class="adm-health-list">
              ${healthRows.map((h) => `
                <div class="adm-health-row">
                  <div>
                    <strong>${esc(h.name)}</strong>
                    <small>${esc(h.desc)}</small>
                  </div>
                  <span class="adm-pill ${h.pill.cls}">${esc(h.pill.text)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </section>

        <section class="adm-panel">
          <header class="adm-panel-head">
            <div>
              <h3>Questions by Year &amp; Subject</h3>
              <small>How the ${state.questionBank.length} quiz questions are divided</small>
            </div>
          </header>
          <div class="adm-panel-body">
            ${yearCounts.map((y) => {
              const pct = state.questionBank.length ? Math.round((100 * y.count) / state.questionBank.length) : 0;
              return `<div class="adm-bar-row">
                <span>${esc(YEAR_NAMES[y.yr])}</span>
                <div class="adm-bar-track"><i style="width:${pct}%"></i></div>
                <span class="adm-mono">${y.count} (${pct}%)</span>
              </div>`;
            }).join('')}
            <hr style="border:0;border-top:1px solid var(--adm-border);margin:12px 0" />
            ${Object.entries(discMap).map(([cat, count]) => {
              const pct = state.questionBank.length ? Math.round((100 * count) / state.questionBank.length) : 0;
              return `<div class="adm-bar-row">
                <span>${esc(cat)}</span>
                <div class="adm-bar-track"><i style="width:${pct}%"></i></div>
                <span class="adm-mono">${count} (${pct}%)</span>
              </div>`;
            }).join('')}
          </div>
        </section>
      </div>

      <section class="adm-panel adm-security-card">
        <header class="adm-panel-head">
          <div>
            <h3>System Security &amp; Data-Safety Notice Broadcast</h3>
            <small>Notify all students across Login &amp; Game screens immediately if an account leak or maintenance alert occurs</small>
          </div>
          <span class="adm-pill ${state.securityNotice?.active ? (state.securityNotice.severity === 'critical' ? 'is-danger' : 'is-warn') : 'is-ok'}">
            ${state.securityNotice?.active ? `LIVE (${esc(String(state.securityNotice.severity || 'info').toUpperCase())})` : 'NO ACTIVE ALERT'}
          </span>
        </header>
        <div class="adm-panel-body">
          <div class="adm-security-form">
            <div class="adm-security-row">
              <label class="adm-field">
                <span>Severity</span>
                <select class="adm-select" id="admSecuritySeverity">
                  <option value="info" ${state.securityNotice?.severity === 'info' ? 'selected' : ''}>Info</option>
                  <option value="warning" ${state.securityNotice?.severity === 'warning' ? 'selected' : ''}>Warning</option>
                  <option value="critical" ${state.securityNotice?.severity === 'critical' ? 'selected' : ''}>Critical Incident</option>
                </select>
              </label>
              <label class="adm-field">
                <span>Banner Title</span>
                <input class="adm-input" id="admSecurityTitle" type="text" maxlength="120" value="${esc(state.securityNotice?.title || '')}" placeholder="e.g. Security Notice: Change Your Password Immediately" />
              </label>
            </div>
            <label class="adm-field">
              <span>User Instructions</span>
              <textarea class="adm-textarea" id="admSecurityMessage" rows="2" maxlength="400" placeholder="Explain clearly what happened and what students should do...">${esc(state.securityNotice?.message || '')}</textarea>
            </label>
            <div class="adm-security-actions">
              <button class="adm-btn adm-btn-primary adm-btn-sm" type="button" id="admPublishSecurityNoticeBtn">Publish Banner</button>
              <button class="adm-btn adm-btn-secondary adm-btn-sm" type="button" id="admTemplateSecurityNoticeBtn">Load Data-Safety Alert Template</button>
              <button class="adm-btn adm-btn-danger-outline adm-btn-sm" type="button" id="admClearSecurityNoticeBtn">Clear Active Notice</button>
            </div>
          </div>
        </div>
      </section>

      <section class="adm-panel">
        <header class="adm-panel-head">
          <div>
            <h3>Recent Admin Activity</h3>
            <small>Latest account and moderation changes</small>
          </div>
          <button class="adm-btn adm-btn-ghost adm-btn-sm" type="button" data-adm-tab="audit">See All Activity →</button>
        </header>
        <div class="adm-table-wrap">
          ${recentAudit
            ? `<table class="adm-table">
                <thead><tr><th>Time</th><th>Action</th><th>Account / Item</th><th>What Happened</th></tr></thead>
                <tbody>${recentAudit}</tbody>
              </table>`
            : '<div class="adm-empty">No admin changes recorded yet.</div>'}
        </div>
      </section>
    `;
  }

  function renderUsers() {
    const q = state.userSearch.trim().toLowerCase();
    const filtered = state.users.filter((u) => {
      const yr = String(Number(u.review_store?.academicYear) || 4);
      const sess = Number(u.active_sessions) || 0;
      const locked = Boolean(u.is_suspended);
      if (state.userYearFilter !== 'ALL' && yr !== state.userYearFilter) return false;
      if (state.userStatusFilter === 'locked' && !locked) return false;
      if (state.userStatusFilter === 'active' && locked) return false;
      if (state.userStatusFilter === 'online' && sess === 0) return false;
      if (!q) return true;
      return String(u.display_name || '').toLowerCase().includes(q)
        || String(u.username_key || '').toLowerCase().includes(q)
        || String(u.id || '').toLowerCase().includes(q);
    });

    const rows = filtered.map((u) => {
      const yr = Number(u.review_store?.academicYear) || 4;
      const ans = Number(u.total_answers) || 0;
      const cor = Number(u.total_correct) || 0;
      const acc = ans > 0 ? `${Math.round((100 * cor) / ans)}%` : '—';
      const sess = Number(u.active_sessions) || 0;
      const locked = Boolean(u.is_suspended);
      const isLbOnly = u.source === 'leaderboard';
      return `<tr>
        <td>
          <strong>${esc(u.display_name)}</strong>
          ${isLbOnly ? ' <span class="adm-pill is-neutral" title="Recorded from public leaderboard; player has not logged in locally yet">Leaderboard Only</span>' : ''}
          <br /><small style="color:var(--adm-dim)">@${esc(u.username_key)} · ID ${esc(u.id)}</small>
        </td>
        <td><span class="adm-pill is-accent">${esc(YEAR_NAMES[yr] || `Year ${yr}`)}</span></td>
        <td>
          ${locked
            ? '<span class="adm-pill is-danger">Locked</span>'
            : sess > 0
              ? `<span class="adm-pill is-ok">Signed In (${sess})</span>`
              : '<span class="adm-pill is-neutral">Active</span>'}
        </td>
        <td class="adm-mono">${esc(u.best_score || 0)}</td>
        <td class="adm-mono">${acc} (${cor}/${ans})</td>
        <td>${esc(formatDate(u.last_login_at))}</td>
        <td>
          <div class="adm-action-menu">
            <button class="adm-btn adm-btn-secondary adm-btn-sm" type="button" data-adm-act="inspect-user" data-key="${esc(u.username_key)}">Details</button>
            <button class="adm-btn adm-btn-secondary adm-btn-sm" type="button" data-adm-act="reset-pw" data-key="${esc(u.username_key)}">Change Password</button>
            <button class="adm-btn ${locked ? 'adm-btn-primary' : 'adm-btn-ghost'} adm-btn-sm" type="button" data-adm-act="toggle-suspend" data-key="${esc(u.username_key)}" data-locked="${locked}">${locked ? 'Unlock' : 'Lock'}</button>
            <button class="adm-btn adm-btn-ghost adm-btn-sm" type="button" data-adm-act="user-more" data-key="${esc(u.username_key)}">More…</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    return `
      <section class="adm-panel">
        <header class="adm-panel-head">
          <div>
            <h3>Player Accounts (${filtered.length} shown of ${state.users.length})</h3>
            <small>Every registered player appears here. Click Details to inspect stats or change a player's year level.</small>
          </div>
          <div class="adm-table-actions">
            <button class="adm-btn adm-btn-primary adm-btn-sm" type="button" data-adm-act="open-create-user">+ Create Account</button>
            <button class="adm-btn adm-btn-secondary adm-btn-sm" type="button" data-adm-act="export-accounts-csv">↓ Download CSV</button>
            <button class="adm-btn adm-btn-danger-outline adm-btn-sm" type="button" data-adm-act="revoke-all">Sign Out All Players</button>
          </div>
        </header>
        <div class="adm-toolbar">
          <input class="adm-input" id="admUserSearch" type="search" placeholder="Search username or ID…" value="${esc(state.userSearch)}" />
          <select class="adm-select" id="admUserYearFilter" aria-label="Filter by year level">
            <option value="ALL" ${state.userYearFilter === 'ALL' ? 'selected' : ''}>All Year Levels</option>
            <option value="1" ${state.userYearFilter === '1' ? 'selected' : ''}>1st Year</option>
            <option value="2" ${state.userYearFilter === '2' ? 'selected' : ''}>2nd Year</option>
            <option value="3" ${state.userYearFilter === '3' ? 'selected' : ''}>3rd Year</option>
            <option value="4" ${state.userYearFilter === '4' ? 'selected' : ''}>4th Year</option>
          </select>
          <select class="adm-select" id="admUserStatusFilter" aria-label="Filter by status">
            <option value="ALL" ${state.userStatusFilter === 'ALL' ? 'selected' : ''}>All Statuses</option>
            <option value="active" ${state.userStatusFilter === 'active' ? 'selected' : ''}>Active Only</option>
            <option value="online" ${state.userStatusFilter === 'online' ? 'selected' : ''}>Signed In Now</option>
            <option value="locked" ${state.userStatusFilter === 'locked' ? 'selected' : ''}>Locked Accounts</option>
          </select>
        </div>
        <div class="adm-table-wrap">
          ${rows
            ? `<table class="adm-table">
                <thead>
                  <tr>
                    <th>Player</th><th>Year Level</th><th>Status</th><th>Best Score</th><th>Accuracy</th><th>Last Active</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>`
            : '<div class="adm-empty">No player accounts match your search or filters yet.</div>'}
        </div>
      </section>
    `;
  }

  function renderResets() {
    const sortReqs = (list) => [...list].sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return Date.parse(b.created_at || '') - Date.parse(a.created_at || '');
    });

    const sortedYears = sortReqs(state.yearRequests);
    const yearRows = sortedYears.map((r) => {
      const statusCls = r.status === 'pending' ? 'is-warn' : (r.status === 'approved' ? 'is-ok' : 'is-neutral');
      const statusTxt = r.status === 'pending' ? 'Pending' : (r.status === 'approved' ? 'Approved' : 'Dismissed');
      const curLbl = YEAR_NAMES[r.current_year] || `Year ${r.current_year}`;
      const reqLbl = YEAR_NAMES[r.requested_year] || `Year ${r.requested_year}`;
      return `<tr>
        <td><strong>${esc(r.display_name || r.username_key)}</strong><br /><small style="color:var(--adm-dim)">@${esc(r.username_key)}</small></td>
        <td><span class="adm-pill is-neutral">${esc(curLbl)}</span> → <span class="adm-pill is-accent">${esc(reqLbl)}</span></td>
        <td>${esc(r.reason || 'No reason provided')}</td>
        <td>${esc(formatDate(r.created_at))}</td>
        <td><span class="adm-pill ${statusCls}">${statusTxt}</span>${r.resolved_by ? `<br /><small style="color:var(--adm-dim)">by ${esc(r.resolved_by)}</small>` : ''}</td>
        <td>
          ${r.status === 'pending'
            ? `<div class="adm-table-actions">
                <button class="adm-btn adm-btn-primary adm-btn-sm" type="button" data-adm-act="approve-year-req" data-reqid="${esc(r.id)}" data-key="${esc(r.username_key)}" data-year="${esc(r.requested_year)}" data-localonly="${r._localOnly ? 'true' : 'false'}">Approve Change</button>
                <button class="adm-btn adm-btn-ghost adm-btn-sm" type="button" data-adm-act="dismiss-year-req" data-reqid="${esc(r.id)}" data-key="${esc(r.username_key)}" data-localonly="${r._localOnly ? 'true' : 'false'}">Dismiss</button>
              </div>`
            : '<span style="color:var(--adm-dim)">Completed</span>'}
        </td>
      </tr>`;
    }).join('');

    const sortedResets = sortReqs(state.resetRequests);
    const rows = sortedResets.map((r) => {
      const statusCls = r.status === 'pending' ? 'is-warn' : (r.status === 'resolved' ? 'is-ok' : 'is-neutral');
      const statusTxt = r.status === 'pending' ? 'Pending' : (r.status === 'resolved' ? 'Resolved' : 'Dismissed');
      return `<tr>
        <td><strong>${esc(r.display_name || r.username_key)}</strong><br /><small style="color:var(--adm-dim)">@${esc(r.username_key)}</small></td>
        <td>${esc(r.note || 'No note provided')}</td>
        <td>${esc(formatDate(r.created_at))}</td>
        <td><span class="adm-pill ${statusCls}">${statusTxt}</span>${r.resolved_by ? `<br /><small style="color:var(--adm-dim)">by ${esc(r.resolved_by)}</small>` : ''}</td>
        <td>
          ${r.status === 'pending'
            ? `<div class="adm-table-actions">
                <button class="adm-btn adm-btn-primary adm-btn-sm" type="button" data-adm-act="reset-pw" data-key="${esc(r.username_key)}">Reset Password</button>
                <button class="adm-btn adm-btn-ghost adm-btn-sm" type="button" data-adm-act="dismiss-reset" data-reqid="${esc(r.id)}" data-key="${esc(r.username_key)}" data-localonly="${r._localOnly ? 'true' : 'false'}">Dismiss</button>
              </div>`
            : '<span style="color:var(--adm-dim)">Completed</span>'}
        </td>
      </tr>`;
    }).join('');

    return `
      <section class="adm-panel">
        <header class="adm-panel-head">
          <div>
            <h3>Year Level Change Requests (${sortedYears.length})</h3>
            <small>Students are locked to their Sign-Up Year Level. Only approve changes here when a student is ready or picked the wrong year.</small>
          </div>
        </header>
        <div class="adm-table-wrap">
          ${yearRows
            ? `<table class="adm-table">
                <thead><tr><th>Player</th><th>Change</th><th>Reason</th><th>Requested</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>${yearRows}</tbody>
              </table>`
            : '<div class="adm-empty">No year change requests right now.</div>'}
        </div>
      </section>

      <section class="adm-panel">
        <header class="adm-panel-head">
          <div>
            <h3>Forgot Password Requests (${sortedResets.length})</h3>
            <small>When a player clicks "Forgot password?" on the login page, their request shows up here so you can give them a new password.</small>
          </div>
        </header>
        <div class="adm-table-wrap">
          ${rows
            ? `<table class="adm-table">
                <thead><tr><th>Player</th><th>Message / Note</th><th>Requested</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>${rows}</tbody>
              </table>`
            : '<div class="adm-empty">No password reset requests right now.</div>'}
        </div>
      </section>
    `;
  }

  function renderQuestions() {
    const categories = ['ALL', ...new Set(state.questionBank.map((q) => q.category).filter(Boolean))];
    const s = state.qSearch.trim().toLowerCase();
    const filtered = state.questionBank.filter((q) => {
      if (state.qCategory !== 'ALL' && q.category !== state.qCategory) return false;
      if (state.qDifficulty !== 'ALL' && q.difficulty !== state.qDifficulty) return false;
      if (state.qYear !== 'ALL' && String(q.year) !== state.qYear) return false;
      if (s && !q.q.toLowerCase().includes(s) && !q.topic.toLowerCase().includes(s) && !q.category.toLowerCase().includes(s)) return false;
      return true;
    });

    const pageSize = Math.max(10, Number(state.qPageSize) || 25);
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    state.qPage = Math.max(1, Math.min(state.qPage || 1, totalPages));
    const startIdx = (state.qPage - 1) * pageSize;
    const endIdx = Math.min(filtered.length, startIdx + pageSize);
    const pageItems = filtered.slice(startIdx, endIdx);

    const buildPageList = (cur, total) => {
      if (total <= 12) return Array.from({ length: total }, (_, idx) => idx + 1);
      const pages = [1];
      const winStart = Math.max(2, cur - 2);
      const winEnd = Math.min(total - 1, cur + 2);
      if (winStart > 2) pages.push('...');
      for (let p = winStart; p <= winEnd; p++) pages.push(p);
      if (winEnd < total - 1) pages.push('...');
      pages.push(total);
      return pages;
    };

    const issueIds = new Set(state.questionIssues.map((i) => i.id));
    const rows = pageItems.map((q) => {
      const hasIssue = issueIds.has(q._id);
      return `<tr>
        <td><span class="adm-pill is-accent">${esc(YEAR_NAMES[q.year] || `Year ${q.year}`)}</span></td>
        <td><span class="adm-pill ${q.difficulty === 'hard' ? 'is-danger' : q.difficulty === 'medium' ? 'is-warn' : 'is-ok'}">${esc(q.difficulty)}</span></td>
        <td><strong>${esc(q.topic)}</strong><br /><small style="color:var(--adm-dim)">${esc(q.category)}</small></td>
        <td>${esc(q.q.length > 96 ? q.q.slice(0, 96) + '…' : q.q)}</td>
        <td>${hasIssue ? '<span class="adm-pill is-danger">Needs Fix</span>' : '<span class="adm-pill is-ok">Ready</span>'}</td>
        <td>
          <button class="adm-btn adm-btn-secondary adm-btn-sm" type="button" data-adm-act="edit-question" data-qid="${esc(q._id)}">Edit</button>
        </td>
      </tr>`;
    }).join('');

    const paginationHtml = filtered.length > 0
      ? `<div class="adm-pagination" aria-label="Question bank pages">
          <div class="adm-page-info">
            Showing <strong>${startIdx + 1}–${endIdx}</strong> of <strong>${filtered.length}</strong> · Page <strong>${state.qPage}</strong> of <strong>${totalPages}</strong>
          </div>
          <div class="adm-page-controls">
            <button class="adm-page-btn" type="button" data-adm-qpage="${Math.max(1, state.qPage - 1)}" ${state.qPage <= 1 ? 'disabled' : ''}>← Prev</button>
            ${buildPageList(state.qPage, totalPages).map((p) => (
              p === '...'
                ? '<span class="adm-page-ellipsis" aria-hidden="true">…</span>'
                : `<button class="adm-page-btn ${p === state.qPage ? 'is-active' : ''}" type="button" data-adm-qpage="${p}" ${p === state.qPage ? 'aria-current="page"' : ''}>${p}</button>`
            )).join('')}
            <button class="adm-page-btn" type="button" data-adm-qpage="${Math.min(totalPages, state.qPage + 1)}" ${state.qPage >= totalPages ? 'disabled' : ''}>Next →</button>
            <select class="adm-select adm-page-size" id="admQPageSize" aria-label="Questions per page">
              ${[20, 25, 50, 100].map((sz) => `<option value="${sz}" ${pageSize === sz ? 'selected' : ''}>${sz} / page</option>`).join('')}
            </select>
          </div>
        </div>`
      : '';

    return `
      <section class="adm-panel">
        <header class="adm-panel-head">
          <div>
            <h3>Quiz Questions (${filtered.length} matching of ${state.questionBank.length})</h3>
            <small>Quality check: ${state.questionIssues.length} issue(s) found. Browse all pages (1 to ${totalPages}) or export questions.json.</small>
          </div>
          <div class="adm-table-actions">
            <button class="adm-btn adm-btn-secondary adm-btn-sm" type="button" data-adm-act="add-question">+ Add Question</button>
            <button class="adm-btn adm-btn-primary adm-btn-sm" type="button" data-adm-act="export-questions">↓ Download questions.json</button>
          </div>
        </header>
        <div class="adm-toolbar">
          <input class="adm-input" id="admQSearch" type="search" placeholder="Search question text or topic…" value="${esc(state.qSearch)}" />
          <select class="adm-select" id="admQCategory" aria-label="Filter by subject">
            ${categories.map((c) => `<option value="${esc(c)}" ${state.qCategory === c ? 'selected' : ''}>${esc(c === 'ALL' ? 'All Subjects' : c)}</option>`).join('')}
          </select>
          <select class="adm-select" id="admQDifficulty" aria-label="Filter by difficulty">
            <option value="ALL" ${state.qDifficulty === 'ALL' ? 'selected' : ''}>All Difficulties</option>
            <option value="easy" ${state.qDifficulty === 'easy' ? 'selected' : ''}>Easy</option>
            <option value="medium" ${state.qDifficulty === 'medium' ? 'selected' : ''}>Medium</option>
            <option value="hard" ${state.qDifficulty === 'hard' ? 'selected' : ''}>Hard</option>
          </select>
          <select class="adm-select" id="admQYear" aria-label="Filter by year level">
            <option value="ALL" ${state.qYear === 'ALL' ? 'selected' : ''}>All Years (1–4)</option>
            <option value="1" ${state.qYear === '1' ? 'selected' : ''}>1st Year</option>
            <option value="2" ${state.qYear === '2' ? 'selected' : ''}>2nd Year</option>
            <option value="3" ${state.qYear === '3' ? 'selected' : ''}>3rd Year</option>
            <option value="4" ${state.qYear === '4' ? 'selected' : ''}>4th Year</option>
          </select>
        </div>
        <div class="adm-table-wrap">
          ${rows
            ? `<table class="adm-table">
                <thead>
                  <tr><th>Year</th><th>Difficulty</th><th>Subject &amp; Topic</th><th>Question</th><th>Status</th><th>Action</th></tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>`
            : '<div class="adm-empty">No questions match those filters.</div>'}
        </div>
        ${paginationHtml}
      </section>
    `;
  }

  function renderLeaderboards() {
    const isArcade = state.lbTab === 'arcade';
    let tableHtml = '';

    if (isArcade) {
      const rows = state.arcadeLeaderboard.map((r, i) => {
        const flagged = (r.kills > 150) || (r.total_answers > 0 && r.kills > r.total_answers);
        return `<tr>
          <td class="adm-mono">#${i + 1}</td>
          <td><strong>${esc(r.player_name)}</strong></td>
          <td class="adm-mono">${esc(r.score)}</td>
          <td class="adm-mono">${esc(r.kills)}</td>
          <td class="adm-mono">${esc(r.accuracy)}% (${esc(r.correct_answers)}/${esc(r.total_answers)})</td>
          <td>${flagged ? '<span class="adm-pill is-danger">Check Score</span>' : '<span class="adm-pill is-ok">Fair</span>'}</td>
          <td>${esc(formatDate(r.submitted_at))}</td>
          <td>
            <button class="adm-btn adm-btn-danger-outline adm-btn-sm" type="button" data-adm-act="purge-lb" data-table="arcade" data-id="${esc(r.id)}" data-name="${esc(r.player_name)}">Remove</button>
          </td>
        </tr>`;
      }).join('');
      tableHtml = rows
        ? `<table class="adm-table">
            <thead><tr><th>Rank</th><th>Player</th><th>Score</th><th>Viruses Beat</th><th>Accuracy</th><th>Fair Play</th><th>Date</th><th>Action</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>`
        : '<div class="adm-empty">No Campaign leaderboard scores recorded yet.</div>';
    } else {
      const rows = state.pvpLeaderboard.map((r, i) => `<tr>
        <td class="adm-mono">#${i + 1}</td>
        <td><strong>${esc(r.player_name)}</strong></td>
        <td class="adm-mono">${esc(r.rating)}</td>
        <td class="adm-mono">${esc(r.wins)}W - ${esc(r.losses)}L${r.draws ? ` - ${esc(r.draws)}D` : ''}</td>
        <td class="adm-mono">${esc(r.accuracy || 0)}%</td>
        <td>${esc(formatDate(r.updated_at))}</td>
        <td>
          <button class="adm-btn adm-btn-danger-outline adm-btn-sm" type="button" data-adm-act="purge-lb" data-table="pvp" data-id="${esc(r.id || '')}" data-name="${esc(r.player_name)}">Remove</button>
        </td>
      </tr>`).join('');
      tableHtml = rows
        ? `<table class="adm-table">
            <thead><tr><th>Rank</th><th>Player</th><th>1v1 Rating</th><th>Win / Loss</th><th>Accuracy</th><th>Updated</th><th>Action</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>`
        : '<div class="adm-empty">No 1v1 Multiplayer scores recorded yet.</div>';
    }

    return `
      <section class="adm-panel">
        <header class="adm-panel-head">
          <div>
            <h3>Leaderboard Management</h3>
            <small>Scores are checked automatically for impossible numbers. Remove suspicious or test scores anytime.</small>
          </div>
          <div class="adm-subtabs" role="tablist">
            <button class="adm-subtab ${isArcade ? 'is-active' : ''}" type="button" data-adm-lbtab="arcade">Campaign (${state.arcadeLeaderboard.length})</button>
            <button class="adm-subtab ${!isArcade ? 'is-active' : ''}" type="button" data-adm-lbtab="pvp">1v1 Arena (${state.pvpLeaderboard.length})</button>
          </div>
        </header>
        <div class="adm-table-wrap">${tableHtml}</div>
      </section>
    `;
  }

  function renderMultiplayer() {
    const roomRows = state.mpRooms.map((r) => {
      const hostName = r.host?.username || r.host_name || 'Host';
      const guestName = r.guest?.username || r.guest_name || 'Waiting…';
      const yr = r.yearLevel || r.settings?.yearLevel || 4;
      const cat = r.category || r.settings?.category || 'ALL';
      return `<tr>
        <td class="adm-mono"><strong>${esc(r.code)}</strong></td>
        <td><span class="adm-pill ${r.visibility === 'private' ? 'is-warn' : 'is-ok'}">${esc(r.visibility === 'private' ? 'Private' : 'Public')}</span></td>
        <td><span class="adm-pill is-accent">${esc(r.status || 'waiting')}</span></td>
        <td>${esc(hostName)} vs ${esc(guestName)}</td>
        <td>${esc(cat === 'ALL' ? 'All Subjects' : cat)} · ${esc(YEAR_NAMES[yr] || `Year ${yr}`)}</td>
        <td>
          <button class="adm-btn adm-btn-danger-outline adm-btn-sm" type="button" data-adm-act="close-room" data-code="${esc(r.code)}">Close Room</button>
        </td>
      </tr>`;
    }).join('');

    const playerRows = state.mpPlayers.map((p) => `<tr>
      <td><strong>${esc(p.username)}</strong></td>
      <td><span class="adm-pill is-ok">${esc(p.status || 'Available')}</span></td>
      <td class="adm-mono">${esc(p.roomCode || 'Lobby')}</td>
      <td>${Math.round((Number(p.ageMs) || 0) / 1000)}s ago</td>
    </tr>`).join('');

    return `
      <section class="adm-panel">
        <header class="adm-panel-head">
          <div>
            <h3>Active 1v1 Rooms (${state.mpRooms.length})</h3>
            <small>Live match lobbies with their subject and academic year setting.</small>
          </div>
        </header>
        <div class="adm-table-wrap">
          ${roomRows
            ? `<table class="adm-table">
                <thead><tr><th>Room Code</th><th>Privacy</th><th>Status</th><th>Players</th><th>Question Filter</th><th>Action</th></tr></thead>
                <tbody>${roomRows}</tbody>
              </table>`
            : '<div class="adm-empty">No open 1v1 rooms right now.</div>'}
        </div>
      </section>

      <section class="adm-panel">
        <header class="adm-panel-head">
          <div>
            <h3>Players Online in 1v1 Lobby (${state.mpPlayers.length})</h3>
            <small>Players currently browsing or waiting in the multiplayer screen.</small>
          </div>
        </header>
        <div class="adm-table-wrap">
          ${playerRows
            ? `<table class="adm-table">
                <thead><tr><th>Player</th><th>Status</th><th>Location / Code</th><th>Last Ping</th></tr></thead>
                <tbody>${playerRows}</tbody>
              </table>`
            : '<div class="adm-empty">No players currently in the multiplayer lobby.</div>'}
        </div>
      </section>
    `;
  }

  function renderAudit() {
    const rows = state.auditLogs.map((a) => `<tr>
      <td>${esc(formatDate(a.timestamp))}</td>
      <td><strong>${esc(a.actor)}</strong></td>
      <td><span class="adm-pill is-accent">${esc(ACTION_LABELS[a.action] || a.action)}</span></td>
      <td><strong>${esc(a.target)}</strong></td>
      <td>${esc(a.detail)}</td>
    </tr>`).join('');

    return `
      <section class="adm-panel">
        <header class="adm-panel-head">
          <div>
            <h3>Admin Activity Log (${state.auditLogs.length})</h3>
            <small>Every password change, account lock, year update, and score removal is recorded here.</small>
          </div>
          <div class="adm-table-actions">
            <button class="adm-btn adm-btn-secondary adm-btn-sm" type="button" data-adm-act="export-accounts-csv">↓ Download Accounts CSV</button>
            <button class="adm-btn adm-btn-primary adm-btn-sm" type="button" data-adm-act="export-diagnostics">↓ Download Full Backup (JSON)</button>
          </div>
        </header>
        <div class="adm-table-wrap">
          ${rows
            ? `<table class="adm-table">
                <thead><tr><th>Time</th><th>Admin</th><th>Action</th><th>Account / Item</th><th>What Happened</th></tr></thead>
                <tbody>${rows}</tbody>
              </table>`
            : '<div class="adm-empty">No admin activity recorded yet.</div>'}
        </div>
      </section>
    `;
  }

  function renderActiveTab() {
    const main = $('adminMain');
    if (!main) return;
    if (state.tab === 'users') main.innerHTML = renderUsers();
    else if (state.tab === 'resets') main.innerHTML = renderResets();
    else if (state.tab === 'questions') main.innerHTML = renderQuestions();
    else if (state.tab === 'leaderboards') main.innerHTML = renderLeaderboards();
    else if (state.tab === 'multiplayer') main.innerHTML = renderMultiplayer();
    else if (state.tab === 'audit') main.innerHTML = renderAudit();
    else main.innerHTML = renderOverview();
  }

  // ===== Human-Readable Account Details Modal =====
  function renderUserDetailsModal(user) {
    const yr = Number(user.review_store?.academicYear) || 4;
    const ans = Number(user.total_answers) || 0;
    const cor = Number(user.total_correct) || 0;
    const acc = ans > 0 ? `${Math.round((100 * cor) / ans)}%` : 'No answers yet';
    const missedCount = Array.isArray(user.review_store?.queue) ? user.review_store.queue.length : 0;

    // Summarize topic progress per subject
    const subjectBars = [];
    const tp = user.topic_progress && typeof user.topic_progress === 'object' ? user.topic_progress : {};
    for (const [cat, topics] of Object.entries(tp)) {
      let cAtt = 0;
      let cCor = 0;
      for (const t of Object.values(topics || {})) {
        cAtt += Number(t?.attempted) || 0;
        cCor += Number(t?.correct) || 0;
      }
      const pct = cAtt > 0 ? Math.round((100 * cCor) / cAtt) : 0;
      subjectBars.push(`
        <div class="adm-topic-mini-row">
          <span>${esc(cat)}</span>
          <div class="adm-bar-track"><i style="width:${pct}%"></i></div>
          <span class="adm-mono">${cAtt > 0 ? `${pct}% (${cCor}/${cAtt})` : '0/0'}</span>
        </div>
      `);
    }

    openModal(
      `Player Details · ${user.display_name}`,
      `
        <div class="adm-detail-grid">
          <div class="adm-detail-stat"><span>Account Status</span><strong>${user.is_suspended ? 'Locked' : 'Active'}</strong></div>
          <div class="adm-detail-stat"><span>Signed-In Logins</span><strong>${Number(user.active_sessions) || 0}</strong></div>
          <div class="adm-detail-stat"><span>Best Score</span><strong>${Number(user.best_score) || 0}</strong></div>
          <div class="adm-detail-stat"><span>Overall Accuracy</span><strong>${acc}</strong></div>
          <div class="adm-detail-stat"><span>Missed Review Queue</span><strong>${missedCount}</strong></div>
          <div class="adm-detail-stat"><span>Last Active</span><strong>${esc(formatDate(user.last_login_at))}</strong></div>
        </div>

        <div class="adm-year-edit-row">
          <label for="admDetailYearSelect">Assigned Year Level:</label>
          <select id="admDetailYearSelect">
            ${[1, 2, 3, 4].map((y) => `<option value="${y}" ${yr === y ? 'selected' : ''}>${esc(YEAR_NAMES[y])}</option>`).join('')}
          </select>
          <button class="adm-btn adm-btn-primary adm-btn-sm" type="button" id="admSaveDetailYearBtn" data-key="${esc(user.username_key)}">Save Year Level</button>
        </div>

        <div>
          <strong style="display:block;font-size:13px;margin-bottom:8px">Subject Progress Breakdown</strong>
          <div class="adm-topic-mini-list">
            ${subjectBars.length ? subjectBars.join('') : '<span style="color:var(--adm-muted);font-size:13px">No topic answers recorded yet.</span>'}
          </div>
        </div>

        <details class="adm-details-fold">
          <summary>Technical Data (Developer View)</summary>
          <pre class="adm-pre">${esc(JSON.stringify(user, null, 2))}</pre>
        </details>
      `,
      `<button class="adm-btn adm-btn-secondary" type="button" data-adm-close-modal>Close</button>`
    );
  }

  // ===== Action Handler =====
  async function handleAction(act, target) {
    if (act === 'inspect-user') {
      const user = state.users.find((u) => u.username_key === target.dataset.key);
      if (user) renderUserDetailsModal(user);
      return;
    }

    if (act === 'open-create-user') {
      if (state.provider === 'offline') {
        showToast('Start serve-local.ps1 or connect Cloud Database to create new player accounts.', 'warn');
        return;
      }
      openModal(
        'Create New Player Account',
        `<label class="adm-field"><span>Username (1–24 characters)</span><input id="admCreateUsername" type="text" maxlength="24" placeholder="e.g. JuanDelaCruz" /></label>
         <label class="adm-field"><span>Initial Password (6–72 characters)</span><input id="admCreatePassword" type="text" maxlength="72" placeholder="Minimum 6 characters" /></label>
         <label class="adm-field"><span>Academic Year Level</span>
           <select id="admCreateYear">
             <option value="1">1st Year — Foundations (Year 1 only)</option>
             <option value="2">2nd Year — Core IT/CS (Years 1–2)</option>
             <option value="3">3rd Year — Systems &amp; Security (Years 1–3)</option>
             <option value="4" selected>4th Year — Full Curriculum (Years 1–4)</option>
           </select>
         </label>`,
        `<button class="adm-btn adm-btn-ghost" type="button" data-adm-close-modal>Cancel</button>
         <button class="adm-btn adm-btn-primary" type="button" id="admConfirmCreateUser">Create Account</button>`
      );
      return;
    }

    if (act === 'reset-pw') {
      const uk = target.dataset.key;
      if (state.provider === 'offline') {
        showToast('Start serve-local.ps1 or connect Cloud Database to change player passwords.', 'warn');
        return;
      }
      openModal(
        `Change Password · @${uk}`,
        `<p style="margin:0;color:var(--adm-muted)">Enter a new password below, or leave it blank to generate a random temporary password. This will also sign the player out of old devices and mark any Forgot Password request as resolved.</p>
         <label class="adm-field"><span>New Password (optional, 6–72 chars)</span><input id="admNewPwInput" type="text" maxlength="72" placeholder="Leave blank to auto-generate (e.g. BB-9F2A4C10)" /></label>`,
        `<button class="adm-btn adm-btn-ghost" type="button" data-adm-close-modal>Cancel</button>
         <button class="adm-btn adm-btn-primary" type="button" id="admConfirmResetPw" data-key="${esc(uk)}">Set New Password</button>`
      );
      return;
    }

    if (act === 'approve-year-req') {
      const reqId = Number(target.dataset.reqid);
      const reqUserKey = String(target.dataset.key || '').toLowerCase();
      const reqYear = Number(target.dataset.year) || 4;
      const isLocalOnly = target.dataset.localonly === 'true';
      if (state.provider === 'offline') {
        showToast('Start serve-local.ps1 or connect Cloud Database to approve year changes.', 'warn');
        return;
      }
      try {
        let res;
        if (isLocalOnly && reqUserKey) {
          if (state.provider === 'local') {
            res = await postLocalAdmin('set-user-year', { adminToken: state.token, usernameKey: reqUserKey, academicYear: reqYear });
          } else {
            await callSupabaseRpc('admin_set_user_year', { p_admin_token: state.token, p_username_key: reqUserKey, p_year: reqYear });
            res = { academicYear: reqYear };
          }
        } else if (state.provider === 'local') {
          res = await postLocalAdmin('approve-year-request', { adminToken: state.token, requestId: reqId });
        } else {
          res = await callSupabaseRpc('admin_approve_year_request', { p_admin_token: state.token, p_request_id: reqId });
        }
        removeLocalPendingItem('bytebound-pending-year-requests-v1', (r) => String(r.id) === String(target.dataset.reqid) || String(r.username_key || '').toLowerCase() === reqUserKey);
        showToast(`Approved year change to ${YEAR_NAMES[res.academicYear] || `Year ${res.academicYear}`}.`, 'ok');
        await refreshTelemetry();
      } catch (err) {
        showToast(err.message, 'err');
      }
      return;
    }

    if (act === 'dismiss-year-req') {
      const reqId = Number(target.dataset.reqid);
      const reqUserKey = String(target.dataset.key || '').toLowerCase();
      const isLocalOnly = target.dataset.localonly === 'true';
      try {
        if (!isLocalOnly) {
          if (state.provider === 'local') {
            await postLocalAdmin('dismiss-year-request', { adminToken: state.token, requestId: reqId });
          } else if (state.provider === 'supabase') {
            await callSupabaseRpc('admin_dismiss_year_request', { p_admin_token: state.token, p_request_id: reqId });
          }
        }
        removeLocalPendingItem('bytebound-pending-year-requests-v1', (r) => String(r.id) === String(target.dataset.reqid) || (reqUserKey && String(r.username_key || '').toLowerCase() === reqUserKey));
        if (isLocalOnly || state.provider === 'offline') {
          pushLocalAudit('DISMISS_YEAR_REQ', reqUserKey || `Request #${target.dataset.reqid}`, 'Dismissed year change request');
        }
        showToast('Year change request dismissed.', 'ok');
        await refreshTelemetry();
      } catch (err) {
        showToast(err.message, 'err');
      }
      return;
    }

    if (act === 'dismiss-reset') {
      const reqId = Number(target.dataset.reqid);
      const reqUserKey = String(target.dataset.key || '').toLowerCase();
      const isLocalOnly = target.dataset.localonly === 'true';
      try {
        if (!isLocalOnly) {
          if (state.provider === 'local') {
            await postLocalAdmin('dismiss-reset-request', { adminToken: state.token, requestId: reqId });
          } else if (state.provider === 'supabase') {
            await callSupabaseRpc('admin_dismiss_reset_request', { p_admin_token: state.token, p_request_id: reqId });
          }
        }
        removeLocalPendingItem('bytebound-pending-resets-v1', (r) => String(r.id) === String(target.dataset.reqid) || (reqUserKey && String(r.username_key || '').toLowerCase() === reqUserKey));
        if (isLocalOnly || state.provider === 'offline') {
          pushLocalAudit('DISMISS_RESET_REQ', reqUserKey || `Request #${target.dataset.reqid}`, 'Dismissed password reset request');
        }
        showToast('Password request dismissed.', 'ok');
        await refreshTelemetry();
      } catch (err) {
        showToast(err.message, 'err');
      }
      return;
    }

    if (act === 'toggle-suspend') {
      const uk = target.dataset.key;
      const isLocked = target.dataset.locked === 'true';
      if (state.provider === 'offline') {
        showToast('Start serve-local.ps1 or connect Cloud Database to lock or unlock accounts.', 'warn');
        return;
      }
      try {
        if (state.provider === 'local') {
          await postLocalAdmin('toggle-suspend', { adminToken: state.token, usernameKey: uk, suspended: !isLocked });
        } else {
          await callSupabaseRpc('admin_toggle_suspend_user', { p_admin_token: state.token, p_username_key: uk, p_suspended: !isLocked });
        }
        showToast(!isLocked ? `Locked account @${uk}.` : `Unlocked account @${uk}.`, 'ok');
        await refreshTelemetry();
      } catch (err) {
        showToast(err.message, 'err');
      }
      return;
    }

    if (act === 'user-more') {
      const uk = target.dataset.key;
      const user = state.users.find((u) => u.username_key === uk);
      if (!user) return;
      openModal(
        `More Account Actions · ${user.display_name}`,
        `<p style="margin:0;color:var(--adm-muted)">Choose an administrative action for <strong>${esc(user.display_name)}</strong> (@${esc(uk)}).</p>
         <div style="display:grid;gap:10px">
           <button class="adm-btn adm-btn-secondary" type="button" data-adm-act="revoke-user" data-key="${esc(uk)}">Force Log Out (End Active Sessions)</button>
           <button class="adm-btn adm-btn-secondary" type="button" data-adm-act="reset-progress" data-key="${esc(uk)}">Reset Game Progress (Keep Login)</button>
           <button class="adm-btn adm-btn-danger" type="button" data-adm-act="delete-user" data-key="${esc(uk)}">Delete Account Permanently</button>
         </div>`,
        `<button class="adm-btn adm-btn-ghost" type="button" data-adm-close-modal>Cancel</button>`
      );
      return;
    }

    if (act === 'revoke-user' || act === 'revoke-all') {
      if (state.provider === 'offline') {
        showToast('Requires Local Server or Cloud Database connection.', 'warn');
        return;
      }
      const isAll = act === 'revoke-all';
      const uk = target.dataset.key || '';
      try {
        let res;
        if (state.provider === 'local') {
          res = await postLocalAdmin('revoke-sessions', { adminToken: state.token, usernameKey: uk, all: isAll });
        } else {
          res = await callSupabaseRpc('admin_revoke_user_sessions', { p_admin_token: state.token, p_username_key: uk || null, p_all: isAll });
        }
        closeModal();
        showToast(`Signed out ${res.revokedSessions ?? 0} active login(s).`, 'ok');
        await refreshTelemetry();
      } catch (err) {
        showToast(err.message, 'err');
      }
      return;
    }

    if (act === 'reset-progress') {
      const uk = target.dataset.key;
      if (state.provider === 'offline') {
        showToast('Requires Local Server or Cloud Database connection.', 'warn');
        return;
      }
      openModal(
        `Reset Game Progress · @${uk}`,
        `<p style="margin:0;color:#fde68a">This clears scores, topic progress, skill points, and leaderboard records for <strong>@${esc(uk)}</strong>, while keeping their username and password intact.</p>`,
        `<button class="adm-btn adm-btn-ghost" type="button" data-adm-close-modal>Cancel</button>
         <button class="adm-btn adm-btn-danger" type="button" id="admConfirmResetProgress" data-key="${esc(uk)}">Confirm Reset Progress</button>`
      );
      return;
    }

    if (act === 'delete-user') {
      const uk = target.dataset.key;
      if (state.provider === 'offline') {
        showToast('Requires Local Server or Cloud Database connection.', 'warn');
        return;
      }
      openModal(
        `Delete Account · @${uk}`,
        `<p style="margin:0;color:#fecaca">This permanently deletes <strong>@${esc(uk)}</strong>, their password, active logins, and saved progress. This cannot be undone.</p>`,
        `<button class="adm-btn adm-btn-ghost" type="button" data-adm-close-modal>Cancel</button>
         <button class="adm-btn adm-btn-danger" type="button" id="admConfirmDeleteUser" data-key="${esc(uk)}">Delete Permanently</button>`
      );
      return;
    }

    if (act === 'close-room') {
      const code = target.dataset.code;
      if (state.provider !== 'local') {
        showToast('Closing live rooms is available when connected to serve-local.ps1.', 'warn');
        return;
      }
      try {
        await postLocalAdmin('close-room', { adminToken: state.token, roomCode: code });
        showToast(`Closed 1v1 room ${code}.`, 'ok');
        await refreshTelemetry();
      } catch (err) {
        showToast(err.message, 'err');
      }
      return;
    }

    if (act === 'purge-lb') {
      const table = target.dataset.table;
      const id = target.dataset.id;
      const name = target.dataset.name;
      try {
        if (state.provider === 'local' && table === 'pvp') {
          await postLocalAdmin('delete-pvp-entry', { adminToken: state.token, playerName: name });
        } else if (state.provider === 'supabase' && id) {
          await callSupabaseRpc('admin_delete_leaderboard_entry', { p_admin_token: state.token, p_table: table, p_entry_id: Number(id) });
        } else {
          showToast('Removing scores from this leaderboard requires Cloud Database (or Local Server for local 1v1).', 'warn');
          return;
        }
        showToast(`Removed ${name} from the leaderboard.`, 'ok');
        await refreshTelemetry();
      } catch (err) {
        showToast(err.message, 'err');
      }
      return;
    }

    if (act === 'edit-question' || act === 'add-question') {
      const isNew = act === 'add-question';
      const q = isNew
        ? {
            _id: 'NEW',
            category: 'Programming',
            topic: 'Programming',
            difficulty: 'easy',
            year: 1,
            q: '',
            choices: ['', '', '', ''],
            answer: 0,
            explain: '',
          }
        : state.questionBank.find((item) => item._id === target.dataset.qid);
      if (!q) return;

      const subjects = ['Computer Systems', 'Networking & Security', 'Programming', 'Database'];
      openModal(
        isNew ? 'Add New Question' : `Edit Question · ${q._id}`,
        `<div class="adm-choice-grid">
           <label class="adm-field"><span>Subject</span>
             <select id="admQEditCategory">
               ${subjects.map((sub) => `<option value="${esc(sub)}" ${q.category === sub ? 'selected' : ''}>${esc(sub)}</option>`).join('')}
             </select>
           </label>
           <label class="adm-field"><span>Topic</span><input id="admQEditTopic" type="text" value="${esc(q.topic)}" /></label>
           <label class="adm-field"><span>Difficulty</span>
             <select id="admQEditDiff">
               ${['easy', 'medium', 'hard'].map((d) => `<option value="${d}" ${q.difficulty === d ? 'selected' : ''}>${d.toUpperCase()}</option>`).join('')}
             </select>
           </label>
           <label class="adm-field"><span>Year Level (1st–4th)</span>
             <select id="admQEditYear">
               ${[1, 2, 3, 4].map((yr) => `<option value="${yr}" ${q.year === yr ? 'selected' : ''}>${esc(YEAR_NAMES[yr])}</option>`).join('')}
             </select>
           </label>
         </div>
         <label class="adm-field"><span>Question Text</span><textarea id="admQEditPrompt" rows="2">${esc(q.q)}</textarea></label>
         <div class="adm-choice-grid">
           <label class="adm-field"><span>Choice A</span><input id="admQEditC0" type="text" value="${esc(q.choices[0] || '')}" /></label>
           <label class="adm-field"><span>Choice B</span><input id="admQEditC1" type="text" value="${esc(q.choices[1] || '')}" /></label>
           <label class="adm-field"><span>Choice C</span><input id="admQEditC2" type="text" value="${esc(q.choices[2] || '')}" /></label>
           <label class="adm-field"><span>Choice D</span><input id="admQEditC3" type="text" value="${esc(q.choices[3] || '')}" /></label>
         </div>
         <label class="adm-field"><span>Correct Answer</span>
           <select id="admQEditAnswer">
             ${['Choice A', 'Choice B', 'Choice C', 'Choice D'].map((lbl, idx) => `<option value="${idx}" ${q.answer === idx ? 'selected' : ''}>${lbl}</option>`).join('')}
           </select>
         </label>
         <label class="adm-field"><span>Explanation (shown after answering)</span><textarea id="admQEditExplain" rows="2">${esc(q.explain)}</textarea></label>`,
        `<button class="adm-btn adm-btn-ghost" type="button" data-adm-close-modal>Cancel</button>
         <button class="adm-btn adm-btn-primary" type="button" id="admSaveQEdit" data-qid="${esc(q._id)}">${isNew ? 'Add Question' : 'Save Changes'}</button>`
      );
      return;
    }

    if (act === 'export-questions') {
      exportQuestionsJson();
      return;
    }

    if (act === 'export-accounts-csv') {
      exportAccountsCsv();
      return;
    }

    if (act === 'export-diagnostics') {
      const payload = {
        exportedAt: new Date().toISOString(),
        source: state.provider,
        users: state.users,
        resetRequests: state.resetRequests,
        questionsCount: state.questionBank.length,
        auditLogs: state.auditLogs,
      };
      downloadFile(`bytebound-backup-${Date.now()}.json`, 'application/json', JSON.stringify(payload, null, 2));
      pushLocalAudit('EXPORT_BACKUP', 'backup.json', `Downloaded full JSON backup (${state.users.length} accounts)`);
      showToast('Downloaded full JSON backup.', 'ok');
    }
  }

  // ===== Auth & Lifecycle =====
  function enterConsole(session) {
    state.token = session.token;
    state.provider = session.provider;
    state.admin = session.admin;
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {}
    $('adminAuthScreen').hidden = true;
    $('adminShell').hidden = false;
    refreshTelemetry().catch((err) => {
      showToast(err.message || 'Could not load admin data.', 'err');
    });
  }

  async function signOutAdmin() {
    if (state.provider === 'local' && state.token) {
      postLocalAdmin('logout', { adminToken: state.token }).catch(() => {});
    }
    state.token = '';
    state.provider = '';
    state.admin = null;
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
    $('adminShell').hidden = true;
    $('adminAuthScreen').hidden = false;
    $('adminPasswordInput').value = '';
    $('adminAuthError').textContent = '';
  }

  function bindEvents() {
    const defaultHintEl = $('adminDefaultCredHint');
    if (defaultHintEl && !isLocalRuntimeHost()) {
      defaultHintEl.hidden = true;
    }
    $('adminLoginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('adminLoginSubmit');
      const errEl = $('adminAuthError');
      const u = $('adminUsernameInput').value.trim();
      const p = $('adminPasswordInput').value;
      const mode = $('adminProviderMode')?.value || 'auto';
      errEl.textContent = '';
      btn.disabled = true;
      btn.textContent = 'Logging in…';
      try {
        const session = await authenticateAdmin(u, p, mode);
        enterConsole(session);
      } catch (err) {
        errEl.textContent = err.message || 'Login failed.';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Log In to Admin Panel';
      }
    });

    $('adminLogoutBtn').addEventListener('click', signOutAdmin);
    $('adminRefreshBtn').addEventListener('click', () => refreshTelemetry({ manual: true }));
    $('adminMobileMenuBtn').addEventListener('click', () => {
      $('adminSidebar').classList.toggle('is-open');
    });
    $('adminModalClose').addEventListener('click', closeModal);
    $('adminModalBackdrop').addEventListener('click', (e) => {
      if (e.target === $('adminModalBackdrop') || e.target.closest('[data-adm-close-modal]')) {
        closeModal();
      }
    });

    document.addEventListener('click', async (e) => {
      const tabBtn = e.target.closest('[data-adm-tab]');
      if (tabBtn) {
        state.tab = tabBtn.dataset.admTab;
        $('adminSidebar').classList.remove('is-open');
        updateShellChrome();
        renderActiveTab();
        return;
      }

      const lbTab = e.target.closest('[data-adm-lbtab]');
      if (lbTab) {
        state.lbTab = lbTab.dataset.admLbtab;
        renderActiveTab();
        return;
      }

      const qPageBtn = e.target.closest('[data-adm-qpage]');
      if (qPageBtn) {
        const nextPage = Number(qPageBtn.dataset.admQpage) || 1;
        state.qPage = Math.max(1, nextPage);
        renderActiveTab();
        return;
      }

      const actBtn = e.target.closest('[data-adm-act]');
      if (actBtn) {
        await handleAction(actBtn.dataset.admAct, actBtn);
        return;
      }

      if (e.target.id === 'admTemplateSecurityNoticeBtn') {
        if ($('admSecuritySeverity')) $('admSecuritySeverity').value = 'critical';
        if ($('admSecurityTitle')) $('admSecurityTitle').value = 'Security Advisory: Update Your Password';
        if ($('admSecurityMessage')) $('admSecurityMessage').value = 'We detected unusual login activity. Please open Settings and change your password now, do not reuse personal passwords, and log out on shared lab PCs.';
        return;
      }

      if (e.target.id === 'admPublishSecurityNoticeBtn' || e.target.id === 'admClearSecurityNoticeBtn') {
        const isClear = e.target.id === 'admClearSecurityNoticeBtn';
        const severity = $('admSecuritySeverity')?.value || 'info';
        const title = isClear ? '' : ($('admSecurityTitle')?.value.trim() || '');
        const message = isClear ? '' : ($('admSecurityMessage')?.value.trim() || '');
        if (!isClear && !title && !message) {
          showToast('Enter a banner title or message before publishing.', 'err');
          return;
        }
        try {
          let nextNotice = { active: !isClear, severity, title, message, updated_at: new Date().toISOString() };
          if (state.provider === 'local') {
            const res = await postLocalAdmin('set-security-notice', { adminToken: state.token, active: !isClear, severity, title, message });
            if (res?.notice) nextNotice = res.notice;
          } else if (state.provider === 'supabase') {
            const res = await callSupabaseRpc('admin_set_security_notice', { p_admin_token: state.token, p_active: !isClear, p_severity: severity, p_title: title, p_message: message });
            if (res?.notice) nextNotice = res.notice;
          } else {
            try { localStorage.setItem('bytebound-security-notice-v1', JSON.stringify(nextNotice)); } catch {}
            pushLocalAudit('SECURITY_NOTICE_UPDATED', 'System Banner', isClear ? 'Cleared security notice' : `Published ${severity}: ${title}`);
          }
          state.securityNotice = nextNotice;
          showToast(isClear ? 'Cleared active security banner.' : 'Published security banner to all players.', 'ok');
          await refreshTelemetry();
        } catch (err) {
          showToast(err.message, 'err');
        }
        return;
      }

      if (e.target.id === 'admCopyTempPw') {
        const pwText = e.target.dataset.pw || '';
        try { await navigator.clipboard?.writeText(pwText); } catch {}
        e.target.textContent = 'Copied!';
        return;
      }

      if (e.target.id === 'admConfirmCreateUser') {
        const username = $('admCreateUsername')?.value.trim() || '';
        const password = $('admCreatePassword')?.value || '';
        const academicYear = Number($('admCreateYear')?.value) || 4;
        if (!username || password.length < 6) {
          showToast('Enter a username and a password with at least 6 characters.', 'err');
          return;
        }
        try {
          if (state.provider === 'local') {
            await postLocalAdmin('create-user', { adminToken: state.token, username, password, academicYear });
          } else {
            await callSupabaseRpc('admin_create_user', { p_admin_token: state.token, p_username: username, p_password: password, p_year: academicYear });
          }
          closeModal();
          showToast(`Created account for ${username} (${YEAR_NAMES[academicYear]}).`, 'ok');
          await refreshTelemetry();
        } catch (err) {
          showToast(err.message, 'err');
        }
        return;
      }

      if (e.target.id === 'admSaveDetailYearBtn') {
        const uk = e.target.dataset.key;
        const yr = Number($('admDetailYearSelect')?.value) || 4;
        if (state.provider === 'offline') {
          showToast('Start serve-local.ps1 or connect Cloud Database to change year level.', 'warn');
          return;
        }
        try {
          if (state.provider === 'local') {
            await postLocalAdmin('set-user-year', { adminToken: state.token, usernameKey: uk, academicYear: yr });
          } else {
            await callSupabaseRpc('admin_set_user_year', { p_admin_token: state.token, p_username_key: uk, p_year: yr });
          }
          showToast(`Updated @${uk} to ${YEAR_NAMES[yr]}.`, 'ok');
          closeModal();
          await refreshTelemetry();
        } catch (err) {
          showToast(err.message, 'err');
        }
        return;
      }

      if (e.target.id === 'admConfirmResetPw') {
        const uk = e.target.dataset.key;
        const customPw = $('admNewPwInput')?.value.trim() || '';
        try {
          let res;
          if (state.provider === 'local') {
            res = await postLocalAdmin('reset-password', { adminToken: state.token, usernameKey: uk, newPassword: customPw });
          } else {
            res = await callSupabaseRpc('admin_reset_user_password', { p_admin_token: state.token, p_username_key: uk, p_new_password: customPw || null });
          }
          closeModal();
          removeLocalPendingItem('bytebound-pending-resets-v1', (r) => String(r.username_key || '').toLowerCase() === String(uk || '').toLowerCase());
          const newPass = res.temporaryPassword || customPw;
          openModal(
            'New Password Ready',
            `<p style="margin:0;color:var(--adm-muted)">Share this password with <strong>@${esc(uk)}</strong>. Old logins were signed out and any pending Forgot Password request was marked Resolved.</p>
             <div class="adm-copy-row">
               <code>${esc(newPass)}</code>
               <button class="adm-btn adm-btn-secondary adm-btn-sm" type="button" id="admCopyTempPw" data-pw="${esc(newPass)}">Copy</button>
             </div>`,
            `<button class="adm-btn adm-btn-primary" type="button" data-adm-close-modal>Done</button>`
          );
          await refreshTelemetry();
        } catch (err) {
          showToast(err.message, 'err');
        }
        return;
      }

      if (e.target.id === 'admConfirmResetProgress') {
        const uk = e.target.dataset.key;
        try {
          if (state.provider === 'local') {
            await postLocalAdmin('reset-progress', { adminToken: state.token, usernameKey: uk });
          } else {
            await callSupabaseRpc('admin_reset_user_progress', { p_admin_token: state.token, p_username_key: uk });
          }
          closeModal();
          showToast(`Reset saved progress for @${uk}. Login credentials kept intact.`, 'ok');
          await refreshTelemetry();
        } catch (err) {
          showToast(err.message, 'err');
        }
        return;
      }

      if (e.target.id === 'admConfirmDeleteUser') {
        const uk = e.target.dataset.key;
        try {
          if (state.provider === 'local') {
            await postLocalAdmin('delete-user', { adminToken: state.token, usernameKey: uk });
          } else {
            await callSupabaseRpc('admin_delete_user', { p_admin_token: state.token, p_username_key: uk });
          }
          closeModal();
          showToast(`Deleted account @${uk}.`, 'ok');
          await refreshTelemetry();
        } catch (err) {
          showToast(err.message, 'err');
        }
        return;
      }

      if (e.target.id === 'admSaveQEdit') {
        const qid = e.target.dataset.qid;
        const nextData = {
          category: $('admQEditCategory')?.value || 'Programming',
          topic: $('admQEditTopic')?.value.trim() || 'Programming',
          difficulty: $('admQEditDiff')?.value || 'easy',
          year: Number($('admQEditYear')?.value) || 1,
          q: $('admQEditPrompt')?.value.trim() || '',
          choices: [
            $('admQEditC0')?.value.trim() || '',
            $('admQEditC1')?.value.trim() || '',
            $('admQEditC2')?.value.trim() || '',
            $('admQEditC3')?.value.trim() || '',
          ],
          answer: Number($('admQEditAnswer')?.value) || 0,
          explain: $('admQEditExplain')?.value.trim() || '',
        };
        if (!nextData.q || nextData.choices.some((c) => !c)) {
          showToast('Question text and all 4 answer choices are required.', 'err');
          return;
        }
        if (qid === 'NEW') {
          const sameDiffCount = state.questionBank.filter((x) => x.difficulty === nextData.difficulty).length;
          state.questionBank.unshift({ _id: `${nextData.difficulty}:new-${sameDiffCount + 1}`, index: sameDiffCount, ...nextData });
          pushLocalAudit('ADD_QUESTION', nextData.topic, `Added Year ${nextData.year} ${nextData.difficulty} question`);
          showToast('Question added! Click "Download questions.json" when ready to save to disk.', 'ok');
        } else {
          const existing = state.questionBank.find((item) => item._id === qid);
          if (existing) {
            Object.assign(existing, nextData);
            pushLocalAudit('EDIT_QUESTION', qid, `Updated Year ${existing.year} (${existing.topic})`);
            showToast('Question updated! Click "Download questions.json" to export changes.', 'ok');
          }
        }
        revalidateLoadedQuestions();
        closeModal();
        updateShellChrome();
        renderActiveTab();
      }
    });

    document.addEventListener('input', (e) => {
      if (e.target.id === 'admUserSearch') {
        state.userSearch = e.target.value;
        renderActiveTab();
      } else if (e.target.id === 'admQSearch') {
        state.qSearch = e.target.value;
        state.qPage = 1;
        renderActiveTab();
      }
    });

    document.addEventListener('change', (e) => {
      if (e.target.id === 'admUserYearFilter') {
        state.userYearFilter = e.target.value;
        renderActiveTab();
      } else if (e.target.id === 'admUserStatusFilter') {
        state.userStatusFilter = e.target.value;
        renderActiveTab();
      } else if (e.target.id === 'admQCategory') {
        state.qCategory = e.target.value;
        state.qPage = 1;
        renderActiveTab();
      } else if (e.target.id === 'admQDifficulty') {
        state.qDifficulty = e.target.value;
        state.qPage = 1;
        renderActiveTab();
      } else if (e.target.id === 'admQYear') {
        state.qYear = e.target.value;
        state.qPage = 1;
        renderActiveTab();
      } else if (e.target.id === 'admQPageSize') {
        state.qPageSize = Number(e.target.value) || 25;
        state.qPage = 1;
        renderActiveTab();
      }
    });
  }

  function boot() {
    bindEvents();
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      if (saved && saved.token && saved.provider && saved.admin) {
        enterConsole(saved);
      }
    } catch {}
  }

  boot();
})(window);
