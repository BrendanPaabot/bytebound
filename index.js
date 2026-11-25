const canvas = document.querySelector('canvas')
const c = canvas.getContext('2d')
const heroHitCanvas = document.createElement('canvas')
const heroHitContext = heroHitCanvas.getContext('2d')
canvas.width = 64 * 16 // 1024
canvas.height = 64 * 9 // 576
c.imageSmoothingEnabled = false
const THEME_STORAGE_KEY = 'kings-pigs-theme'
const REDUCE_MOTION_STORAGE_KEY = 'kings-pigs-reduce-motion'
const PROFILE_STORAGE_KEY = 'kings-pigs-profiles-v1'
const ACHIEVEMENT_STORAGE_KEY = 'kings-pigs-achievements-v1'
const AUTH_SESSION_STORAGE_KEY = 'bytebound-auth-session-v1'
const storedTheme = localStorage.getItem(THEME_STORAGE_KEY)
const storedReduceMotion = localStorage.getItem(REDUCE_MOTION_STORAGE_KEY)
let currentTheme = storedTheme === 'dark' ? 'dark' : 'light'
let reduceMotion = storedReduceMotion === 'true'
let activePlayerName = ''
let activeSessionToken = ''
let activeAuthProvider = ''
window.activePlayerName = activePlayerName
let activeAchievementStorageKey = ACHIEVEMENT_STORAGE_KEY
let achievementProgress = {
  kills: 0,
  bestStreak: 0,
  upgrades: 0,
  bosses: 0,
  pvpMatches: 0,
  pvpWins: 0,
  pvpDamage: 0,
  pvpCorrect: 0,
  pvpBestRating: 1000,
  drillAnswers: 0,
  drillCompletions: 0,
  leaderboardSubmissions: 0,
}
let unlockedAchievements = {}
let achievementToastQueue = []
let achievementToastTimer = 0
let achievementToastActive = false
const SUPERSEDED_RUNS_STORAGE_KEY = 'kings-pigs-superseded-runs-v1'
let leaderboardEntries = []
let leaderboardState = 'idle'
let leaderboardError = ''
let leaderboardRequestId = 0
let leaderboardTab = 'arcade'
let pvpLeaderboardEntries = []
let pvpLeaderboardState = 'idle'
let pvpLeaderboardError = ''
let pvpLeaderboardRequestId = 0
let pvpLeaderboardTableAvailable = true
const PVP_LEADERBOARD_STORAGE_KEY = 'bytebound-pvp-leaderboard-v1'
const PVP_SUBMITTED_IDS_KEY = 'bytebound-pvp-submitted-v1'
let leaderboardRunId = createLeaderboardRunId()
let leaderboardRunSubmitted = false
let leaderboardLastSubmittedSnapshot = ''
let leaderboardSubmitPromise = null
let leaderboardSubmitQueued = false
let leaderboardSyncTimer = 0
let supersededRunIds = loadSupersededRunIds()
let userSyncState = 'idle'
let userSyncError = ''
let userSyncTimer = 0
let practiceReturnState = null

function loadSupersededRunIds() {
  try {
    const saved = JSON.parse(localStorage.getItem(SUPERSEDED_RUNS_STORAGE_KEY) || '[]')
    return new Set(Array.isArray(saved) ? saved.filter((id) => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

function markRunIdSuperseded(runId) {
  if (!runId) return
  supersededRunIds.add(runId)
  try {
    localStorage.setItem(SUPERSEDED_RUNS_STORAGE_KEY, JSON.stringify([...supersededRunIds].slice(-200)))
  } catch (error) {
    console.warn('Unable to save superseded run IDs.', error)
  }
}
document.documentElement.dataset.theme = currentTheme
document.body.classList.toggle('reduce-motion', reduceMotion)

let themeTransitionTimer = null
function setTheme(theme) {
  const applyTheme = () => {
    currentTheme = theme === 'dark' ? 'dark' : 'light'
    document.documentElement.dataset.theme = currentTheme
    localStorage.setItem(THEME_STORAGE_KEY, currentTheme)
    document.querySelectorAll('[data-theme-toggle]').forEach((toggle) => {
      toggle.checked = currentTheme === 'dark'
    })
  }
  const prefersReduced = reduceMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (prefersReduced) {
    applyTheme()
    return
  }
  document.documentElement.classList.add('is-theme-transitioning')
  clearTimeout(themeTransitionTimer)
  themeTransitionTimer = setTimeout(() => {
    document.documentElement.classList.remove('is-theme-transitioning')
  }, 480)
  if (typeof document.startViewTransition === 'function') {
    document.startViewTransition(applyTheme)
  } else {
    applyTheme()
  }
}

document.querySelectorAll('[data-theme-toggle]').forEach((toggle) => {
  toggle.checked = currentTheme === 'dark'
})

function createLeaderboardRunId() {
  if (crypto.randomUUID) return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function supabaseCredentials() {
  const config = window.SUPABASE_CONFIG
  if (typeof config?.url !== 'string' || typeof config?.anonKey !== 'string') return null
  const url = config.url.trim().replace(/\/+$/, '')
  const anonKey = config.anonKey.trim()
  if (!/^https:\/\/[^/]+$/i.test(url) || !anonKey) return null
  return { url, anonKey }
}

async function supabaseRequest(path, options = {}) {
  const credentials = supabaseCredentials()
  if (!credentials) throw new Error('Supabase is not configured. Add the project URL and publishable/anon key to supabase-config.js.')
  const response = await fetch(`${credentials.url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: credentials.anonKey,
      ...(credentials.anonKey.split('.').length === 3
        ? { Authorization: `Bearer ${credentials.anonKey}` }
        : {}),
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Supabase request failed (${response.status}): ${body || response.statusText}`)
  }
  return response
}

function getRecordableGameplayStats() {
  if (practiceRunActive || !activePlayerName) return null
  if (typeof multiplayerMatchActive !== 'undefined' && multiplayerMatchActive) return null
  const runKills = Math.max(0, stats.kills || 0)
  const runCorrect = Math.max(0, stats.correct || 0)
  const runTotal = Math.max(0, stats.total || 0)
  if (runKills > 0) {
    const kills = Math.min(200, runKills)
    const correctAnswers = runCorrect
    const totalAnswers = Math.max(runTotal, kills, correctAnswers)
    const accuracy = totalAnswers ? Math.floor((100 * correctAnswers) / totalAnswers) : 0
    const score = kills * 100 + correctAnswers * 10 + accuracy
    return { kills, correctAnswers, totalAnswers, accuracy, score }
  }
  const metrics = getAchievementMetrics()
  const profileKills = Math.max(0, metrics.kills || 0)
  const profileCorrect = Math.max(0, metrics.correct || 0)
  const profileTotal = Math.max(0, metrics.attempts || 0)
  if (profileKills > 0) {
    const kills = Math.min(200, profileKills)
    const correctAnswers = profileCorrect
    const totalAnswers = Math.max(profileTotal, kills, correctAnswers)
    const accuracy = totalAnswers ? Math.floor((100 * correctAnswers) / totalAnswers) : 0
    const score = kills * 100 + correctAnswers * 10 + accuracy
    return { kills, correctAnswers, totalAnswers, accuracy, score }
  }
  return null
}

function hasRecordableGameplayRun() {
  return Boolean(getRecordableGameplayStats())
}

function scheduleLeaderboardRunSync(delayMs = 500) {
  if (practiceRunActive || !activePlayerName || !supabaseCredentials()) return
  window.clearTimeout(leaderboardSyncTimer)
  leaderboardSyncTimer = window.setTimeout(() => {
    leaderboardSyncTimer = 0
    submitLeaderboardRun()
  }, delayMs)
}

async function loadLeaderboard(options = {}) {
  const requestId = ++leaderboardRequestId
  if (!supabaseCredentials()) {
    leaderboardState = 'unconfigured'
    leaderboardError = ''
    renderDashboard()
    return
  }
  leaderboardState = 'loading'
  leaderboardError = ''
  renderDashboard()
  try {
    if (!options.skipSubmit && hasRecordableGameplayRun()) {
      await submitLeaderboardRun({ skipReload: true })
    } else if (leaderboardSubmitPromise) {
      await leaderboardSubmitPromise
    }
    const query = new URLSearchParams({
      select: 'id,run_id,player_name,kills,correct_answers,total_answers,accuracy,score,submitted_at',
      order: 'score.desc,correct_answers.desc,kills.desc,submitted_at.asc',
      limit: '60',
    })
    const response = await supabaseRequest(`leaderboard_entries?${query}`)
    const rawEntries = await response.json()
    if (!Array.isArray(rawEntries)) throw new Error('Supabase returned an invalid leaderboard response.')
    if (requestId !== leaderboardRequestId) return

    // Exclude 1v1-only or 0-kill records that have no Arcade virus progress, stale pre-reset rows, and deduplicate by player_name
    const bestEntryByPlayer = new Map()
    for (const entry of rawEntries) {
      if ((entry?.kills || 0) <= 0) continue
      if (entry?.run_id && supersededRunIds.has(entry.run_id)) continue
      const key = String(entry.player_name || '').trim().toLowerCase()
      if (!key) continue
      try {
        const resetAt = Number(localStorage.getItem(`bytebound-reset-at-v1:${encodeURIComponent(key)}`) || 0)
        if (resetAt && Date.parse(entry.submitted_at || 0) <= resetAt) continue
      } catch {}
      const existing = bestEntryByPlayer.get(key)
      if (
        !existing ||
        (entry.score || 0) > (existing.score || 0) ||
        ((entry.score || 0) === (existing.score || 0) && (entry.correct_answers || 0) > (existing.correct_answers || 0)) ||
        ((entry.score || 0) === (existing.score || 0) && (entry.kills || 0) > (existing.kills || 0))
      ) {
        bestEntryByPlayer.set(key, entry)
      }
    }

    const localRecord = getRecordableGameplayStats()
    if (localRecord && activePlayerName) {
      const activeKey = activePlayerName.trim().toLowerCase()
      const existing = bestEntryByPlayer.get(activeKey)
      if (!existing || localRecord.score > (existing.score || 0)) {
        bestEntryByPlayer.set(activeKey, {
          id: existing?.id || 0,
          run_id: leaderboardRunId,
          player_name: activePlayerName,
          kills: localRecord.kills,
          correct_answers: localRecord.correctAnswers,
          total_answers: localRecord.totalAnswers,
          accuracy: localRecord.accuracy,
          score: localRecord.score,
          submitted_at: new Date().toISOString(),
        })
      }
    }

    const filteredEntries = [...bestEntryByPlayer.values()]
      .sort((a, b) =>
        (b.score || 0) - (a.score || 0) ||
        (b.correct_answers || 0) - (a.correct_answers || 0) ||
        (b.kills || 0) - (a.kills || 0)
      )
      .slice(0, 20)

    leaderboardEntries = filteredEntries
    if (leaderboardState !== 'submit-error') {
      leaderboardState = 'ready'
    }
    renderDashboard()
  } catch (error) {
    if (requestId !== leaderboardRequestId) return
    console.error('Unable to load leaderboard.', error)
    leaderboardState = 'error'
    leaderboardError = error.message
    renderDashboard()
  }
}

function readLocalPvpLeaderboardMap() {
  try {
    const raw = localStorage.getItem(PVP_LEADERBOARD_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveLocalPvpResult(matchData) {
  const playerName = String(matchData?.playerName || '').trim()
  const matchId = String(matchData?.matchId || '').trim()
  const outcome = String(matchData?.outcome || '').toLowerCase()
  if (!playerName || !matchId || !['won', 'lost', 'draw'].includes(outcome)) return null
  const key = playerName.toLowerCase()
  const dedupeKey = `${matchId}:${key}`
  try {
    const seenRaw = localStorage.getItem(PVP_SUBMITTED_IDS_KEY)
    const seen = seenRaw ? JSON.parse(seenRaw) : []
    const seenSet = new Set(Array.isArray(seen) ? seen : [])
    if (seenSet.has(dedupeKey)) {
      const map = readLocalPvpLeaderboardMap()
      return map[key] || null
    }
    seenSet.add(dedupeKey)
    localStorage.setItem(PVP_SUBMITTED_IDS_KEY, JSON.stringify([...seenSet].slice(-120)))
  } catch {}

  const map = readLocalPvpLeaderboardMap()
  const prev = map[key] || {
    player_name: playerName,
    rating: 1000,
    wins: 0,
    losses: 0,
    draws: 0,
    matches_played: 0,
    damage_dealt: 0,
    correct_answers: 0,
    total_answers: 0,
    accuracy: 0,
    win_rate: 0,
  }
  const delta = outcome === 'won' ? 25 : outcome === 'draw' ? 5 : -15
  const wins = prev.wins + (outcome === 'won' ? 1 : 0)
  const losses = prev.losses + (outcome === 'lost' ? 1 : 0)
  const draws = prev.draws + (outcome === 'draw' ? 1 : 0)
  const matches_played = wins + losses + draws
  const correct_answers = prev.correct_answers + Math.max(0, Number(matchData.correctAnswers) || 0)
  const total_answers = prev.total_answers + Math.max(0, Number(matchData.totalAnswers) || 0)
  const entry = {
    player_name: playerName,
    rating: Math.max(100, (prev.rating || 1000) + delta),
    wins,
    losses,
    draws,
    matches_played,
    damage_dealt: (prev.damage_dealt || 0) + Math.max(0, Number(matchData.damageDealt) || 0),
    correct_answers,
    total_answers,
    accuracy: total_answers ? Math.floor((100 * correct_answers) / total_answers) : 0,
    win_rate: matches_played ? Math.floor((100 * wins) / matches_played) : 0,
    updated_at: new Date().toISOString(),
  }
  map[key] = entry
  try {
    localStorage.setItem(PVP_LEADERBOARD_STORAGE_KEY, JSON.stringify(map))
  } catch {}
  if (typeof recordAchievementProgress === 'function' && activePlayerName && key === activePlayerName.trim().toLowerCase()) {
    const dmg = Math.max(0, Number(matchData.damageDealt) || 0)
    const corr = Math.max(0, Number(matchData.correctAnswers) || 0)
    if (dmg > 0) recordAchievementProgress('pvpDamage', dmg)
    if (corr > 0) recordAchievementProgress('pvpCorrect', corr)
    recordAchievementProgress('pvpBestRating', entry.rating)
  }
  return entry
}

async function submitPvpLeaderboardMatch(matchData) {
  if (!matchData || !matchData.matchId || !matchData.playerName) return
  try {
    const key = String(matchData.playerName).trim().toLowerCase()
    if (key) localStorage.removeItem(`bytebound-reset-at-v1:${encodeURIComponent(key)}`)
  } catch {}
  saveLocalPvpResult(matchData)
  if (window.mpUI?.network?.localServerAvailable) {
    try {
      await fetch('/api/mp/pvp-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(matchData),
      })
    } catch {}
  }
  if (supabaseCredentials() && pvpLeaderboardTableAvailable && activeAuthProvider === 'supabase' && activeSessionToken) {
    try {
      await supabaseRequest('rpc/submit_pvp_match_result', {
        method: 'POST',
        body: JSON.stringify({
          p_match_id: String(matchData.matchId),
          p_player_name: String(matchData.playerName).trim().slice(0, 24),
          p_outcome: String(matchData.outcome || 'lost'),
          p_correct_answers: Math.max(0, Number(matchData.correctAnswers) || 0),
          p_total_answers: Math.max(0, Number(matchData.totalAnswers) || 0),
          p_damage_dealt: Math.max(0, Number(matchData.damageDealt) || 0),
          p_session_token: activeSessionToken,
        }),
      })
    } catch (error) {
      const msg = String(error?.message || '')
      if (msg.includes('PGRST205') || msg.includes('404') || msg.includes('submit_pvp_match_result')) {
        pvpLeaderboardTableAvailable = false
      }
    }
  }
  if (dashboardView === 'leaderboards' && leaderboardTab === 'pvp' && !playViewActive) {
    loadPvpLeaderboard()
  }
}

async function loadPvpLeaderboard() {
  const requestId = ++pvpLeaderboardRequestId
  pvpLeaderboardState = 'loading'
  pvpLeaderboardError = ''
  renderDashboard()
  try {
    const merged = new Map()
    const mergeRow = (entry) => {
      const key = String(entry?.player_name || '').trim().toLowerCase()
      if (!key) return
      try {
        const resetAt = Number(localStorage.getItem(`bytebound-reset-at-v1:${encodeURIComponent(key)}`) || 0)
        if (resetAt && Date.parse(entry.updated_at || 0) <= resetAt) return
      } catch {}
      const existing = merged.get(key)
      if (!existing || (entry.matches_played || 0) > (existing.matches_played || 0) ||
          ((entry.matches_played || 0) === (existing.matches_played || 0) && (entry.rating || 0) >= (existing.rating || 0))) {
        merged.set(key, entry)
      }
    }

    for (const localEntry of Object.values(readLocalPvpLeaderboardMap())) {
      mergeRow(localEntry)
    }

    if (window.mpUI?.network?.localServerAvailable) {
      try {
        const res = await fetch('/api/mp/pvp-leaderboard')
        if (res.ok) {
          const json = await res.json()
          if (Array.isArray(json?.entries)) {
            for (const e of json.entries) mergeRow(e)
          }
        }
      } catch {}
    }

    if (supabaseCredentials() && pvpLeaderboardTableAvailable) {
      try {
        const query = new URLSearchParams({
          select: 'player_name,rating,wins,losses,draws,matches_played,damage_dealt,correct_answers,total_answers,accuracy,win_rate,updated_at',
          order: 'rating.desc,wins.desc,win_rate.desc,accuracy.desc',
          limit: '40',
        })
        const sbEntries = await Promise.race([
          supabaseRequest(`pvp_leaderboard_entries?${query}`).then((r) => r.json()).catch(() => null),
          new Promise((resolve) => window.setTimeout(() => resolve(null), 2500)),
        ])
        if (Array.isArray(sbEntries)) {
          for (const e of sbEntries) mergeRow(e)
        }
      } catch (error) {
        const msg = String(error?.message || '')
        if (msg.includes('PGRST205') || msg.includes('404') || msg.includes('pvp_leaderboard_entries')) {
          pvpLeaderboardTableAvailable = false
        }
      }
    }

    if (requestId !== pvpLeaderboardRequestId) return
    pvpLeaderboardEntries = [...merged.values()]
      .filter((e) => (e.matches_played || 0) > 0)
      .sort((a, b) =>
        (b.rating || 0) - (a.rating || 0) ||
        (b.wins || 0) - (a.wins || 0) ||
        (b.win_rate || 0) - (a.win_rate || 0) ||
        (b.accuracy || 0) - (a.accuracy || 0)
      )
      .slice(0, 20)
    pvpLeaderboardState = 'ready'
    renderDashboard()
  } catch (error) {
    if (requestId !== pvpLeaderboardRequestId) return
    console.error('Unable to load 1v1 leaderboard.', error)
    pvpLeaderboardState = 'error'
    pvpLeaderboardError = error.message
    renderDashboard()
  }
}

async function performLeaderboardRunSubmit(options = {}) {
  const record = getRecordableGameplayStats()
  if (!record) return false
  const { kills, correctAnswers, totalAnswers } = record

  const snapshot = `${leaderboardRunId}:${activePlayerName}:${kills}:${correctAnswers}:${totalAnswers}`
  if (!options.force && snapshot === leaderboardLastSubmittedSnapshot) {
    return true
  }

  const wasSubmittedBefore = leaderboardRunSubmitted
  const submittedRunId = leaderboardRunId

  const postRun = async (runId) => {
    const payload = {
      p_run_id: runId,
      p_player_name: activePlayerName,
      p_kills: kills,
      p_correct_answers: correctAnswers,
      p_total_answers: totalAnswers,
    }
    if (activeAuthProvider === 'supabase' && activeSessionToken) {
      payload.p_session_token = activeSessionToken
    }
    const response = await supabaseRequest('rpc/submit_leaderboard_run', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    await response.text()
  }

  await postRun(submittedRunId)
  try {
    const key = String(activePlayerName || '').trim().toLowerCase()
    if (key) localStorage.removeItem(`bytebound-reset-at-v1:${encodeURIComponent(key)}`)
  } catch {}

  // Verify whether the database updated the row in-place.
  // If the Supabase project still has the old ON CONFLICT (run_id) DO NOTHING function,
  // an existing row for submittedRunId will still have older/lower numbers; rotate run_id so the new stats are saved.
  if (wasSubmittedBefore) {
    try {
      const verifyQuery = new URLSearchParams({
        select: 'kills,correct_answers,total_answers',
        run_id: `eq.${submittedRunId}`,
        limit: '1',
      })
      const verifyRes = await supabaseRequest(`leaderboard_entries?${verifyQuery}`)
      const verifyRows = await verifyRes.json()
      const savedRow = Array.isArray(verifyRows) ? verifyRows[0] : null
      if (
        savedRow &&
        (savedRow.kills < kills || savedRow.correct_answers < correctAnswers || savedRow.total_answers < totalAnswers)
      ) {
        markRunIdSuperseded(submittedRunId)
        leaderboardRunId = createLeaderboardRunId()
        await postRun(leaderboardRunId)
      }
    } catch (verifyError) {
      console.warn('Could not verify leaderboard row update.', verifyError)
    }
  }

  leaderboardLastSubmittedSnapshot = `${leaderboardRunId}:${activePlayerName}:${kills}:${correctAnswers}:${totalAnswers}`
  leaderboardRunSubmitted = true
  leaderboardState = 'ready'
  leaderboardError = ''
  if (!wasSubmittedBefore && typeof recordAchievementProgress === 'function') {
    recordAchievementProgress('leaderboardSubmissions', 1)
  } else {
    refreshAchievements()
  }
  return true
}

async function submitLeaderboardRun(options = {}) {
  window.clearTimeout(leaderboardSyncTimer)
  leaderboardSyncTimer = 0
  if (practiceRunActive || !activePlayerName || !supabaseCredentials() || activeAuthProvider !== 'supabase' || !activeSessionToken) return false

  if (leaderboardSubmitPromise) {
    leaderboardSubmitQueued = true
    return leaderboardSubmitPromise
  }

  leaderboardSubmitPromise = (async () => {
    let succeeded = false
    try {
      do {
        leaderboardSubmitQueued = false
        succeeded = await performLeaderboardRunSubmit(options)
      } while (leaderboardSubmitQueued && !practiceRunActive && activePlayerName)
    } catch (error) {
      console.error('Unable to submit gameplay run to leaderboard.', error)
      leaderboardState = 'submit-error'
      leaderboardError = error.message
      succeeded = false
    } finally {
      leaderboardSubmitPromise = null
    }

    if (dashboardView === 'leaderboards' && !playViewActive && !options.skipReload) {
      if (succeeded) await loadLeaderboard({ skipSubmit: true })
      else renderDashboard()
    }
    return succeeded
  })()

  return leaderboardSubmitPromise
}

function buildUserProfilePayload() {
  return {
    topicProgress,
    skillProgress: {
      ...skillProgress,
      specialization: { activeTree: activeSkillSpecialization, exclusiveTree: exclusiveSkillTree },
    },
    reviewStore: {
      queue: reviewQueue,
      counter: answerCount,
    },
    achievements: {
      progress: achievementProgress,
      unlocked: unlockedAchievements,
    },
  }
}

function mergeAndApplyCloudUserProfile(profileId, cloudUser) {
  if (!cloudUser || typeof cloudUser !== 'object') return false
  let updatedLocal = false

  // 1. Merge topic tracker progress
  const cloudTopics = cloudUser.topic_progress
  if (cloudTopics && typeof cloudTopics === 'object') {
    for (const [category, topics] of Object.entries(topicProgress)) {
      for (const [topicName, localTopic] of Object.entries(topics)) {
        const source = cloudTopics?.[category]?.[topicName]
        if (!source || typeof source !== 'object') continue
        const cloudAttempted = Number.isSafeInteger(source.attempted) && source.attempted >= 0 ? source.attempted : 0
        const cloudCorrect = Number.isSafeInteger(source.correct) && source.correct >= 0
          ? Math.min(source.correct, cloudAttempted)
          : 0
        if (cloudAttempted > localTopic.attempted || (cloudAttempted === localTopic.attempted && cloudCorrect > localTopic.correct)) {
          localTopic.attempted = cloudAttempted
          localTopic.correct = cloudCorrect
          if (Number.isSafeInteger(source.baselineAttempted) && source.baselineAttempted >= 0) {
            localTopic.baselineAttempted = Math.min(BASELINE_ATTEMPTS, source.baselineAttempted, cloudAttempted)
            localTopic.baselineCorrect = Number.isSafeInteger(source.baselineCorrect)
              ? Math.min(source.baselineCorrect, localTopic.baselineAttempted)
              : 0
          }
          if (Number.isSafeInteger(source.streak) && source.streak >= 0) {
            localTopic.streak = source.streak
          }
          updatedLocal = true
        }
      }
    }
  }

  // 2. Merge skill tree progress only when no local multi-run saves exist yet (prevents old cloud snapshots from overwriting/refunding a run's skill tree on refresh)
  const cloudSkills = cloudUser.skill_progress
  const hasLocalRunSaves = loadRunSaves(profileId).saves.length > 0
  if (cloudSkills && typeof cloudSkills === 'object' && !hasLocalRunSaves) {
    for (const key of SKILL_TREE_KEYS) {
      const source = cloudSkills?.[key]
      if (!source || typeof source !== 'object') continue
      if (Number.isSafeInteger(source.correct) && source.correct > skillProgress[key].correct) {
        skillProgress[key].correct = source.correct
        updatedLocal = true
      }
      if (Number.isSafeInteger(source.transferredIn) && source.transferredIn > (skillProgress[key].transferredIn || 0)) {
        skillProgress[key].transferredIn = source.transferredIn
        updatedLocal = true
      }
      if (Number.isSafeInteger(source.transferredOut) && source.transferredOut > (skillProgress[key].transferredOut || 0)) {
        skillProgress[key].transferredOut = source.transferredOut
        updatedLocal = true
      }
      for (const skill of SKILL_TREES[key].skills) {
        const rank = source.ranks?.[skill.id]
        const maxR = skill.maxRank || SKILL_MAX_RANK
        if (Number.isInteger(rank) && rank >= 0 && rank <= maxR && rank > skillProgress[key].ranks[skill.id]) {
          skillProgress[key].ranks[skill.id] = rank
          if (skill.isExclusiveActive && rank > 0 && !exclusiveSkillTree) exclusiveSkillTree = key
          updatedLocal = true
        }
      }
    }
    if (!exclusiveSkillTree && SKILL_TREE_KEYS.includes(cloudSkills?.specialization?.exclusiveTree)) {
      exclusiveSkillTree = cloudSkills.specialization.exclusiveTree
      updatedLocal = true
    }
    if (!activeSkillSpecialization && SKILL_TREE_KEYS.includes(cloudSkills?.specialization?.activeTree)) {
      activeSkillSpecialization = cloudSkills.specialization.activeTree
      updatedLocal = true
    }
    if (typeof reconcileExclusiveSkillPoints === 'function' && reconcileExclusiveSkillPoints()) {
      updatedLocal = true
    }
  }

  // 3. Merge spaced-repetition review queue
  const cloudReview = cloudUser.review_store
  if (cloudReview && typeof cloudReview === 'object') {
    const cloudCounter = Number.isSafeInteger(cloudReview.counter) && cloudReview.counter >= 0 ? cloudReview.counter : 0
    if (cloudCounter > answerCount) {
      answerCount = cloudCounter
      if (Array.isArray(cloudReview.queue)) {
        reviewQueue = cloudReview.queue.filter(
          (entry) => entry && typeof entry.text === 'string' && QUESTION_DIFFICULTY.has(entry.text) && Number.isFinite(entry.due)
        )
      }
      updatedLocal = true
    }
  }

  // 4. Merge achievements
  const cloudAch = cloudUser.achievements
  if (cloudAch && typeof cloudAch === 'object') {
    for (const key of Object.keys(achievementProgress)) {
      const val = cloudAch?.progress?.[key]
      if (Number.isSafeInteger(val) && val > achievementProgress[key]) {
        achievementProgress[key] = val
        updatedLocal = true
      }
    }
    if (cloudAch?.unlocked && typeof cloudAch.unlocked === 'object' && !Array.isArray(cloudAch.unlocked)) {
      for (const achievement of ACHIEVEMENTS) {
        const unlockedAt = cloudAch.unlocked[achievement.id]
        if (typeof unlockedAt === 'string' && Number.isFinite(Date.parse(unlockedAt))) {
          if (!unlockedAchievements[achievement.id] || Date.parse(unlockedAt) < Date.parse(unlockedAchievements[achievement.id])) {
            unlockedAchievements[achievement.id] = unlockedAt
            updatedLocal = true
          }
        }
      }
    }
  }

  if (updatedLocal) {
    try {
      const profileKey = encodeURIComponent(profileId)
      localStorage.setItem(`kings-pigs-topic-tracker-v1:${profileKey}`, JSON.stringify(topicProgress))
      localStorage.setItem(`kings-pigs-skill-tree-v1:${profileKey}`, JSON.stringify({
        ...skillProgress,
        specialization: { activeTree: activeSkillSpecialization, exclusiveTree: exclusiveSkillTree },
      }))
      localStorage.setItem(`kings-pigs-review-v1:${profileKey}`, JSON.stringify({
        queue: reviewQueue,
        counter: answerCount,
      }))
      localStorage.setItem(`${ACHIEVEMENT_STORAGE_KEY}:${profileKey}`, JSON.stringify({
        progress: achievementProgress,
        unlocked: unlockedAchievements,
      }))
    } catch (error) {
      console.error('Unable to cache cloud user profile locally.', error)
    }
    adaptive.calibrateFromProgress()
    refreshAchievements({ silent: true })
    if (mode === 'menu' && !playViewActive) resetRun()
  }
  return updatedLocal
}

function normalizeUsername(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ')
}

function getUsernameKey(raw) {
  return normalizeUsername(raw).toLowerCase()
}

function createAuthError(code, message, extra = {}) {
  const err = new Error(message)
  err.code = code
  Object.assign(err, extra)
  return err
}

function parseSupabaseAuthError(error) {
  const raw = String(error?.message || '')
  if (/AUTH_USERNAME_TAKEN/i.test(raw) || /duplicate key|unique_violation|23505/i.test(raw)) {
    return createAuthError('USERNAME_TAKEN', 'That username is already taken. Please choose another name.')
  }
  if (/AUTH_INVALID_CREDENTIALS/i.test(raw)) {
    return createAuthError('INVALID_CREDENTIALS', 'Invalid username or password.')
  }
  if (/AUTH_INVALID_USERNAME/i.test(raw)) {
    return createAuthError('INVALID_USERNAME', 'Username must be between 1 and 24 characters.')
  }
  if (/AUTH_INVALID_PASSWORD/i.test(raw)) {
    return createAuthError('INVALID_PASSWORD', 'Password must be between 6 and 72 characters.')
  }
  if (/AUTH_SESSION_INVALID/i.test(raw)) {
    return createAuthError('SESSION_INVALID', 'Your session has expired. Please log in again.')
  }
  if (
    raw.includes('(404)') ||
    /PGRST202|Could not find the function|function public\.auth_/i.test(raw)
  ) {
    return createAuthError('RPC_MISSING', 'Supabase password authentication migration is not installed yet.', { unavailable: true })
  }
  if (
    error?.name === 'AbortError' ||
    error?.name === 'TypeError' ||
    /Failed to fetch|NetworkError|Load failed|timed out|ENOTFOUND|ERR_CONNECTION/i.test(raw)
  ) {
    return createAuthError('NETWORK_ERROR', 'Unable to reach Supabase right now.', { unavailable: true })
  }
  return createAuthError('AUTH_ERROR', 'Authentication request failed. Please try again.')
}

async function supabaseAuthRpc(fnName, body, timeoutMs = 6000) {
  const credentials = supabaseCredentials()
  if (!credentials) {
    throw createAuthError('UNCONFIGURED', 'Supabase is not configured.', { unavailable: true })
  }
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timer = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : 0
  try {
    const response = await supabaseRequest(`rpc/${fnName}`, {
      method: 'POST',
      body: JSON.stringify(body),
      ...(controller ? { signal: controller.signal } : {}),
    })
    const text = await response.text()
    return text ? JSON.parse(text) : null
  } catch (error) {
    throw parseSupabaseAuthError(error)
  } finally {
    if (timer) window.clearTimeout(timer)
  }
}

async function callLocalAuthEndpoint(endpoint, body, timeoutMs = 6000) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timer = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : 0
  try {
    const response = await fetch(`/api/auth/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      ...(controller ? { signal: controller.signal } : {}),
    })
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      throw createAuthError('LOCAL_UNAVAILABLE', 'Local authentication server is unavailable.', { unavailable: true })
    }
    const json = await response.json()
    if (!response.ok || json?.ok === false) {
      throw createAuthError(
        json?.code || 'AUTH_ERROR',
        json?.error || 'Authentication failed. Please try again.'
      )
    }
    return json
  } catch (error) {
    if (error?.code && !error?.unavailable) throw error
    throw createAuthError('LOCAL_UNAVAILABLE', 'Local authentication server is unavailable.', { unavailable: true })
  } finally {
    if (timer) window.clearTimeout(timer)
  }
}

async function callTrustedAuthService(action, payload = {}) {
  const preferredProvider = payload.preferredProvider || ''
  const runSupabase = async () => {
    if (action === 'signup') {
      return supabaseAuthRpc('auth_sign_up', {
        p_username: payload.username,
        p_password: payload.password,
      })
    }
    if (action === 'login') {
      return supabaseAuthRpc('auth_log_in', {
        p_username: payload.username,
        p_password: payload.password,
      })
    }
    if (action === 'session') {
      return supabaseAuthRpc('auth_get_session', {
        p_session_token: payload.sessionToken,
      })
    }
    if (action === 'logout') {
      return supabaseAuthRpc('auth_logout', {
        p_session_token: payload.sessionToken,
      })
    }
    if (action === 'profile') {
      return supabaseAuthRpc('auth_save_profile', {
        p_session_token: payload.sessionToken,
        p_topic_progress: payload.topicProgress ?? null,
        p_skill_progress: payload.skillProgress ?? null,
        p_review_store: payload.reviewStore ?? null,
        p_achievements: payload.achievements ?? null,
      })
    }
    if (action === 'reset') {
      return supabaseAuthRpc('auth_reset_profile', {
        p_session_token: payload.sessionToken,
      })
    }
    throw createAuthError('UNKNOWN_ACTION', 'Unknown authentication action.')
  }

  const runLocal = async () => {
    if (action === 'signup') {
      return callLocalAuthEndpoint('signup', {
        username: payload.username,
        password: payload.password,
      })
    }
    if (action === 'login') {
      return callLocalAuthEndpoint('login', {
        username: payload.username,
        password: payload.password,
      })
    }
    if (action === 'session') {
      return callLocalAuthEndpoint('session', {
        sessionToken: payload.sessionToken,
      })
    }
    if (action === 'logout') {
      return callLocalAuthEndpoint('logout', {
        sessionToken: payload.sessionToken,
      })
    }
    if (action === 'profile') {
      return callLocalAuthEndpoint('profile', {
        sessionToken: payload.sessionToken,
        topicProgress: payload.topicProgress ?? null,
        skillProgress: payload.skillProgress ?? null,
        reviewStore: payload.reviewStore ?? null,
        achievements: payload.achievements ?? null,
      })
    }
    if (action === 'reset') {
      return callLocalAuthEndpoint('reset', {
        sessionToken: payload.sessionToken,
      })
    }
    throw createAuthError('UNKNOWN_ACTION', 'Unknown authentication action.')
  }

  if (preferredProvider === 'local') {
    const data = await runLocal()
    return { provider: 'local', data }
  }
  if (preferredProvider === 'supabase') {
    const data = await runSupabase()
    return { provider: 'supabase', data }
  }

  let supabaseError = null
  if (supabaseCredentials()) {
    try {
      const data = await runSupabase()
      return { provider: 'supabase', data }
    } catch (error) {
      if (!error?.unavailable) throw error
      supabaseError = error
    }
  }

  try {
    const data = await runLocal()
    return { provider: 'local', data }
  } catch (localError) {
    if (!localError?.unavailable) throw localError
    const reason = supabaseError?.code === 'RPC_MISSING'
      ? 'Password authentication is not yet enabled on Supabase. Run supabase/migration-password-auth.sql in your Supabase SQL Editor or launch locally with serve-local.cmd.'
      : 'Authentication service is unavailable right now. Check your connection or launch locally with serve-local.cmd.'
    throw createAuthError('AUTH_UNAVAILABLE', reason, { unavailable: true })
  }
}

function saveAuthSessionStorage(token, provider, username, profileId) {
  try {
    sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
      token,
      provider,
      username,
      profileId,
    }))
  } catch {}
}

function clearAuthSessionStorage() {
  try {
    sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY)
  } catch {}
}

function readAuthSessionStorage() {
  try {
    const raw = sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed.token !== 'string' || !parsed.token) return null
    if (parsed.provider !== 'supabase' && parsed.provider !== 'local') return null
    return parsed
  } catch {
    return null
  }
}

async function pushUserProfileToSupabase() {
  window.clearTimeout(userSyncTimer)
  userSyncTimer = 0
  if (practiceRunActive || !activePlayerName || !activeSessionToken || !activeAuthProvider) return false
  const payload = buildUserProfilePayload()
  try {
    await callTrustedAuthService('profile', {
      preferredProvider: activeAuthProvider,
      sessionToken: activeSessionToken,
      topicProgress: payload.topicProgress,
      skillProgress: payload.skillProgress,
      reviewStore: payload.reviewStore,
      achievements: payload.achievements,
    })
    userSyncState = 'synced'
    userSyncError = ''
    if (dashboardView === 'settings' && !playViewActive) renderDashboard()
    return true
  } catch (error) {
    console.warn('Unable to sync authenticated user profile.', error)
    userSyncState = 'error'
    userSyncError = error.message
    if (dashboardView === 'settings' && !playViewActive) renderDashboard()
    return false
  }
}

function scheduleUserProfileSync(delayMs = 1000) {
  if (practiceRunActive || !activePlayerName || !activeSessionToken || !activeAuthProvider) return
  window.clearTimeout(userSyncTimer)
  userSyncTimer = window.setTimeout(() => {
    userSyncTimer = 0
    pushUserProfileToSupabase()
  }, delayMs)
}

async function syncUserOnLogin(displayName, profileId, prefetchedCloudUser = null) {
  if (!activeSessionToken || !activeAuthProvider) {
    userSyncState = 'unconfigured'
    userSyncError = ''
    renderDashboard()
    return
  }
  userSyncState = 'syncing'
  userSyncError = ''
  renderDashboard()
  try {
    let cloudUser = prefetchedCloudUser
    if (!cloudUser) {
      const res = await callTrustedAuthService('session', {
        preferredProvider: activeAuthProvider,
        sessionToken: activeSessionToken,
      })
      cloudUser = res?.data?.user || null
    }
    if (getUsernameKey(activePlayerName) !== profileId) return
    mergeAndApplyCloudUserProfile(profileId, cloudUser)
    await pushUserProfileToSupabase()
    if (activeAuthProvider === 'supabase' && hasRecordableGameplayRun()) {
      await submitLeaderboardRun({ skipReload: true })
    }
    renderDashboard()
  } catch (error) {
    if (getUsernameKey(activePlayerName) !== profileId) return
    console.warn('Unable to load or sync user profile on login.', error)
    userSyncState = 'error'
    userSyncError = error.message
    renderDashboard()
  }
}

async function resetUserProfileInSupabase(displayName) {
  if (!displayName || !activeSessionToken || !activeAuthProvider) return
  try {
    await callTrustedAuthService('reset', {
      preferredProvider: activeAuthProvider,
      sessionToken: activeSessionToken,
    })
    userSyncState = 'synced'
    userSyncError = ''
    if (dashboardView === 'settings' && !playViewActive) renderDashboard()
  } catch (error) {
    console.warn('Unable to reset user profile on auth service.', error)
    userSyncState = 'error'
    userSyncError = error.message
    if (dashboardView === 'settings' && !playViewActive) renderDashboard()
  }
}

const ACHIEVEMENTS = [
  // General Achievements
  { id: 'first-blood', category: 'general', name: 'First Blood', description: 'Defeat your first virus.', goal: 1, metric: 'kills', icon: '01' },
  { id: 'virus-hunter', category: 'general', name: 'Virus Hunter', description: 'Defeat 10 viruses across your adventures.', goal: 10, metric: 'kills', icon: '02' },
  { id: 'virus-slayer', category: 'general', name: 'Virus Slayer', description: 'Defeat 50 viruses across your adventures.', goal: 50, metric: 'kills', icon: '03' },
  { id: 'quick-study', category: 'general', name: 'Quick Study', description: 'Get 10 quiz questions correct.', goal: 10, metric: 'correct', icon: '04' },
  { id: 'knowledge-seeker', category: 'general', name: 'Knowledge Seeker', description: 'Get 50 quiz questions correct.', goal: 50, metric: 'correct', icon: '05' },
  { id: 'master-scholar', category: 'general', name: 'Master Scholar', description: 'Get 100 quiz questions correct.', goal: 100, metric: 'correct', icon: '06' },
  { id: 'seasoned-challenger', category: 'general', name: 'Seasoned Challenger', description: 'Attempt 50 quiz questions.', goal: 50, metric: 'attempts', icon: '07' },
  { id: 'unbroken-focus', category: 'general', name: 'Unbroken Focus', description: 'Answer 5 questions correctly in a row.', goal: 5, metric: 'bestStreak', icon: '08' },
  { id: 'unstoppable-mind', category: 'general', name: 'Unstoppable Mind', description: 'Answer 10 questions correctly in a row.', goal: 10, metric: 'bestStreak', icon: '09' },
  { id: 'sharp-mind', category: 'general', name: 'Sharp Mind', description: 'Attempt 10 questions with at least 90% accuracy.', goal: 90, metric: 'accuracy', icon: '10' },
  { id: 'upgrade-collector', category: 'general', name: 'Upgrade Collector', description: 'Choose 3 combat upgrades.', goal: 3, metric: 'upgrades', icon: '11' },
  { id: 'upgrade-master', category: 'general', name: 'Upgrade Master', description: 'Choose 10 combat upgrades.', goal: 10, metric: 'upgrades', icon: '12' },
  { id: 'skill-awakened', category: 'general', name: 'Skill Awakened', description: 'Purchase your first skill rank.', goal: 1, metric: 'skillRanks', icon: '13' },
  { id: 'focused-specialist', category: 'general', name: 'Focused Specialist', description: 'Learn 3 different skills in one discipline.', goal: 3, metric: 'bestTreeSkills', icon: '14' },
  { id: 'well-rounded', category: 'general', name: 'Well-Rounded', description: 'Invest in skills from 2 different disciplines.', goal: 2, metric: 'investedTrees', icon: '15' },
  { id: 'boss-breaker', category: 'general', name: 'Boss Breaker', description: 'Defeat a mini boss.', goal: 1, metric: 'bosses', icon: '16' },
  { id: 'boss-vanquisher', category: 'general', name: 'Boss Vanquisher', description: 'Defeat 5 mini bosses.', goal: 5, metric: 'bosses', icon: '17' },

  // Topic Drill, Learning Tracker & Leaderboard Achievements
  { id: 'drill-initiate', category: 'study', name: 'Drill Initiate', description: 'Answer 5 questions in Topic Drill.', goal: 5, metric: 'drillAnswers', icon: 'TD1' },
  { id: 'drill-scholar', category: 'study', name: 'Drill Scholar', description: 'Answer 25 questions in Topic Drill.', goal: 25, metric: 'drillAnswers', icon: 'TD2' },
  { id: 'set-finisher', category: 'study', name: 'Set Finisher', description: 'Complete a Topic Drill set (DONE).', goal: 1, metric: 'drillCompletions', icon: 'DN1' },
  { id: 'curriculum-finisher', category: 'study', name: 'Curriculum Finisher', description: 'Complete 5 Topic Drill sets (DONE).', goal: 5, metric: 'drillCompletions', icon: 'DN5' },
  { id: 'topic-explorer', category: 'study', name: 'Topic Explorer', description: 'Attempt at least 1 question in 10 IT topics.', goal: 10, metric: 'topicsExplored', icon: 'TR1' },
  { id: 'full-coverage', category: 'study', name: 'Full Coverage', description: 'Attempt all 20 IT topics in the Learning Tracker.', goal: 20, metric: 'topicsExplored', icon: 'TR2' },
  { id: 'growth-mindset', category: 'study', name: 'Growth Mindset', description: 'Beat your Diagnostic Baseline in 3 topics.', goal: 3, metric: 'topicsImproved', icon: 'UP3' },
  { id: 'tracker-virtuoso', category: 'study', name: 'Tracker Virtuoso', description: 'Master 5 IT topics (80%+ accuracy, 4+ answers).', goal: 5, metric: 'topicsMastered', icon: 'MS5' },
  { id: 'on-the-board', category: 'study', name: 'On The Board', description: 'Record a run on the Arcade Leaderboard.', goal: 1, metric: 'leaderboardRuns', icon: 'LB1' },
  { id: 'top-ten-contender', category: 'study', name: 'Top 10 Contender', description: 'Reach Top 10 on the Arcade Leaderboard.', goal: 1, metric: 'topArcadeTen', icon: 'T10' },
  { id: 'podium-finish', category: 'study', name: 'Podium Finish', description: 'Reach Top 3 on the Arcade Leaderboard.', goal: 1, metric: 'topArcadeThree', icon: 'TOP' },
  { id: 'arcade-apex', category: 'study', name: 'Arcade Apex', description: 'Claim Rank #1 on the Arcade Leaderboard.', goal: 1, metric: 'topArcadeOne', icon: '#1' },

  // 1v1 Competitive Arena Achievements
  { id: 'arena-debut', category: 'pvp', name: 'Arena Debut', description: 'Complete your first 1v1 Competitive match.', goal: 1, metric: 'pvpMatches', icon: 'VS' },
  { id: 'duel-victor', category: 'pvp', name: 'Duel Victor', description: 'Win your first 1v1 Competitive match.', goal: 1, metric: 'pvpWins', icon: 'W1' },
  { id: 'arena-gladiator', category: 'pvp', name: 'Arena Gladiator', description: 'Win 5 matches in the 1v1 Competitive Arena.', goal: 5, metric: 'pvpWins', icon: 'W5' },
  { id: 'arena-champion', category: 'pvp', name: 'Arena Champion', description: 'Win 15 matches in the 1v1 Competitive Arena.', goal: 15, metric: 'pvpWins', icon: 'W15' },
  { id: 'arena-striker', category: 'pvp', name: 'Arena Striker', description: 'Deal 250 total damage in 1v1 Competitive duels.', goal: 250, metric: 'pvpDamage', icon: 'DM1' },
  { id: 'arena-destroyer', category: 'pvp', name: 'Arena Destroyer', description: 'Deal 1,000 total damage in 1v1 Competitive duels.', goal: 1000, metric: 'pvpDamage', icon: 'DM2' },
  { id: 'duel-savant', category: 'pvp', name: 'Duel Savant', description: 'Answer 20 questions correctly in 1v1 duels.', goal: 20, metric: 'pvpCorrect', icon: 'Q20' },
  { id: 'elo-ascendant', category: 'pvp', name: 'Elo Ascendant', description: 'Reach 1,100+ Rating on the 1v1 Leaderboard.', goal: 1100, metric: 'pvpBestRating', icon: 'ELO' },

  // Role & Exclusive Active Skill Achievements
  { id: 'path-committed', category: 'exclusive', name: 'Path Committed', description: 'Unlock any Exclusive Active Skill in the Skill Tree.', goal: 1, metric: 'exclusivePicked', icon: 'EX' },
  { id: 'aegis-bearer', category: 'exclusive', theme: 'cs', name: 'Aegis Bearer', description: 'Choose Kernel Aegis (Computer Systems Exclusive).', goal: 1, metric: 'exclusiveCs', icon: 'CS' },
  { id: 'aegis-sentinel', category: 'exclusive', theme: 'cs', name: 'Aegis Sentinel', description: 'Invest 6 total skill ranks in Computer Systems.', goal: 6, metric: 'csSkillRanks', icon: 'CS6' },
  { id: 'lockdown-enforcer', category: 'exclusive', theme: 'ns', name: 'Lockdown Enforcer', description: 'Choose Packet Lockdown (Networking Exclusive).', goal: 1, metric: 'exclusiveNs', icon: 'NS' },
  { id: 'net-architect', category: 'exclusive', theme: 'ns', name: 'Net Architect', description: 'Invest 6 total skill ranks in Networking & Security.', goal: 6, metric: 'nsSkillRanks', icon: 'NS6' },
  { id: 'overburn-executor', category: 'exclusive', theme: 'pr', name: 'Overburn Executor', description: 'Choose Overburn Execution (Programming Exclusive).', goal: 1, metric: 'exclusivePr', icon: 'PR' },
  { id: 'code-compiler', category: 'exclusive', theme: 'pr', name: 'Code Compiler', description: 'Invest 6 total skill ranks in Programming.', goal: 6, metric: 'prSkillRanks', icon: 'PR6' },
  { id: 'soul-binder', category: 'exclusive', theme: 'db', name: 'Soul Binder', description: 'Choose Necromancy Pact (Database Exclusive).', goal: 1, metric: 'exclusiveDb', icon: 'DB' },
  { id: 'vault-keeper', category: 'exclusive', theme: 'db', name: 'Vault Keeper', description: 'Invest 6 total skill ranks in Database.', goal: 6, metric: 'dbSkillRanks', icon: 'DB6' },
  { id: 'apex-specialist', category: 'exclusive', name: 'Apex Specialist', description: 'Upgrade any Exclusive Active Skill to Rank 3/3.', goal: 1, metric: 'exclusiveMaxed', icon: 'MAX' },

  // Onboarding & Tutorial Mastery Achievement
  {
    id: 'codex-laureate',
    category: 'tutorial',
    theme: 'tutorial',
    name: 'Codex Laureate',
    description: 'Complete all 17 guided page tours and gameplay lessons. (Skipped lessons must be replayed and completed to count.)',
    goal: 17,
    metric: 'tutorialsCompleted',
    icon: '✦',
    isTutorialAchievement: true,
  },
]

function renderTutorialAchievementEmblem() {
  return `<svg class="tutorial-emblem-svg" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
    <rect x="3" y="6" width="12" height="19" fill="currentColor" opacity="0.22" />
    <rect x="17" y="6" width="12" height="19" fill="currentColor" opacity="0.22" />
    <path d="M2 5h13v2H4v17h11v2H2V5zm15 0h13v21H17v-2h11V7H17V5zm-2 2h2v19h-2V7z" fill="currentColor" />
    <rect x="6" y="10" width="6" height="2" fill="currentColor" />
    <rect x="6" y="14" width="7" height="2" fill="currentColor" />
    <rect x="6" y="18" width="5" height="2" fill="currentColor" />
    <path d="M22 9l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" fill="currentColor" />
    <rect x="19" y="18" width="7" height="2" fill="currentColor" />
  </svg>`
}

function resetAchievementToast() {
  window.clearTimeout(achievementToastTimer)
  achievementToastTimer = 0
  achievementToastQueue = []
  achievementToastActive = false
  const toast = document.getElementById('achievementToast')
  if (!toast) return
  toast.hidden = true
  toast.classList.remove('is-entering', 'is-leaving')
}

function showNextAchievementToast() {
  const achievement = achievementToastQueue.shift()
  if (!achievement) {
    achievementToastActive = false
    return
  }
  const toast = document.getElementById('achievementToast')
  const icon = document.getElementById('achievementToastIcon')
  const title = document.getElementById('achievementToastTitle')
  const description = document.getElementById('achievementToastDescription')
  if (!toast || !icon || !title || !description) {
    throw new Error('Achievement toast elements are missing.')
  }
  const isTut = Boolean(achievement.isTutorialAchievement || achievement.id === 'codex-laureate')
  toast.classList.toggle('is-tutorial-toast', isTut)
  const headerSpan = toast.querySelector('.achievement-toast-copy > span')
  if (headerSpan) {
    headerSpan.textContent = isTut ? 'Tutorial Codex Mastered' : 'Achievement unlocked'
  }
  if (isTut) {
    icon.innerHTML = renderTutorialAchievementEmblem()
  } else {
    icon.textContent = achievement.icon
  }
  title.textContent = achievement.name
  description.textContent = achievement.description
  toast.hidden = false
  toast.classList.remove('is-entering', 'is-leaving')
  void toast.offsetWidth
  toast.classList.add('is-entering')
  achievementToastTimer = window.setTimeout(() => {
    toast.classList.remove('is-entering')
    toast.classList.add('is-leaving')
    achievementToastTimer = window.setTimeout(() => {
      toast.hidden = true
      toast.classList.remove('is-leaving')
      achievementToastTimer = 0
      showNextAchievementToast()
    }, 220)
  }, 2300)
}

function queueAchievementToast(achievement) {
  achievementToastQueue.push(achievement)
  if (achievementToastActive) return
  achievementToastActive = true
  showNextAchievementToast()
}

function selectAchievementProfile(profileId) {
  resetAchievementToast()
  activeAchievementStorageKey = `${ACHIEVEMENT_STORAGE_KEY}:${encodeURIComponent(profileId)}`
  achievementProgress = {
    kills: 0,
    bestStreak: 0,
    upgrades: 0,
    bosses: 0,
    pvpMatches: 0,
    pvpWins: 0,
    pvpDamage: 0,
    pvpCorrect: 0,
    pvpBestRating: 1000,
    drillAnswers: 0,
    drillCompletions: 0,
    leaderboardSubmissions: 0,
  }
  unlockedAchievements = {}
  try {
    const saved = localStorage.getItem(activeAchievementStorageKey)
    if (!saved) return
    const stored = JSON.parse(saved)
    for (const key of Object.keys(achievementProgress)) {
      if (Number.isSafeInteger(stored?.progress?.[key]) && stored.progress[key] >= 0) {
        achievementProgress[key] = stored.progress[key]
      }
    }
    if (stored?.unlocked && typeof stored.unlocked === 'object' && !Array.isArray(stored.unlocked)) {
      for (const achievement of ACHIEVEMENTS) {
        const unlockedAt = stored.unlocked[achievement.id]
        if (typeof unlockedAt === 'string' && Number.isFinite(Date.parse(unlockedAt))) {
          unlockedAchievements[achievement.id] = unlockedAt
        }
      }
    }
  } catch (error) {
    console.error('Unable to load saved achievements.', error)
  }
}

function saveAchievementProgress() {
  if (practiceRunActive) return true
  try {
    localStorage.setItem(activeAchievementStorageKey, JSON.stringify({
      progress: achievementProgress,
      unlocked: unlockedAchievements,
    }))
    scheduleUserProfileSync()
    return true
  } catch (error) {
    console.error('Unable to save achievement progress.', error)
    return false
  }
}

function recordAchievementProgress(metric, value) {
  if (!Object.prototype.hasOwnProperty.call(achievementProgress, metric) || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid achievement progress: ${metric}`)
  }
  if (practiceRunActive) return
  achievementProgress[metric] = (metric === 'bestStreak' || metric === 'pvpBestRating')
    ? Math.max(achievementProgress[metric], value)
    : achievementProgress[metric] + value
  saveAchievementProgress()
  refreshAchievements()
}

function getAchievementMetrics() {
  const allTopics = Object.values(topicProgress).flatMap((topics) => Object.values(topics))
  const topicTotals = allTopics.reduce((totals, topic) => ({
    correct: totals.correct + (topic.correct || 0),
    attempted: totals.attempted + (topic.attempted || 0),
  }), { correct: 0, attempted: 0 })
  const topicsExplored = allTopics.filter((t) => (t?.attempted || 0) >= 1).length
  const topicsMastered = allTopics.filter((t) => typeof getTopicMasteryState === 'function' && getTopicMasteryState(t) === 'mastered').length
  const topicsImproved = allTopics.filter((t) => {
    if (!t || !t.baselineAttempted || (t.attempted || 0) <= t.baselineAttempted) return false
    const basePct = Math.round((100 * (t.baselineCorrect || 0)) / t.baselineAttempted)
    const currPct = Math.round((100 * (t.correct || 0)) / t.attempted)
    return currPct > basePct
  }).length
  const treeRankSum = (key) => Object.values(skillProgress[key]?.ranks || {}).reduce((sum, rank) => sum + (rank || 0), 0)
  const investedTrees = SKILL_TREE_KEYS.filter((key) => treeRankSum(key) > 0)
  const exclusiveMaxed = SKILL_TREE_KEYS.some((key) => {
    const exId = SKILL_TREES[key]?.exclusiveId
    return exId && (skillProgress[key]?.ranks?.[exId] || 0) >= 3
  }) ? 1 : 0
  const activeKey = String(activePlayerName || '').trim().toLowerCase()
  const arcadeRankIdx = activeKey
    ? leaderboardEntries.findIndex((e) => String(e?.player_name || '').trim().toLowerCase() === activeKey)
    : -1
  const arcadeRank = arcadeRankIdx >= 0 ? arcadeRankIdx + 1 : 0
  const pvpEntry = activeKey
    ? pvpLeaderboardEntries.find((e) => String(e?.player_name || '').trim().toLowerCase() === activeKey)
    : null
  const pvpBestRating = Math.max(achievementProgress.pvpBestRating || 1000, pvpEntry?.rating || 0)
  return {
    ...achievementProgress,
    correct: topicTotals.correct,
    accuracy: topicTotals.attempted ? Math.floor((100 * topicTotals.correct) / topicTotals.attempted) : 0,
    skillRanks: investedTrees.reduce((total, key) => total + treeRankSum(key), 0),
    investedTrees: investedTrees.length,
    bestTreeSkills: Math.max(0, ...SKILL_TREE_KEYS.map((key) => countSpecializedSkills(key))),
    attempts: topicTotals.attempted,
    topicsExplored,
    topicsMastered,
    topicsImproved,
    leaderboardRuns: Math.max(achievementProgress.leaderboardSubmissions || 0, arcadeRank > 0 ? 1 : 0),
    topArcadeTen: arcadeRank >= 1 && arcadeRank <= 10 ? 1 : 0,
    topArcadeThree: arcadeRank >= 1 && arcadeRank <= 3 ? 1 : 0,
    topArcadeOne: arcadeRank === 1 ? 1 : 0,
    pvpBestRating,
    csSkillRanks: treeRankSum('computerSystems'),
    nsSkillRanks: treeRankSum('networkingSecurity'),
    prSkillRanks: treeRankSum('programming'),
    dbSkillRanks: treeRankSum('database'),
    exclusivePicked: exclusiveSkillTree ? 1 : 0,
    exclusiveCs: exclusiveSkillTree === 'computerSystems' ? 1 : 0,
    exclusiveNs: exclusiveSkillTree === 'networkingSecurity' ? 1 : 0,
    exclusivePr: exclusiveSkillTree === 'programming' ? 1 : 0,
    exclusiveDb: exclusiveSkillTree === 'database' ? 1 : 0,
    exclusiveMaxed,
    tutorialsCompleted: typeof window.ByteboundTutorial?.getCompletedTutorialCount === 'function'
      ? window.ByteboundTutorial.getCompletedTutorialCount()
      : 0,
  }
}

function refreshAchievements({ silent = false } = {}) {
  const metrics = getAchievementMetrics()
  let changed = false
  for (const achievement of ACHIEVEMENTS) {
    if (practiceRunActive && !achievement.isTutorialAchievement) continue
    const value = metrics[achievement.metric]
    const accuracyQualified = achievement.metric !== 'accuracy' || metrics.attempts >= 10
    if (unlockedAchievements[achievement.id] || !accuracyQualified || value < achievement.goal) continue
    unlockedAchievements[achievement.id] = new Date().toISOString()
    if (!silent) queueAchievementToast(achievement)
    changed = true
  }
  if (changed) {
    try {
      localStorage.setItem(activeAchievementStorageKey, JSON.stringify({
        progress: achievementProgress,
        unlocked: unlockedAchievements,
      }))
      if (!practiceRunActive) scheduleUserProfileSync()
    } catch {}
  }
  return metrics
}

function renderCardCollection(metrics) {
  const rows = Object.values(CARD_LIBRARY)
    .filter((card) => !card.exclusiveActive)
    .map((card) => {
      const unlocked = cardUnlocked(card, metrics)
      const detail = unlocked ? esc(card.text) : `Locked: ${esc(card.unlock?.text || 'Unlock via gameplay')}`
      const stateLabel = unlocked ? 'UNLOCKED' : 'LOCKED'
      const cost = esc(cardCostLabel(card, hero))
      const role = typeof getCardRoleMeta === 'function'
        ? getCardRoleMeta(card)
        : { tone: card.kind === 'hit' ? 'offense' : 'defense', category: card.kind === 'hit' ? 'attack' : 'defense', label: card.kind === 'hit' ? 'ATTACK' : 'DEFENSE', iconSvg: '' }
      return `<li class="${unlocked ? 'is-unlocked' : 'is-locked'} card-tone-${role.tone} card-role-${role.category}">
        <div class="card-list-heading">
          <strong>${esc(card.name)}</strong>
          <span class="card-collection-state">${stateLabel}</span>
        </div>
        <div class="card-collection-meta">
          <span class="card-role-pill is-${role.tone}"><span class="card-role-ico" aria-hidden="true">${role.iconSvg}</span><span>${esc(role.label)}</span></span>
          <span class="card-collection-cost">Cost · ${cost}</span>
        </div>
        <small>${detail}</small>
      </li>`
    })
    .join('')
  return `<section class="card-collection">
    <h3>Card collection</h3>
    <p class="achievement-summary">Unlocked cards join your reward pool. Offensive cards are framed in red; healing and defensive cards are framed in green.</p>
    <ul class="card-list">${rows}</ul>
  </section>`
}

function renderAchievements() {
  const metrics = refreshAchievements({ silent: true })
  const unlockedCount = ACHIEVEMENTS.filter((achievement) => unlockedAchievements[achievement.id]).length
  const totalTutorials = window.ByteboundTutorial?.REQUIRED_TUTORIAL_IDS?.length || 17
  const sections = [
    { key: 'tutorial', title: 'Onboarding & Tutorial Mastery', badge: 'CODEX SEAL', hint: `Complete all ${totalTutorials} guided tutorials.` },
    { key: 'general', title: 'General Milestones', badge: 'GENERAL', hint: 'Campaign combat and skill progression.' },
    { key: 'study', title: 'Topic Drill, Tracker & Leaderboard', badge: 'STUDY & RANK', hint: 'Topic Drill mastery, Learning Tracker coverage, and Arcade rankings.' },
    { key: 'pvp', title: '1v1 Competitive Arena', badge: '1V1 ARENA', hint: 'Head-to-head duel, accuracy, and Elo milestones.' },
    { key: 'exclusive', title: 'Role & Exclusive Skill Paths', badge: 'ROLE PATH', hint: 'Discipline role mastery and signature exclusive active skills.' },
  ]
  const sectionsHtml = sections.map((sec) => {
    const items = ACHIEVEMENTS.filter((a) => (a.category || 'general') === sec.key)
    const secUnlocked = items.filter((a) => unlockedAchievements[a.id]).length
    const cards = items.map((achievement) => {
      const unlockedAt = unlockedAchievements[achievement.id]
      const value = metrics[achievement.metric] || 0
      const isTut = Boolean(achievement.isTutorialAchievement)
      const progress = achievement.metric === 'accuracy' && metrics.attempts < 10
        ? Math.floor(metrics.attempts * achievement.goal / 10)
        : Math.min(value, achievement.goal)
      const progressLabel = isTut
        ? `${progress} of ${achievement.goal} tutorials completed`
        : achievement.metric === 'accuracy' && metrics.attempts < 10
          ? `${metrics.attempts} / 10 attempts · ${value}% accuracy`
          : `${progress} / ${achievement.goal}${achievement.metric === 'accuracy' ? '%' : ''}`
      const themeClass = achievement.theme ? ` theme-${achievement.theme}` : ''
      const iconContent = isTut ? renderTutorialAchievementEmblem() : achievement.icon
      const tutorialBreakdown = isTut && typeof window.ByteboundTutorial?.renderAchievementChecklist === 'function'
        ? window.ByteboundTutorial.renderAchievementChecklist()
        : ''
      return `<article class="achievement-card cat-${sec.key}${themeClass}${isTut ? ' is-tutorial-achievement' : ''} ${unlockedAt ? 'is-unlocked' : 'is-locked'}">
        <div class="achievement-icon${isTut ? ' is-emblem-icon' : ''}" aria-hidden="true">${iconContent}</div>
        <div class="achievement-copy">
          <div class="achievement-title-row">
            <h3>${esc(achievement.name)}</h3>
            <span class="achievement-cat-pill cat-${sec.key}${themeClass}">${sec.badge}</span>
          </div>
          <p>${esc(achievement.description)}</p>
          <div class="achievement-progress" role="progressbar" aria-label="${esc(`${achievement.name} progress`)}" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="${achievement.goal}">
            <i style="width:${Math.min(100, 100 * progress / achievement.goal)}%"></i>
          </div>
          <div class="achievement-meta-row">
            <small>${unlockedAt ? `Earned ${new Date(unlockedAt).toLocaleDateString()} · ${progress} of ${achievement.goal} tutorials completed` : progressLabel}</small>
            <span class="achievement-state">${unlockedAt ? 'MASTERED' : 'LOCKED'}</span>
          </div>
          ${tutorialBreakdown}
        </div>
      </article>`
    }).join('')
    return `<section class="achievement-section cat-${sec.key}">
      <header class="achievement-section-head">
        <div>
          <h3>${sec.title}</h3>
          <small>${sec.hint}</small>
        </div>
        <span class="achievement-section-count">${secUnlocked} / ${items.length}</span>
      </header>
      <div class="achievement-grid">${cards}</div>
    </section>`
  }).join('')
  return `<span class="eyebrow">Achievements</span>
    <h2>Milestones earned</h2>
    <p class="achievement-summary">${unlockedCount} of ${ACHIEVEMENTS.length} achievements unlocked.</p>
    <div class="achievement-sections">${sectionsHtml}</div>
    ${renderCardCollection(metrics)}`
}

function renderLeaderboardPodium(entries, { isPvp, activeKey }) {
  const topThree = entries.slice(0, 3)
  if (!topThree.length) return ''
  const ordinals = ['1ST', '2ND', '3RD']
  const crownSvg = `<svg class="podium-crown" viewBox="0 0 16 12" width="16" height="12" aria-hidden="true">
    <path d="M1 10L0 3l4 3 4-5 4 5 4-3-1 7H1zm0 2h14v-1H1v1z" fill="currentColor" />
  </svg>`
  const cards = topThree.map((entry, idx) => {
    const rank = idx + 1
    const isCurrentUser = Boolean(activeKey && String(entry.player_name || '').trim().toLowerCase() === activeKey)
    const primaryLabel = isPvp ? 'Rating' : 'Score'
    const primaryValue = isPvp ? entry.rating : entry.score
    const statsHtml = isPvp
      ? `<div class="podium-stat"><dt>Record</dt><dd>${entry.wins}W-${entry.losses}L${entry.draws ? `-${entry.draws}D` : ''}</dd></div>
         <div class="podium-stat"><dt>Win Rate</dt><dd>${entry.win_rate}%</dd></div>
         <div class="podium-stat"><dt>Accuracy</dt><dd>${entry.accuracy}%</dd></div>`
      : `<div class="podium-stat"><dt>Viruses</dt><dd>${entry.kills}</dd></div>
         <div class="podium-stat"><dt>Correct</dt><dd>${entry.correct_answers}/${entry.total_answers}</dd></div>
         <div class="podium-stat"><dt>Accuracy</dt><dd>${entry.accuracy}%</dd></div>`
    return `<li class="podium-card is-rank-${rank}${isCurrentUser ? ' is-current-user' : ''}">
      <div class="podium-card-head">
        <span class="podium-rank-pill">${rank === 1 ? crownSvg : ''}#${rank} · ${ordinals[idx]}</span>
        ${isCurrentUser ? '<span class="podium-you-tag">YOU</span>' : ''}
      </div>
      <h3 class="podium-player">${esc(entry.player_name)}</h3>
      <div class="podium-score-block">
        <span class="podium-score-label">${primaryLabel}</span>
        <strong class="podium-score-val">${esc(String(primaryValue))}</strong>
      </div>
      <dl class="podium-stats">${statsHtml}</dl>
      <div class="podium-pedestal">${ordinals[idx]} PLACE</div>
    </li>`
  }).join('')
  return `<ol class="leaderboard-podium is-count-${topThree.length}" aria-label="Top ${topThree.length} rankings">${cards}</ol>`
}

function renderLeaderboard() {
  const isPvp = leaderboardTab === 'pvp'
  const credentialsConfigured = Boolean(supabaseCredentials())
  const activeKey = String(activePlayerName || '').trim().toLowerCase()
  const tabsHtml = `<div class="leaderboard-tabs" role="tablist" aria-label="Leaderboard modes">
    <button type="button" class="leaderboard-tab${!isPvp ? ' is-active' : ''}" data-leaderboard-tab="arcade" role="tab" aria-selected="${!isPvp}">Arcade Ranking</button>
    <button type="button" class="leaderboard-tab${isPvp ? ' is-active' : ''}" data-leaderboard-tab="pvp" role="tab" aria-selected="${isPvp}">1v1 Competitive</button>
  </div>`

  if (isPvp) {
    let message = ''
    if (pvpLeaderboardState === 'loading') {
      message = '<p class="leaderboard-message">Loading 1v1 rankings…</p>'
    } else if (pvpLeaderboardState === 'error') {
      message = `<p class="leaderboard-message is-error">Could not load 1v1 leaderboard: ${esc(pvpLeaderboardError)}</p>`
    } else if (!pvpLeaderboardEntries.length) {
      message = '<p class="leaderboard-message">No 1v1 competitive matches recorded yet. Win or complete a 1v1 duel to rank on this board.</p>'
    }
    const podiumHtml = renderLeaderboardPodium(pvpLeaderboardEntries, { isPvp: true, activeKey })
    const rest = pvpLeaderboardEntries.slice(3)
    const rows = rest.map((entry, index) => {
      const isCurrentUser = activeKey && String(entry.player_name || '').trim().toLowerCase() === activeKey
      return `<tr>
        <td data-label="Rank">${index + 4}</td>
        <th scope="row" data-label="Player">${esc(entry.player_name)}${isCurrentUser ? ' <small>(You)</small>' : ''}</th>
        <td data-label="Rating">${entry.rating}</td>
        <td data-label="Record">${entry.wins}W - ${entry.losses}L${entry.draws ? ` - ${entry.draws}D` : ''}</td>
        <td data-label="Win Rate">${entry.win_rate}%</td>
        <td data-label="Accuracy">${entry.accuracy}%</td>
      </tr>`
    }).join('')
    return `<span class="eyebrow">Leaderboard / 1v1 competitive</span>
      <div class="leaderboard-heading">
        <div><h2>1v1 Arena Champions</h2><p>Head-to-head online duels ranked by competitive rating (separate from Arcade).</p></div>
        <button type="button" class="leaderboard-action" data-leaderboard-refresh ${pvpLeaderboardState === 'loading' ? 'disabled' : ''}>${pvpLeaderboardState === 'loading' ? 'Loading…' : 'Refresh'}</button>
      </div>
      ${tabsHtml}
      ${message}
      ${podiumHtml}
      ${rest.length ? `<div class="leaderboard-table-wrap"><table class="leaderboard-table">
        <thead><tr><th scope="col">#</th><th scope="col">Player</th><th scope="col">Rating</th><th scope="col">Record</th><th scope="col">Win Rate</th><th scope="col">Accuracy</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>` : ''}
      <p class="leaderboard-score-note">Base Rating: 1000 (+25 Win, -15 Loss, +5 Draw). Only completed 1v1 competitive duels affect this ranking.</p>`
  }

  let message = ''
  if (!credentialsConfigured || leaderboardState === 'unconfigured') {
    message = `<p class="leaderboard-message">Connect your Supabase project to load shared rankings. Follow <a href="./SUPABASE_SETUP.md">the setup guide</a>, then refresh this page.</p>`
  } else if (leaderboardState === 'loading') {
    message = '<p class="leaderboard-message">Loading rankings…</p>'
  } else if (leaderboardState === 'error') {
    message = `<p class="leaderboard-message is-error">Could not load leaderboard: ${esc(leaderboardError)}</p>`
  } else if (leaderboardState === 'submit-error') {
    message = `<p class="leaderboard-message is-error">Run submission failed: ${esc(leaderboardError)}</p>`
  } else if (!leaderboardEntries.length) {
    message = '<p class="leaderboard-message">No Arcade runs recorded yet. Start an Arcade game and defeat viruses to appear on this leaderboard.</p>'
  }
  const podiumHtml = renderLeaderboardPodium(leaderboardEntries, { isPvp: false, activeKey })
  const rest = leaderboardEntries.slice(3)
  const rows = rest.map((entry, index) => {
    const isCurrentUser = activeKey && String(entry.player_name || '').trim().toLowerCase() === activeKey
    return `<tr>
      <td data-label="Rank">${index + 4}</td>
      <th scope="row" data-label="Player">${esc(entry.player_name)}${isCurrentUser ? ' <small>(You)</small>' : ''}</th>
      <td data-label="Score">${entry.score}</td>
      <td data-label="Viruses">${entry.kills}</td>
      <td data-label="Correct">${entry.correct_answers} / ${entry.total_answers}</td>
      <td data-label="Accuracy">${entry.accuracy}%</td>
    </tr>`
  }).join('')
  return `<span class="eyebrow">Leaderboard / arcade rankings</span>
    <div class="leaderboard-heading">
      <div><h2>Top adventurers</h2><p>Arcade adventure runs ranked by score (excludes 1v1-only players).</p></div>
      <button type="button" class="leaderboard-action" data-leaderboard-refresh ${leaderboardState === 'loading' ? 'disabled' : ''}>${leaderboardState === 'loading' ? 'Loading…' : 'Refresh'}</button>
    </div>
    ${tabsHtml}
    ${message}
    ${podiumHtml}
    ${rest.length ? `<div class="leaderboard-table-wrap"><table class="leaderboard-table">
      <thead><tr><th scope="col">#</th><th scope="col">Player</th><th scope="col">Score</th><th scope="col">Viruses</th><th scope="col">Correct</th><th scope="col">Accuracy</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>` : ''}
    <p class="leaderboard-score-note">Score = 100 per virus + 10 per correct answer + accuracy. Only Arcade runs with defeated viruses appear here.</p>`
}


// Sprite animation speed = game ticks (1/60 s) each frame stays on screen. Bigger = slower.
const IDLE_TICKS = 14 // king idle: about 4 frames per second
const RUN_TICKS = 10  // king run: 6 frames per second
const DOOR_TICKS = 8  // king entering the door

const player = new Player({
  imageSrc: './img/player/player1-idle-trimmed.png',
  frameRate: 12,
  frameBuffer: IDLE_TICKS,
  sourceFrameSize: { width: 256, height: 256 },
  frameColumns: 5,
  frameCount: 12,
  frameCrop: { x: 35, y: 40, width: 190, height: 180 },
  destinationSize: { width: 76, height: 72 },
  logicalSize: { width: 156, height: 116 },
  drawOffset: { x: 40, y: 20 },
  animations: {
    idleRight: {
      frameRate: 12,
      frameBuffer: IDLE_TICKS,
      loop: true,
      imageSrc: './img/player/player1-idle-trimmed.png',
      sourceFrameSize: { width: 256, height: 256 },
      frameColumns: 5,
      frameCount: 12,
      frameCrop: { x: 35, y: 40, width: 190, height: 180 },
      destinationSize: { width: 76, height: 72 },
      logicalSize: { width: 156, height: 116 },
      drawOffset: { x: 40, y: 20 },
    },
    idleLeft: {
      frameRate: 12,
      frameBuffer: IDLE_TICKS,
      loop: true,
      imageSrc: './img/player/player1-idle-trimmed.png',
      sourceFrameSize: { width: 256, height: 256 },
      frameColumns: 5,
      frameCount: 12,
      frameCrop: { x: 35, y: 40, width: 190, height: 180 },
      destinationSize: { width: 76, height: 72 },
      logicalSize: { width: 156, height: 116 },
      drawOffset: { x: 40, y: 20 },
      flipX: true,
    },
    runRight: {
      frameRate: 24,
      frameBuffer: RUN_TICKS,
      loop: true,
      imageSrc: './img/player/player1-run-trimmed.png',
      sourceFrameSize: { width: 256, height: 256 },
      frameColumns: 5,
      frameCount: 24,
      frameCrop: { x: 35, y: 40, width: 190, height: 180 },
      destinationSize: { width: 76, height: 72 },
      logicalSize: { width: 156, height: 116 },
      drawOffset: { x: 40, y: 20 },
    },
    runLeft: {
      frameRate: 24,
      frameBuffer: RUN_TICKS,
      loop: true,
      imageSrc: './img/player/player1-run-trimmed.png',
      sourceFrameSize: { width: 256, height: 256 },
      frameColumns: 5,
      frameCount: 24,
      frameCrop: { x: 35, y: 40, width: 190, height: 180 },
      destinationSize: { width: 76, height: 72 },
      logicalSize: { width: 156, height: 116 },
      drawOffset: { x: 40, y: 20 },
      flipX: true,
    },
    enterDoor: {
      frameRate: 12,
      frameBuffer: DOOR_TICKS,
      loop: false,
      imageSrc: './img/player/player1-idle-trimmed.png',
      sourceFrameSize: { width: 256, height: 256 },
      frameColumns: 5,
      frameCount: 12,
      frameCrop: { x: 35, y: 40, width: 190, height: 180 },
      destinationSize: { width: 76, height: 72 },
      logicalSize: { width: 156, height: 116 },
      drawOffset: { x: 40, y: 20 },
      onComplete: () => gsap.to(overlay, { opacity: 1, onComplete: completeDoorTransition }),
    },
  },
})

const CAFE_DOOR_FRAME_RECTS = [
  { x: 33, y: 95, width: 85, height: 145 },
  { x: 147, y: 95, width: 83, height: 145 },
  { x: 259, y: 95, width: 84, height: 145 },
  { x: 373, y: 95, width: 84, height: 145 },
  { x: 486, y: 95, width: 84, height: 145 },
]

const HOSPITAL_SLIDING_DOOR_RECTS = [
  { x: 8, y: 45, width: 98, height: 95 },
  { x: 128, y: 45, width: 98, height: 94 },
  { x: 247, y: 45, width: 99, height: 94 },
  { x: 367, y: 45, width: 99, height: 94 },
  { x: 487, y: 45, width: 98, height: 94 },
]

const HOSPITAL_DOOR_FRAME_RECTS = [
  { x: 114, y: 406, width: 460, height: 711 },
  { x: 630, y: 406, width: 460, height: 711 },
  { x: 1146, y: 406, width: 460, height: 711 },
  { x: 1662, y: 406, width: 460, height: 711 },
  { x: 2178, y: 406, width: 460, height: 711 },
]

const BANK_DOOR_FRAME_RECTS = [
  { x: 12, y: 39, width: 111, height: 176 },
  { x: 128, y: 39, width: 113, height: 176 },
  { x: 246, y: 39, width: 111, height: 175 },
  { x: 362, y: 39, width: 112, height: 176 },
  { x: 479, y: 39, width: 111, height: 176 },
]

const BANK_ROOM_DOOR_FRAME_RECTS = [
  { x: 19, y: 38, width: 103, height: 150 },
  { x: 135, y: 38, width: 103, height: 150 },
  { x: 251, y: 38, width: 103, height: 150 },
  { x: 366, y: 38, width: 103, height: 150 },
  { x: 480, y: 38, width: 103, height: 150 },
]

const SUPPLY_SHUTTER_FRAME_RECTS = [
  { x: 12, y: 9, width: 114, height: 223 },
  { x: 128, y: 9, width: 114, height: 223 },
  { x: 245, y: 9, width: 113, height: 223 },
  { x: 361, y: 9, width: 114, height: 223 },
  { x: 477, y: 9, width: 114, height: 223 },
]

const SUPPLY_ROOM_DOOR_FRAME_RECTS = [
  { x: 19, y: 22, width: 108, height: 197 },
  { x: 134, y: 22, width: 109, height: 197 },
  { x: 250, y: 22, width: 109, height: 197 },
  { x: 367, y: 22, width: 107, height: 197 },
  { x: 482, y: 22, width: 108, height: 197 },
]

const LEVELS = {
  1: {
    name: 'Terminal Bay',
    arenaTheme: 'datacenter',
    bg: './img/map/datacenter/backgroundLevel1.jpg?v=clean-room',
    grid: collisionsLevel1,
    collisionShapes: collisionShapesLevel1,
    sourceSize: { width: 1376, height: 768 },
    spawn: { x: 200, y: 200 },
    door: { x: 767, y: 300 },
    doorImageSrc: './img/map/datacenter/doorOpenpc.png',
    doorSize: { width: 94, height: 110 },
    enemyFloorY: 546,
    enemySpawnBounds: { left: 165, right: 1210 },
    pigs: 2,
  },
  2: {
    name: 'Server Shaft',
    arenaTheme: 'datacenter',
    bg: './img/map/datacenter/backgroundLevel2.jpg',
    grid: collisionsLevel2,
    collisionShapes: collisionShapesLevel2,
    sourceSize: { width: 1029, height: 768 },
    spawn: { x: 140, y: 110 },
    door: { x: 760, y: 342 },
    doorImageSrc: './img/map/datacenter/doorOpenpc.png',
    doorSize: { width: 94, height: 110 },
    enemyFloorY: 676,
    enemySpawnBounds: { left: 110, right: 710 },
    pigs: 3,
  },
  3: {
    name: 'Control Deck',
    arenaTheme: 'datacenter',
    bg: './img/map/datacenter/backgroundLevel3.jpg',
    grid: collisionsLevel3,
    collisionShapes: collisionShapesLevel3,
    sourceSize: { width: 1024, height: 576 },
    spawn: { x: 124, y: 416 },
    door: { x: 145, y: 100 },
    doorImageSrc: './img/map/datacenter/doorOpenpc.png',
    doorSize: { width: 94, height: 110 },
    enemyPlacements: [
      { x: 610, floorY: 420, patrolLeft: 528, patrolRight: 744 },
      { x: 810, floorY: 360, patrolLeft: 760, patrolRight: 960, grenu: true },
    ],
    pigs: 2,
  },
  4: {
    name: 'Office Wing',
    arenaTheme: 'bbcorp',
    bg: './img/map/bbcorp/backgroundLevel4.jpg',
    grid: collisionsLevel4,
    collisionShapes: collisionShapesLevel4,
    sourceSize: { width: 1376, height: 768 },
    door: { x: 90, y: 126 },
    doorImageSrc: './img/map/bbcorp/doorOpencc.png',
    doorSize: { width: 76, height: 90 },
    enemyPlacements: [
      { x: 340, floorY: 390, patrolLeft: 300, patrolRight: 432 },
      { x: 520, floorY: 500, patrolLeft: 475, patrolRight: 635 },
      { x: 680, floorY: 500, patrolLeft: 635, patrolRight: 890 },
    ],
    spawn: { x: 738, y: 410 },
    spawnDirection: 'left',
    pigs: 3,
  },
  5: {
    name: 'Executive Floor',
    arenaTheme: 'bbcorp',
    bg: './img/map/bbcorp/backgroundLevel5.jpg?v=1',
    grid: collisionsLevel5,
    collisionShapes: collisionShapesLevel5,
    sourceSize: { width: 1376, height: 768 },
    door: { x: 850, y: 168 },
    doorImageSrc: './img/map/bbcorp/doorOpencc.png',
    doorSize: { width: 76, height: 90 },
    enemyPlacements: [
      { x: 530, floorY: 540, patrolLeft: 480, patrolRight: 630 },
      { x: 700, floorY: 540, patrolLeft: 640, patrolRight: 780 },
      { x: 820, floorY: 540, patrolLeft: 790, patrolRight: 900 },
    ],
    spawn: { x: 112, y: 130 },
    pigs: 3,
  },
  6: {
    name: 'BB Corp Street',
    arenaTheme: 'mainroad',
    bg: './img/map/mainroad/backgroundLevel6.jpg?v=1',
    grid: collisionsLevel6,
    collisionShapes: collisionShapesLevel6,
    sourceSize: { width: 1376, height: 768 },
    door: null,
    edgeExits: { left: 7, right: 10 },
    enemyPlacements: [
      { x: 460, floorY: 588, patrolLeft: 320, patrolRight: 720, nyrmed: true },
      { x: 840, floorY: 660, patrolLeft: 785, patrolRight: 920 },
      { x: 1140, floorY: 588, patrolLeft: 955, patrolRight: 1265, grenu: true },
    ],
    spawn: { x: 185, y: 330 },
    spawnDirection: 'right',
    returnSpawn: { x: 835, y: 354 },
    returnDirection: 'left',
    returnLeftSpawn: { x: 24, y: 354 },
    returnLeftDirection: 'right',
    returnRightSpawn: { x: 835, y: 354 },
    returnRightDirection: 'left',
    pigs: 3,
  },
  7: {
    name: 'Net Cafe Street',
    arenaTheme: 'mainroad',
    bg: './img/map/mainroad/backgroundLevel6left.jpg?v=1',
    grid: collisionsLevel6Left,
    collisionShapes: collisionShapesLevel6Left,
    sourceSize: { width: 1376, height: 768 },
    edgeExits: { right: 6, allowRightWhenLocked: true },
    doors: [
      {
        x: 396,
        y: 343,
        target: 'next',
        doorLabel: 'NET CAFE',
        imageSrc: './img/map/netcafe/doorOpencafe.png?v=2',
        doorSize: { width: 46, height: 70 },
        doorFrameRects: CAFE_DOOR_FRAME_RECTS,
        solidDoor: true,
      },
      {
        x: 84,
        y: 346,
        target: 'room',
        targetRoom: 15,
        doorLabel: 'SUPPLY',
        imageSrc: './img/map/supply/doorOpensupply.png?v=1',
        doorSize: { width: 73, height: 69 },
        doorFrameRects: SUPPLY_SHUTTER_FRAME_RECTS,
        solidDoor: true,
      },
    ],
    solidDoor: true,
    enemyPlacements: [
      { x: 260, floorY: 616, patrolLeft: 120, patrolRight: 420, grenu: true },
      { x: 560, floorY: 616, patrolLeft: 440, patrolRight: 780, nyrmed: true },
      { x: 900, floorY: 616, patrolLeft: 790, patrolRight: 1120 },
    ],
    spawn: { x: 838, y: 375 },
    spawnDirection: 'left',
    returnSpawn: { x: 356, y: 375 },
    returnDirection: 'right',
    supplyReturnSpawn: { x: 40, y: 375 },
    supplyReturnDirection: 'right',
    pigs: 3,
  },
  8: {
    name: 'Net Cafe Lobby',
    arenaTheme: 'netcafe',
    bg: './img/map/netcafe/backgroundLevelcafe.jpg?v=1',
    grid: collisionsLevelCafe,
    collisionShapes: collisionShapesLevelCafe,
    sourceSize: { width: 1376, height: 768 },
    worldScale: 1.4,
    doors: [
      {
        x: 312,
        y: 429,
        imageSrc: './img/map/netcafe/doorOpencafe.png?v=2',
        doorSize: { width: 39, height: 58 },
        doorFrameRects: CAFE_DOOR_FRAME_RECTS,
        target: 'prev',
        allowWhenLocked: true,
      },
      {
        x: 886,
        y: 130,
        imageSrc: './img/map/netcafe/doorOpencafe.png?v=2',
        doorSize: { width: 39, height: 59 },
        doorFrameRects: CAFE_DOOR_FRAME_RECTS,
        target: 'next',
      },
    ],
    solidDoor: true,
    enemyPlacements: [
      { x: 850, floorY: 650, patrolLeft: 620, patrolRight: 1100 },
      { x: 260, floorY: 448, patrolLeft: 100, patrolRight: 560, grenu: true },
      { x: 930, floorY: 448, patrolLeft: 810, patrolRight: 1120, nyrmed: true },
    ],
    spawn: { x: 266, y: 422 },
    spawnDirection: 'right',
    returnSpawn: { x: 852, y: 124 },
    returnDirection: 'left',
    pigs: 3,
  },
  9: {
    name: 'Net Cafe Staff Room',
    arenaTheme: 'netcafe',
    bg: './img/map/netcafe/backgroundLevelcafe2.jpg?v=1',
    grid: collisionsLevelCafe2,
    collisionShapes: collisionShapesLevelCafe2,
    sourceSize: { width: 1376, height: 768 },
    worldScale: 1.4,
    doors: [
      {
        x: 128,
        y: 99,
        imageSrc: './img/map/netcafe/doorOpencafe.png?v=2',
        doorSize: { width: 42, height: 54 },
        doorFrameRects: CAFE_DOOR_FRAME_RECTS,
        target: 'prev',
        allowWhenLocked: true,
      },
      {
        x: 876,
        y: 438,
        imageSrc: './img/map/netcafe/doorOpencafe.png?v=2',
        doorSize: { width: 38, height: 69 },
        doorFrameRects: CAFE_DOOR_FRAME_RECTS,
        target: 'loop',
      },
    ],
    solidDoor: true,
    bossPlacement: { x: 760, floorY: 676, patrolLeft: 500, patrolRight: 1080 },
    enemyPlacements: [
      { x: 250, floorY: 492, patrolLeft: 110, patrolRight: 520, grenu: true },
      { x: 900, floorY: 416, patrolLeft: 720, patrolRight: 1085, nyrmed: true },
      { x: 560, floorY: 676, patrolLeft: 140, patrolRight: 1120 },
    ],
    spawn: { x: 91, y: 90 },
    spawnDirection: 'right',
    pigs: 3,
  },
  10: {
    name: 'East Main Road',
    arenaTheme: 'mainroad',
    bg: './img/map/mainroad/backgroundLevel6right.jpg?v=1',
    grid: collisionsLevel6Right,
    collisionShapes: collisionShapesLevel6Right,
    sourceSize: { width: 1376, height: 768 },
    edgeExits: { left: 6, allowLeftWhenLocked: true },
    doors: [
      {
        x: 404,
        y: 356,
        target: 'next',
        doorLabel: 'HOSPITAL',
        imageSrc: './img/map/hospital/slidingdoorOpenhospital.png?v=1',
        doorSize: { width: 97, height: 71 },
        doorFrameRects: HOSPITAL_SLIDING_DOOR_RECTS,
        solidDoor: true,
      },
      {
        x: 833,
        y: 342,
        target: 'room',
        targetRoom: 13,
        doorLabel: 'BANK',
        imageSrc: './img/map/bank/doorOpenbank.png?v=1',
        doorSize: { width: 68, height: 70 },
        doorFrameRects: BANK_DOOR_FRAME_RECTS,
        solidDoor: true,
      },
    ],
    solidDoor: true,
    enemyPlacements: [
      { x: 620, floorY: 616, patrolLeft: 260, patrolRight: 1100, grenu: true },
      { x: 860, floorY: 616, patrolLeft: 640, patrolRight: 1080, nyrmed: true },
      { x: 1120, floorY: 616, patrolLeft: 960, patrolRight: 1240 },
    ],
    spawn: { x: 830, y: 375 },
    spawnDirection: 'left',
    returnSpawn: { x: 404, y: 375 },
    returnDirection: 'right',
    bankReturnSpawn: { x: 786, y: 375 },
    bankReturnDirection: 'left',
    pigs: 3,
  },
  11: {
    name: 'Hospital Wing',
    arenaTheme: 'hospital',
    bg: './img/map/hospital/backgroundLevelhospital.jpg?v=2',
    grid: collisionsLevelHospital,
    collisionShapes: collisionShapesLevelHospital,
    sourceSize: { width: 1376, height: 768 },
    worldScale: 1.4,
    doors: [
      {
        x: 143,
        y: 281,
        imageSrc: './img/map/hospital/slidingdoorOpenhospital.png?v=1',
        doorSize: { width: 119, height: 81 },
        doorFrameRects: HOSPITAL_SLIDING_DOOR_RECTS,
        target: 'prev',
        allowWhenLocked: true,
      },
      {
        x: 905,
        y: 463,
        imageSrc: './img/map/hospital/doorOpenhospital.jpg?v=1',
        doorSize: { width: 30, height: 52 },
        doorFrameRects: HOSPITAL_DOOR_FRAME_RECTS,
        target: 'next',
      },
    ],
    solidDoor: true,
    enemyPlacements: [
      { x: 560, floorY: 696, patrolLeft: 280, patrolRight: 860 },
      { x: 920, floorY: 416, patrolLeft: 760, patrolRight: 1090, grenu: true },
      { x: 960, floorY: 214, patrolLeft: 750, patrolRight: 1220, nyrmed: true },
    ],
    spawn: { x: 130, y: 292 },
    spawnDirection: 'right',
    returnSpawn: { x: 855, y: 454 },
    returnDirection: 'left',
    pigs: 3,
  },
  12: {
    name: 'Hospital Upper Floors',
    arenaTheme: 'hospital',
    bg: './img/map/hospital/backgroundLevelhospital2.jpg?v=1',
    grid: collisionsLevelHospital2,
    collisionShapes: collisionShapesLevelHospital2,
    sourceSize: { width: 1376, height: 768 },
    worldScale: 1.4,
    doors: [
      {
        x: 889,
        y: 111,
        imageSrc: './img/map/hospital/doorOpenhospital.jpg?v=1',
        doorSize: { width: 38, height: 60 },
        doorFrameRects: HOSPITAL_DOOR_FRAME_RECTS,
        target: 'prev',
        allowWhenLocked: true,
      },
      {
        x: 902,
        y: 462,
        imageSrc: './img/map/hospital/doorOpenhospital.jpg?v=1',
        doorSize: { width: 34, height: 53 },
        doorFrameRects: HOSPITAL_DOOR_FRAME_RECTS,
        target: 'loop',
      },
    ],
    solidDoor: true,
    enemyPlacements: [
      { x: 420, floorY: 692, patrolLeft: 120, patrolRight: 760, grenu: true },
      { x: 280, floorY: 500, patrolLeft: 100, patrolRight: 660 },
      { x: 460, floorY: 234, patrolLeft: 120, patrolRight: 820, nyrmed: true },
    ],
    spawn: { x: 850, y: 112 },
    spawnDirection: 'left',
    pigs: 3,
  },
  13: {
    name: 'Bank',
    arenaTheme: 'bank',
    bg: './img/map/bank/backgroundLevelbank.jpg?v=1',
    grid: collisionsLevelBank,
    collisionShapes: collisionShapesLevelBank,
    sourceSize: { width: 1376, height: 768 },
    worldScale: 1.4,
    solidDoor: true,
    doors: [
      {
        x: 77,
        y: 384,
        target: 'room',
        targetRoom: 10,
        returnSpawnKey: 'bankReturnSpawn',
        returnDirectionKey: 'bankReturnDirection',
        allowWhenLocked: true,
        doorLabel: 'EXIT',
        imageSrc: './img/map/bank/doorOpenbank.png?v=1',
        doorSize: { width: 72, height: 74 },
        doorFrameRects: BANK_DOOR_FRAME_RECTS,
        solidDoor: true,
      },
      {
        x: 842,
        y: 108,
        target: 'next',
        doorLabel: 'MANAGEMENT',
        imageSrc: './img/map/bank/doorOpenbankroom.png?v=1',
        doorSize: { width: 55, height: 83 },
        doorFrameRects: BANK_ROOM_DOOR_FRAME_RECTS,
        solidDoor: true,
      },
    ],
    enemyPlacements: [
      { x: 760, floorY: 616, patrolLeft: 320, patrolRight: 1180, grenu: true },
      { x: 340, floorY: 442, patrolLeft: 140, patrolRight: 520 },
      { x: 940, floorY: 252, patrolLeft: 730, patrolRight: 1200, nyrmed: true },
    ],
    spawn: { x: 80, y: 398 },
    spawnDirection: 'right',
    returnSpawn: { x: 800, y: 126 },
    returnDirection: 'left',
    pigs: 3,
  },
  14: {
    name: 'Bank Upper Floors',
    arenaTheme: 'bank',
    bg: './img/map/bank/backgroundLevelbank2.jpg?v=1',
    grid: collisionsLevelBank2,
    collisionShapes: collisionShapesLevelBank2,
    sourceSize: { width: 1376, height: 768 },
    worldScale: 1.4,
    solidDoor: true,
    doors: [
      {
        x: 285,
        y: 108,
        target: 'prev',
        allowWhenLocked: true,
        doorLabel: 'EXIT',
        imageSrc: './img/map/bank/doorOpenbankroom.png?v=1',
        doorSize: { width: 59, height: 82 },
        doorFrameRects: BANK_ROOM_DOOR_FRAME_RECTS,
        solidDoor: true,
      },
      {
        x: 837,
        y: 108,
        target: 'loop',
        doorLabel: 'EXIT',
        imageSrc: './img/map/bank/doorOpenbankroom.png?v=1',
        doorSize: { width: 60, height: 82 },
        doorFrameRects: BANK_ROOM_DOOR_FRAME_RECTS,
        solidDoor: true,
      },
    ],
    bossPlacement: { x: 820, floorY: 442, patrolLeft: 420, patrolRight: 1180 },
    enemyPlacements: [
      { x: 900, floorY: 442, patrolLeft: 420, patrolRight: 1180, nyrmed: true },
      { x: 240, floorY: 616, patrolLeft: 120, patrolRight: 580, grenu: true },
      { x: 960, floorY: 616, patrolLeft: 800, patrolRight: 1200 },
    ],
    spawn: { x: 257, y: 126 },
    spawnDirection: 'right',
    pigs: 3,
  },
  15: {
    name: 'Corp Supply',
    arenaTheme: 'supply',
    bg: './img/map/supply/backgroundLevelsupply.jpg?v=1',
    grid: collisionsLevelSupply,
    collisionShapes: collisionShapesLevelSupply,
    sourceSize: { width: 1376, height: 768 },
    worldScale: 1.4,
    solidDoor: true,
    doors: [
      {
        x: 80,
        y: 345,
        target: 'room',
        targetRoom: 7,
        returnSpawnKey: 'supplyReturnSpawn',
        returnDirectionKey: 'supplyReturnDirection',
        allowWhenLocked: true,
        doorLabel: 'EXIT',
        imageSrc: './img/map/supply/doorOpensupply.png?v=1',
        doorSize: { width: 78, height: 114 },
        doorFrameRects: SUPPLY_SHUTTER_FRAME_RECTS,
        solidDoor: true,
      },
      {
        x: 319,
        y: 205,
        target: 'next',
        doorLabel: 'MANAGEMENT',
        imageSrc: './img/map/supply/doorOpensupplyroom.png?v=1',
        doorSize: { width: 56, height: 69 },
        doorFrameRects: SUPPLY_ROOM_DOOR_FRAME_RECTS,
        solidDoor: true,
      },
    ],
    enemyPlacements: [
      { x: 560, floorY: 612, patrolLeft: 260, patrolRight: 1120, grenu: true },
      { x: 240, floorY: 360, patrolLeft: 110, patrolRight: 620 },
      { x: 1060, floorY: 276, patrolLeft: 910, patrolRight: 1260, nyrmed: true },
    ],
    spawn: { x: 61, y: 396 },
    spawnDirection: 'right',
    returnSpawn: { x: 288, y: 204 },
    returnDirection: 'right',
    pigs: 3,
  },
  16: {
    name: 'Corp Supply Management',
    arenaTheme: 'supply',
    bg: './img/map/supply/backgroundLevelsupply2.jpg?v=1',
    grid: collisionsLevelSupply2,
    collisionShapes: collisionShapesLevelSupply2,
    sourceSize: { width: 1376, height: 768 },
    worldScale: 1.4,
    solidDoor: true,
    doors: [
      {
        x: 710,
        y: 140,
        target: 'prev',
        allowWhenLocked: true,
        doorLabel: 'EXIT',
        imageSrc: './img/map/supply/doorOpensupplyroom.png?v=1',
        doorSize: { width: 53, height: 71 },
        doorFrameRects: SUPPLY_ROOM_DOOR_FRAME_RECTS,
        solidDoor: true,
      },
      {
        x: 97,
        y: 187,
        target: 'loop',
        doorLabel: 'EXIT',
        imageSrc: './img/map/supply/doorOpensupplyroom.png?v=1',
        doorSize: { width: 60, height: 89 },
        doorFrameRects: SUPPLY_ROOM_DOOR_FRAME_RECTS,
        solidDoor: true,
      },
    ],
    bossPlacement: { x: 680, floorY: 612, patrolLeft: 620, patrolRight: 920 },
    enemyPlacements: [
      { x: 680, floorY: 612, patrolLeft: 625, patrolRight: 920, nyrmed: true },
      { x: 1080, floorY: 444, patrolLeft: 910, patrolRight: 1260, grenu: true },
      { x: 1120, floorY: 668, patrolLeft: 1000, patrolRight: 1260 },
    ],
    spawn: { x: 678, y: 148 },
    spawnDirection: 'left',
    pigs: 3,
  },
}

let level = 1
let mode = 'menu' // 'menu' | 'explore' | 'intro' | 'battle' | 'end'
let grace = 0 // frames before a pig can start a battle (after loading or retrying)
let introT = 0
let snapshot = null
let collisionBlocks
let background
let doors = []
let enemies = []
let dashboardView = 'quest'
let playViewActive = false
let skillTreeOpen = false
let skillTreeReturnFocus = null
let skillTreeStarted = false
let selectedSkillNode = null
let worldMapOpen = false
let worldMapReturnFocus = null
let selectedWorldMapRoom = null
const visitedRooms = new Set()
let skillMapPan = null
const SKILL_MAP_ZOOM_OUT_POINTS = 5
const SKILL_MAP_MIN_ZOOM = 0.55
const SKILL_MAP_MAX_ZOOM = 2.4
const battleKing = new Sprite({
  position: { x: 0, y: 0 },
  imageSrc: './img/player/player1-idle-trimmed.png',
  frameRate: 12,
  frameBuffer: IDLE_TICKS,
  sourceFrameSize: { width: 256, height: 256 },
  frameColumns: 5,
  frameCount: 12,
  frameCrop: { x: 35, y: 40, width: 190, height: 180 },
  destinationSize: { width: 76, height: 72 },
})
const battleKingDeath = new Sprite({
  position: { x: 0, y: 0 },
  imageSrc: './img/player/player1-death.png',
  frameRate: 6,
  frameBuffer: 10,
  loop: false,
  autoplay: false,
  frameRects: [
    { x: 0, y: 0, width: 150, height: 164 },
    { x: 150, y: 0, width: 150, height: 164 },
    { x: 300, y: 0, width: 150, height: 164 },
    { x: 450, y: 0, width: 150, height: 164 },
    { x: 0, y: 166, width: 150, height: 164 },
    { x: 150, y: 166, width: 150, height: 164 },
  ],
  frameCount: 6,
  destinationSize: { width: 70, height: 76 },
})
const opponentKing = new Sprite({
  position: { x: 0, y: 0 },
  imageSrc: './img/player/player1-idle-trimmed.png',
  frameRate: 12,
  frameBuffer: IDLE_TICKS,
  sourceFrameSize: { width: 256, height: 256 },
  frameColumns: 5,
  frameCount: 12,
  frameCrop: { x: 35, y: 40, width: 190, height: 180 },
  destinationSize: { width: 76, height: 72 },
  flipX: true,
})
const opponentKingDeath = new Sprite({
  position: { x: 0, y: 0 },
  imageSrc: './img/player/player1-death.png',
  frameRate: 6,
  frameBuffer: 10,
  loop: false,
  autoplay: false,
  frameRects: [
    { x: 0, y: 0, width: 150, height: 164 },
    { x: 150, y: 0, width: 150, height: 164 },
    { x: 300, y: 0, width: 150, height: 164 },
    { x: 450, y: 0, width: 150, height: 164 },
    { x: 0, y: 166, width: 150, height: 164 },
    { x: 150, y: 166, width: 150, height: 164 },
  ],
  frameCount: 6,
  destinationSize: { width: 70, height: 76 },
  flipX: true,
})

const BATTLE_ATTACK_JUMP_OFFSETS = [0, -12, -42, -27, -8, 0, 0, 0]
// The hero's attack hop steps through one offset every BATTLE_ATTACK_FRAME_BUFFER ticks.
const BATTLE_ATTACK_FRAME_COUNT = BATTLE_ATTACK_JUMP_OFFSETS.length
const BATTLE_ATTACK_FRAME_BUFFER = 6

const keys = {
  w: { pressed: false },
  a: { pressed: false },
  d: { pressed: false },
}

const overlay = { opacity: 0 }

const isSolid = (v) => v === 292 || v === 250

// Finds walkable tops of solid blocks that share an open space with the king.
function findPlatforms(grid, spawn) {
  const runs = []
  const solid = (row, col) =>
    row >= 0 &&
    row < grid.length &&
    col >= 0 &&
    col < grid[row].length &&
    isSolid(grid[row][col])
  const startCol = Math.max(0, Math.min(grid[0].length - 1, Math.floor((spawn.x + 83) / 64)))
  const startRow = Math.max(0, Math.min(grid.length - 1, Math.floor((spawn.y + 60) / 64)))
  const reachable = new Set([`${startRow},${startCol}`])
  const queue = [[startRow, startCol]]
  for (let i = 0; i < queue.length; i++) {
    const [row, col] = queue[i]
    const moves = [[-1, 0], [1, 0], [0, -1], [0, 1]]
    for (let dr = -4; dr < 0; dr++) {
      for (let dc = -5; dc <= 5; dc++) {
        if (dc === 0 && dr === -1) continue
        const targetRow = row + dr
        const targetCol = col + dc
        const inGrid =
          targetRow >= 0 &&
          targetRow < grid.length &&
          targetCol >= 0 &&
          targetCol < grid[targetRow].length
        if (!inGrid || solid(targetRow, targetCol)) continue
        const clearColumn = [row, targetRow].sort((a, b) => a - b).every((checkRow) =>
          !solid(checkRow, targetCol)
        )
        if (clearColumn) moves.push([dr, dc])
      }
    }
    for (const [dr, dc] of moves) {
      const nextRow = row + dr
      const nextCol = col + dc
      const key = `${nextRow},${nextCol}`
      const inGrid =
        nextRow >= 0 &&
        nextRow < grid.length &&
        nextCol >= 0 &&
        nextCol < grid[nextRow].length
      if (inGrid && !solid(nextRow, nextCol) && !reachable.has(key)) {
        reachable.add(key)
        queue.push([nextRow, nextCol])
      }
    }
  }

  for (let r = 1; r < grid.length; r++) {
    let start = -1
    for (let col = 0; col <= grid[r].length; col++) {
      const top =
        col < grid[r].length &&
        isSolid(grid[r][col]) &&
        !isSolid(grid[r - 1][col]) &&
        reachable.has(`${r - 1},${col}`)
      if (top && start < 0) start = col
      if (!top && start >= 0) {
        if (col - start >= 3) runs.push({ row: r, c1: start, c2: col - 1 })
        start = -1
      }
    }
  }
  return runs.sort((a, b) => b.c2 - b.c1 - (a.c2 - a.c1))
}

// ===== Run structure =====
// Each 16-room loop branches via BB Corp Street (06) to Left Street (07 -> Net Cafe 08-09 & Corp Supply 15-16) and Right Street (10 -> Hospital 11-12 & Bank 13-14); King Crolue guards all 4 branch finales.
const RUN_LENGTH = 32   // 2 full loops; completing any branch on loop 2 wins the run (0 = endless)
const ROOM_COUNT = Object.keys(LEVELS).length

function levelConfig(n) {
  const baseRoom = ((n - 1) % ROOM_COUNT) + 1
  const base = LEVELS[baseRoom]
  const cycle = Math.floor((n - 1) / ROOM_COUNT)
  const grenuBoss = baseRoom === 3 && cycle === 1
  const korBoss = baseRoom === 5
  const isFinalRoom = baseRoom === 9 || baseRoom === 12 || baseRoom === 14 || baseRoom === 16 || (Boolean(RUN_LENGTH) && n === RUN_LENGTH)
  const boss = isFinalRoom || korBoss || grenuBoss
  return {
    ...base,
    name: boss
      ? (isFinalRoom
        ? `Final Boss · ${typeof FINAL_BOSS_NAME !== 'undefined' ? FINAL_BOSS_NAME : 'King Crolue'}: ${base.name}`
        : grenuBoss
          ? `Mini Boss Grenu: ${base.name}`
          : `Mini Boss Kor: ${base.name}`)
      : cycle
        ? `${base.name} ${cycle + 1}`
        : base.name,
    cycle,
    boss,
    korBoss,
    grenuBoss,
    final: isFinalRoom,
    pigs: boss ? 1 : base.pigs,
  }
}

let currentRoom = levelConfig(1)

// Music follows the situation: exploring, a normal battle, or a boss.
function resumeMusic() {
  if (!playViewActive) {
    Sound.music('dashboard')
    return
  }
  if (mode === 'battle' || mode === 'intro') {
    Sound.music(battle.enemy && battle.enemy.isBoss ? 'boss' : 'battle')
  } else if (mode === 'explore') {
    Sound.music('explore')
  } else {
    Sound.music(null)
  }
}

// Boss rooms get one boss; later passes through the rooms have tougher foes.
function spawnEnemies(cfg, floorRun, scaleX, scaleY) {
  const hpScale = 1 + 0.2 * cfg.cycle
  const attackScale = 1 + 0.1 * cfg.cycle
  if (cfg.boss) {
    const boss = new Boss(floorRun, cfg.final, { grenu: Boolean(cfg.grenuBoss) })
    const placement = cfg.bossPlacement || (cfg.enemyPlacements && cfg.enemyPlacements[0])
    if (placement) {
      boss.minX = placement.patrolLeft * scaleX
      boss.maxX = placement.patrolRight * scaleX - boss.w
      boss.x = placement.x * scaleX
      boss.y = placement.floorY * scaleY - boss.h
    } else if (cfg.enemySpawnBounds) {
      boss.minX = cfg.enemySpawnBounds.left * scaleX
      boss.maxX = cfg.enemySpawnBounds.right * scaleX - boss.w
      boss.x = (boss.minX + boss.maxX) / 2
      if (cfg.enemyFloorY) boss.y = cfg.enemyFloorY * scaleY - boss.h
    }
    boss.scaleStats(hpScale, attackScale)
    return [boss]
  }
  return Array.from({ length: cfg.pigs }, (_, i) => {
    const placement = cfg.enemyPlacements && cfg.enemyPlacements[i]
    const enemy = new Enemy(floorRun, i, { nyrmed: Boolean(placement?.nyrmed), grenu: Boolean(placement?.grenu) })
    if (placement) {
      enemy.minX = placement.patrolLeft * scaleX
      enemy.maxX = placement.patrolRight * scaleX - enemy.w
      enemy.x = placement.x * scaleX
      enemy.y = placement.floorY * scaleY - enemy.h
    } else if (cfg.enemySpawnBounds) {
      enemy.minX = cfg.enemySpawnBounds.left * scaleX
      enemy.maxX = cfg.enemySpawnBounds.right * scaleX - enemy.w
      enemy.x = enemy.minX + ((i + 1) / (cfg.pigs + 1)) * (enemy.maxX - enemy.minX)
    } else {
      enemy.x = enemy.minX + ((i + 1) / (cfg.pigs + 1)) * (enemy.maxX - enemy.minX)
    }
    if (!placement && cfg.enemyFloorY) enemy.y = cfg.enemyFloorY * scaleY - enemy.h
    enemy.scaleStats(hpScale, attackScale)
    return enemy
  })
}

const exploreCamera = {
  x: 0,
  y: 0,
  worldWidth: canvas.width,
  worldHeight: canvas.height,
}
let pendingDoorTarget = 'next'
let pendingDoorMeta = null
let hoveredExploreDoor = null
const clearedRooms = new Set()

function clampCameraAxis(pos, viewSize, worldSize) {
  const maxOffset = Math.max(0, worldSize - viewSize)
  return Math.max(0, Math.min(pos, maxOffset))
}

function focusPointForExploreCamera() {
  const h = player.hitbox
  if (h) {
    return {
      x: h.position.x + h.width * 0.5,
      y: h.position.y + h.height * 0.5,
    }
  }
  return {
    x: player.position.x + (player.width || 64) * 0.5,
    y: player.position.y + (player.height || 64) * 0.5,
  }
}

function resetExploreCamera(cfg) {
  const worldScale = cfg?.worldScale || 1
  exploreCamera.worldWidth = Math.round(canvas.width * worldScale)
  exploreCamera.worldHeight = Math.round(canvas.height * worldScale)
  if (exploreCamera.worldWidth <= canvas.width && exploreCamera.worldHeight <= canvas.height) {
    exploreCamera.x = 0
    exploreCamera.y = 0
    return
  }
  const focus = focusPointForExploreCamera()
  exploreCamera.x = clampCameraAxis(focus.x - canvas.width * 0.5, canvas.width, exploreCamera.worldWidth)
  exploreCamera.y = clampCameraAxis(focus.y - canvas.height * 0.5, canvas.height, exploreCamera.worldHeight)
}

function updateExploreCamera() {
  if (exploreCamera.worldWidth <= canvas.width && exploreCamera.worldHeight <= canvas.height) {
    exploreCamera.x = 0
    exploreCamera.y = 0
    return
  }
  const focus = focusPointForExploreCamera()
  const deadLeft = canvas.width * 0.34
  const deadRight = canvas.width * 0.66
  const deadTop = canvas.height * 0.3
  const deadBottom = canvas.height * 0.68
  const screenX = focus.x - exploreCamera.x
  const screenY = focus.y - exploreCamera.y
  let targetX = exploreCamera.x
  let targetY = exploreCamera.y
  if (screenX < deadLeft) targetX = focus.x - deadLeft
  else if (screenX > deadRight) targetX = focus.x - deadRight
  if (screenY < deadTop) targetY = focus.y - deadTop
  else if (screenY > deadBottom) targetY = focus.y - deadBottom
  targetX = clampCameraAxis(targetX, canvas.width, exploreCamera.worldWidth)
  targetY = clampCameraAxis(targetY, canvas.height, exploreCamera.worldHeight)
  const ease = 0.16
  exploreCamera.x += (targetX - exploreCamera.x) * ease
  exploreCamera.y += (targetY - exploreCamera.y) * ease
  if (Math.abs(targetX - exploreCamera.x) < 0.5) exploreCamera.x = targetX
  if (Math.abs(targetY - exploreCamera.y) < 0.5) exploreCamera.y = targetY
}

function loadLevel(n, options = {}) {
  const go = document.getElementById('gameOverOverlay')
  if (go) {
    go.hidden = true
    go.innerHTML = ''
  }
  const spBanner = document.getElementById('spEarnedBanner')
  if (spBanner) spBanner.hidden = true
  window.clearTimeout(spEarnedBannerTimer)
  spEarnedBannerTimer = 0
  const cfg = levelConfig(n)
  level = n
  visitedRooms.add(((n - 1) % ROOM_COUNT) + 1)
  currentRoom = cfg
  if (typeof setArenaTheme === 'function') setArenaTheme(cfg.arenaTheme || 'datacenter')
  pendingDoorTarget = 'next'
  pendingDoorMeta = null
  hoveredExploreDoor = null
  stats.roomKills = 0
  const worldScale = cfg.worldScale || 1
  const worldWidth = Math.round(canvas.width * worldScale)
  const worldHeight = Math.round(canvas.height * worldScale)
  const grid = cfg.grid.parse2D()
  if (cfg.collisionShapes) {
    const scaleX = worldWidth / cfg.sourceSize.width
    const scaleY = worldHeight / cfg.sourceSize.height
    collisionBlocks = cfg.collisionShapes.map((shape) =>
      shape.type === 'slope'
        ? new CollisionBlock({
            id: shape.id,
            x1: shape.x1 * scaleX,
            y1: shape.y1 * scaleY,
            x2: shape.x2 * scaleX,
            y2: shape.y2 * scaleY,
            type: 'slope',
          })
        : new CollisionBlock({
            id: shape.id,
            position: { x: shape.x * scaleX, y: shape.y * scaleY },
            width: shape.width * scaleX,
            height: shape.height * scaleY,
            type: shape.type || 'solid',
          })
    )
  } else {
    collisionBlocks = grid.createObjectsFrom2D()
  }
  player.collisionBlocks = collisionBlocks
  player.worldBounds = cfg.collisionShapes
    ? { left: 0, top: 0, right: worldWidth, bottom: worldHeight }
    : null
  if (player.currentAnimation) player.currentAnimation.isActive = false
  const returnKey = options?.returnSpawnKey || 'returnSpawn'
  const returnDirKey = options?.returnDirectionKey || 'returnDirection'
  const useReturnSpawn = Boolean(options?.fromPrev && cfg[returnKey])
  const spawnPoint = options?.spawnOverride || (useReturnSpawn ? cfg[returnKey] : cfg.spawn)
  const spawnDir = options?.directionOverride || (useReturnSpawn ? (cfg[returnDirKey] || cfg.spawnDirection) : cfg.spawnDirection)
  const facingLeft = spawnDir === 'left'
  player.switchSprite(facingLeft ? 'idleLeft' : 'idleRight')
  player.lastDirection = facingLeft ? 'left' : 'right'
  player.preventInput = false
  player.position = {
    x: spawnPoint.x * worldScale,
    y: spawnPoint.y * worldScale,
  }
  player.velocity = { x: 0, y: 0 }
  if (typeof player.updateHitbox === 'function') player.updateHitbox()

  background = new Sprite({
    position: { x: 0, y: 0 },
    imageSrc: cfg.bg,
    destinationSize: { width: worldWidth, height: worldHeight },
  })
  const scaleX = cfg.sourceSize ? worldWidth / cfg.sourceSize.width : 1
  const scaleY = cfg.sourceSize ? worldHeight / cfg.sourceSize.height : 1
  const doorSpecs = Array.isArray(cfg.doors)
    ? cfg.doors
    : cfg.door
      ? [{
          ...cfg.door,
          imageSrc: cfg.doorImageSrc || './img/map/datacenter/doorOpenpc.png',
          doorSize: cfg.doorSize,
          doorFrameRects: cfg.doorFrameRects,
          target: 'next',
        }]
      : []
  doors = doorSpecs.map((spec) => {
    const sprite = new Sprite({
      position: { x: spec.x * worldScale, y: spec.y * worldScale },
      imageSrc: spec.imageSrc || spec.doorImageSrc || cfg.doorImageSrc || './img/map/datacenter/doorOpenpc.png',
      frameRate: 5,
      frameBuffer: 4,
      frameColumns: 5,
      frameCount: 5,
      frameRects: spec.doorFrameRects || cfg.doorFrameRects,
      loop: false,
      autoplay: false,
      destinationSize: spec.doorSize
        ? { width: spec.doorSize.width * worldScale, height: spec.doorSize.height * worldScale }
        : undefined,
    })
    sprite.target = spec.target || 'next'
    sprite.targetRoom = spec.targetRoom || null
    sprite.returnSpawnKey = spec.returnSpawnKey || null
    sprite.returnDirectionKey = spec.returnDirectionKey || null
    sprite.allowWhenLocked = Boolean(spec.allowWhenLocked || sprite.target === 'prev')
    sprite.doorLabel = spec.doorLabel || (sprite.target === 'prev' ? 'EXIT' : 'ENTER')
    return sprite
  })
  const hasExplicitPlacements = Boolean(cfg.enemyPlacements?.length || cfg.bossPlacement)
  let floorRun = null
  if (grid.length) {
    const maxPigWidth = PIG_W * 1.6
    const maxPigHeight = PIG_H * 1.6
    const playableRuns = findPlatforms(grid, cfg.spawn).filter((run) => {
      const minX = run.c1 * 64 + 8
      const maxX = (run.c2 + 1) * 64 - 8
      const y = run.row * 64 - maxPigHeight
      return (
        minX >= 0 &&
        maxX <= canvas.width &&
        maxX - minX >= maxPigWidth &&
        y >= 0 &&
        y + maxPigHeight <= canvas.height
      )
    })
    // The open-space scan can include ceilings, so place pigs on the lowest floor.
    const floorRow = Math.max(...playableRuns.map((run) => run.row))
    floorRun = playableRuns
      .filter((run) => run.row === floorRow)
      .sort((a, b) => b.c2 - b.c1 - (a.c2 - a.c1))[0]
  } else if (hasExplicitPlacements) {
    floorRun = { row: 7, c1: 1, c2: 14 }
  }
  if (!floorRun) throw new Error(`No walkable floor found for level ${n}`)
  enemies = spawnEnemies(cfg, floorRun, scaleX, scaleY)
  if (clearedRooms.has(n)) {
    enemies.forEach((enemy) => {
      enemy.alive = false
    })
    stats.roomKills = enemies.length
  }
  grace = 90;
  resetExploreCamera(cfg)

  mode = 'explore'
  renderExplore()
  Sound.music('explore')
  if (!options?.skipAutoSave) {
    resetExploreCheckpointTracker()
    saveCurrentRunSlot()
  }
}

function newGame() {
  if (!practiceRunActive && hasRecordableGameplayRun()) {
    submitLeaderboardRun({ skipReload: true })
  }
  resetRun()
  clearedRooms.clear()
  visitedRooms.clear()
  leaderboardRunId = createLeaderboardRunId()
  leaderboardRunSubmitted = false
  leaderboardLastSubmittedSnapshot = ''
  leaderboardState = supabaseCredentials() ? 'idle' : 'unconfigured'
  leaderboardError = ''
  loadLevel(1)
}

function nextLevel() {
  submitLeaderboardRun({ skipReload: true })
  if (enemies.length && enemies.every((e) => !e.alive)) {
    clearedRooms.add(level)
  }
  const followingLevel = level + 1
  if (!RUN_LENGTH || followingLevel <= RUN_LENGTH) {
    loadLevel(followingLevel)
  } else {
    mode = 'end'
    showVictory()
  }
  gsap.to(overlay, { opacity: 0 })
}

function prevLevel() {
  submitLeaderboardRun({ skipReload: true })
  if (enemies.length && enemies.every((e) => !e.alive)) {
    clearedRooms.add(level)
  }
  loadLevel(Math.max(1, level - 1), { fromPrev: true })
  gsap.to(overlay, { opacity: 0 })
}

function completeDoorTransition() {
  const target = pendingDoorTarget
  const meta = pendingDoorMeta
  pendingDoorTarget = 'next'
  pendingDoorMeta = null
  if (target === 'prev') {
    prevLevel()
    return
  }
  if (target === 'room' && meta?.targetRoom) {
    submitLeaderboardRun({ skipReload: true })
    if (enemies.length && enemies.every((e) => !e.alive)) {
      clearedRooms.add(level)
    }
    const cycleOffset = Math.floor((level - 1) / ROOM_COUNT) * ROOM_COUNT
    const destLevel = cycleOffset + meta.targetRoom
    const isReturn = Boolean(meta.returnSpawnKey && LEVELS[meta.targetRoom]?.[meta.returnSpawnKey])
    loadLevel(
      destLevel,
      isReturn
        ? {
            fromPrev: true,
            returnSpawnKey: meta.returnSpawnKey,
            returnDirectionKey: meta.returnDirectionKey,
          }
        : {}
    )
    gsap.to(overlay, { opacity: 0 })
    return
  }
  if (target === 'loop') {
    submitLeaderboardRun({ skipReload: true })
    if (enemies.length && enemies.every((e) => !e.alive)) {
      clearedRooms.add(level)
    }
    const nextCycleLevel = (Math.floor((level - 1) / ROOM_COUNT) + 1) * ROOM_COUNT + 1
    if (!RUN_LENGTH || nextCycleLevel <= RUN_LENGTH) {
      loadLevel(nextCycleLevel)
    } else {
      mode = 'end'
      showVictory()
    }
    gsap.to(overlay, { opacity: 0 })
    return
  }
  nextLevel()
}

// Doors stay locked until every pig in the room is defeated (except exit/return doors back to the street).
function getDoorAtPlayer() {
  const h = player.hitbox
  if (!h || !doors.length) return null
  const interactionPadding = 22
  return doors.find(
    (entry) =>
      h.position.x < entry.position.x + entry.width + interactionPadding &&
      h.position.x + h.width > entry.position.x - interactionPadding &&
      h.position.y < entry.position.y + entry.height + interactionPadding &&
      h.position.y + h.height > entry.position.y - interactionPadding
  ) || null
}

function updateHoveredExploreDoor(clientX, clientY) {
  if (mode !== 'explore' || !playViewActive || !canvas || !doors.length || player.preventInput) {
    hoveredExploreDoor = null
    if (canvas) canvas.style.cursor = ''
    return
  }
  const rect = canvas.getBoundingClientRect()
  if (!rect.width || !rect.height) {
    hoveredExploreDoor = null
    canvas.style.cursor = ''
    return
  }
  const worldX = ((clientX - rect.left) / rect.width) * canvas.width + (exploreCamera?.x || 0)
  const worldY = ((clientY - rect.top) / rect.height) * canvas.height + (exploreCamera?.y || 0)
  const pad = 8
  hoveredExploreDoor = doors.find(
    (entry) =>
      worldX >= entry.position.x - pad &&
      worldX <= entry.position.x + entry.width + pad &&
      worldY >= entry.position.y - pad &&
      worldY <= entry.position.y + entry.height + pad
  ) || null
  canvas.style.cursor = hoveredExploreDoor ? 'pointer' : ''
}

if (canvas) {
  canvas.addEventListener('mousemove', (e) => updateHoveredExploreDoor(e.clientX, e.clientY))
  canvas.addEventListener('mouseleave', () => {
    hoveredExploreDoor = null
    canvas.style.cursor = ''
  })
}

function drawDoorBubble(door, roomLocked) {
  if (!door) return
  const canEnter = Boolean(door.allowWhenLocked || !roomLocked)
  const text = canEnter ? `W / ↑ ${door.doorLabel || 'ENTER'}` : 'LOCKED'
  const bob = Math.sin(performance.now() / 220) * 2

  c.save()
  c.font = window.ByteboundFont.canvas(10)
  const textW = Math.ceil(c.measureText(text).width)
  const boxW = textW + 18
  const boxH = 20
  const doorCenterX = door.position.x + door.width * 0.5
  const minX = exploreCamera.x + 6
  const maxX = exploreCamera.x + canvas.width - boxW - 6
  const bx = Math.round(Math.max(minX, Math.min(doorCenterX - boxW * 0.5, maxX)))
  const by = Math.round(Math.max(exploreCamera.y + 6, door.position.y - boxH - 8 + bob))
  const tipX = Math.round(Math.max(bx + 7, Math.min(doorCenterX, bx + boxW - 7)))

  // Small pixel-art floating speech bubble above the door
  c.fillStyle = canEnter ? '#16202a' : '#26181e'
  c.strokeStyle = canEnter ? '#6ce392' : '#d87a7a'
  c.lineWidth = 2
  c.fillRect(bx, by, boxW, boxH)
  c.strokeRect(bx, by, boxW, boxH)

  // Bubble pointer tail
  c.fillStyle = canEnter ? '#6ce392' : '#d87a7a'
  c.beginPath()
  c.moveTo(tipX - 5, by + boxH)
  c.lineTo(tipX + 5, by + boxH)
  c.lineTo(tipX, by + boxH + 5)
  c.closePath()
  c.fill()
  c.fillStyle = canEnter ? '#16202a' : '#26181e'
  c.fillRect(tipX - 3, by + boxH - 1, 6, 2)

  // Status dot + prompt label
  c.fillStyle = canEnter ? '#6ce392' : '#e07a7a'
  c.fillRect(bx + 6, by + 7, 5, 5)
  c.fillStyle = canEnter ? '#f7efc8' : '#f4cccc'
  c.textBaseline = 'middle'
  c.fillText(text, bx + 14, by + boxH * 0.5 + 0.5)
  c.restore()
}

function tryDoor() {
  const door = getDoorAtPlayer()
  if (typeof window.ByteboundTutorial?.onTryDoor === 'function') {
    window.ByteboundTutorial.onTryDoor(Boolean(door))
  }
  if (!door) return false

  if (!door.allowWhenLocked && enemies.some((e) => e.alive)) {
    renderExplore('The door is locked. Defeat every virus in this room first.')
    return true
  }
  pendingDoorTarget = door.target || 'next'
  pendingDoorMeta = {
    targetRoom: door.targetRoom || null,
    returnSpawnKey: door.returnSpawnKey || null,
    returnDirectionKey: door.returnDirectionKey || null,
  }
  player.velocity = { x: 0, y: 0 }
  player.preventInput = true
  player.switchSprite('enterDoor')
  door.play()
  return true
}

function checkEncounter() {
  if (mode !== 'explore' || player.preventInput || grace > 0) return
  if (typeof window.ByteboundTutorial?.shouldHoldEncounter === 'function' && window.ByteboundTutorial.shouldHoldEncounter()) {
    return
  }
  const h = player.hitbox
  if (!h) return
  const foe = enemies.find(
    (e) =>
      e.alive &&
      h.position.x < e.x + e.w &&
      h.position.x + h.width > e.x &&
      h.position.y < e.y + e.h &&
      h.position.y + h.height > e.y
  )
  if (foe) startBattle(foe)
}

function drawExplorePlayerMeters(position) {
  if (mode !== 'explore' || !position || !hero) return
  const artWidth = player.destinationSize?.width || player.width || 76
  const artTop = position.y + (player.drawOffset?.y || 0)
  const centerX = position.x + (player.drawOffset?.x || 0) + artWidth / 2
  const panelX = Math.round(centerX - 33)
  const panelY = Math.round(artTop - 20)
  const panelWidth = 66
  const panelHeight = 17
  const barX = panelX + 16
  const barWidth = 46
  const values = [
    { label: 'HP', value: hero.hp, max: hero.maxHp, color: '#e65f59', y: panelY + 3 },
    { label: 'MP', value: hero.mana, max: hero.maxMana, color: '#55c9dc', y: panelY + 10 },
  ]

  c.save()
  c.fillStyle = 'rgba(8, 13, 16, .94)'
  c.fillRect(panelX - 1, panelY - 1, panelWidth + 2, panelHeight + 2)
  c.strokeStyle = '#89958c'
  c.lineWidth = 1
  c.strokeRect(panelX - 0.5, panelY - 0.5, panelWidth + 1, panelHeight + 1)
  c.font = window.ByteboundFont.canvas(5)
  c.textBaseline = 'middle'
  values.forEach(({ label, value, max, color, y }) => {
    c.fillStyle = '#f2f0df'
    c.textAlign = 'left'
    c.fillText(label, panelX + 3, y + 2)
    c.fillStyle = '#263238'
    c.fillRect(barX, y, barWidth, 4)
    const ratio = Math.max(0, Math.min(1, (Number(value) || 0) / (Number(max) || 1)))
    c.fillStyle = color
    c.fillRect(barX, y, Math.round(barWidth * ratio), 4)
    c.strokeStyle = '#05090b'
    c.strokeRect(barX - 0.5, y - 0.5, barWidth + 1, 5)
    c.fillStyle = 'rgba(8, 13, 16, .42)'
    for (let segment = 1; segment < 6; segment++) {
      const segmentX = barX + Math.round((barWidth * segment) / 6)
      c.fillRect(segmentX, y, 1, 4)
    }
  })
  c.restore()
}

function drawExplore() {
  if (grace > 0) grace--
  updateExploreCamera()
  c.save()
  c.translate(-Math.round(exploreCamera.x), -Math.round(exploreCamera.y))
  background.draw()
  if (currentRoom.boss) {
    c.fillStyle = 'rgba(120, 20, 40, 0.16)'
    c.fillRect(0, 0, exploreCamera.worldWidth, exploreCamera.worldHeight)
  }
  const locked = enemies.some((e) => e.alive)
  c.globalAlpha = currentRoom.solidDoor ? 1 : (locked ? 0.45 : 1)
  doors.forEach((door) => door.draw())
  c.globalAlpha = 1

  const freezeEnemies = Boolean(window.ByteboundTutorial?.shouldFreezeEnemies?.())
  enemies.forEach((e) => {
    if (mode !== 'end' && !freezeEnemies) e.update()
    if (e.alive && e.nyrmed) {
      const fScale = 1.9
      const fx = e.x - e.dir * 52
      const fy = e.y + (e.h - PIG_H * fScale)
      drawPig(c, fx, fy, fScale, e.dir < 0, { animated: !freezeEnemies, idle: freezeEnemies, grenu: true })
    }
    e.draw(freezeEnemies)
  })
  player.handleInput(keys)
  player.draw()
  const playerDrawPosition = { x: player.position.x, y: player.position.y }
  player.update()
  maybeCheckpointExplorePosition()
  if (mode === 'explore' && !player.preventInput && doors.length) {
    const bubbleDoors = new Set()
    const nearDoor = getDoorAtPlayer()
    if (nearDoor) bubbleDoors.add(nearDoor)
    if (hoveredExploreDoor && doors.includes(hoveredExploreDoor)) bubbleDoors.add(hoveredExploreDoor)
    bubbleDoors.forEach((door) => drawDoorBubble(door, locked))
  }
  if (currentRoom.edgeExits && !player.preventInput && mode === 'explore') {
    const h = player.hitbox
    const onLeftEdge = h && h.position.x <= 56
    const onRightEdge = h && h.position.x + h.width >= exploreCamera.worldWidth - 56
    if (onLeftEdge || onRightEdge) {
      const exitCfg = typeof currentRoom.edgeExits === 'object' ? currentRoom.edgeExits : null
      const baseTarget = exitCfg ? (onLeftEdge ? exitCfg.left : exitCfg.right) : null
      const cycleBase = Math.floor((level - 1) / ROOM_COUNT) * ROOM_COUNT
      const targetLevel = baseTarget ? cycleBase + baseTarget : null
      const allowLocked = Boolean(
        (onLeftEdge && exitCfg?.allowLeftWhenLocked) ||
        (onRightEdge && exitCfg?.allowRightWhenLocked)
      )
      if (exitCfg && !baseTarget) {
        // Closed edge on single-direction street exit
      } else if (!allowLocked && enemies.some((e) => e.alive)) {
        player.velocity.x = 0
        player.position.x += onLeftEdge ? 14 : -14
        renderExplore('The road is blocked. Defeat every virus here first.')
      } else {
        if (enemies.length && enemies.every((e) => !e.alive)) {
          clearedRooms.add(level)
        }
        player.velocity = { x: 0, y: 0 }
        player.preventInput = true
        gsap.to(overlay, {
          opacity: 1,
          duration: 0.45,
          onComplete: () => {
            if (targetLevel) {
              const targetCfg = levelConfig(targetLevel)
              let loadOpts = {}
              if (baseTarget === 6) {
                loadOpts = onRightEdge
                  ? { fromPrev: true, spawnOverride: targetCfg.returnLeftSpawn, directionOverride: targetCfg.returnLeftDirection }
                  : { fromPrev: true, spawnOverride: targetCfg.returnRightSpawn, directionOverride: targetCfg.returnRightDirection }
              }
              loadLevel(targetLevel, loadOpts)
              gsap.to(overlay, { opacity: 0 })
            } else {
              nextLevel()
            }
          },
        })
      }
    }
  }
  checkEncounter()
  drawExplorePlayerMeters(playerDrawPosition)
  c.restore()
}

function drawSheet(sp, x, y, s, advance = true, context = c) {
  if (!sp.loaded) return
  const frame = sp.getSourceFrame()
  const dw = (sp.destinationSize?.width || (sp.frameRects ? frame.width : sp.width)) * s
  const dh = (sp.destinationSize?.height || (sp.frameRects ? frame.height : sp.height)) * s
  if (sp.flipX) {
    context.save()
    context.translate(x + dw, y)
    context.scale(-1, 1)
    context.drawImage(sp.image, frame.x, frame.y, frame.width, frame.height, 0, 0, dw, dh)
    context.restore()
  } else {
    context.drawImage(sp.image, frame.x, frame.y, frame.width, frame.height, x, y, dw, dh)
  }
  if (advance) sp.updateFrames()
}

const INTRO_WIPE = 45   // frames: the arena wipes over the explore scene
const INTRO_BANNER = 60 // frame when the announcement banner slides in
const INTRO_END = 135   // frame when the battle begins

// Captures the explore frame so the intro can wipe from it into the arena.
function beginIntro() {
  snapshot = document.createElement('canvas')
  snapshot.width = canvas.width
  snapshot.height = canvas.height
  snapshot.getContext('2d').drawImage(canvas, 0, 0)
  introT = 0
  mode = 'intro'
  setPanel('')
}

function drawIntro() {
  introT++
  const t = introT
  if (t < INTRO_WIPE) {
    // Phase 1: striped wipe from the explore scene into the arena
    drawArena()
    const rows = 36
    const stripe = canvas.height / rows
    const wipe = t / INTRO_WIPE
    for (let i = 0; i < rows; i++) {
      const edge = wipe * (canvas.width + 200) - ((i * 37) % 11) * 24
      if (edge >= canvas.width) continue
      const x = Math.max(0, edge)
      const w = canvas.width - x
      const y = i * stripe
      c.drawImage(snapshot, x, y, w, stripe, x, y, w, stripe)
    }
    return
  }

  // Phase 2: camera eases in while the combatants slide into position
  const ease = 1 - Math.pow(1 - Math.min(1, (t - INTRO_WIPE) / 24), 3)
  const zoom = 1 + 0.12 * (1 - ease)
  c.save()
  c.translate(canvas.width / 2, canvas.height * 0.6)
  c.scale(zoom, zoom)
  c.translate(-canvas.width / 2, -canvas.height * 0.6)
  drawArena()
  drawCombatants(HERO_SPOT.x - (1 - ease) * 320, FOE_SPOT.x + (1 - ease) * 320, 0)
  c.restore()
  const bannerText = battle.enemy.isMultiplayerPlayer
    ? `VS ${battle.enemy.name}!`
    : battle.enemy.isBoss
      ? `${battle.enemy.name} blocks the way!`
      : `A wild ${battle.enemy.name} appears!`
  drawBanner(bannerText, (t - INTRO_BANNER) / 21)

  if (t >= INTRO_END) {
    snapshot = null
    mode = 'battle'
    if (typeof multiplayerMatchActive !== 'undefined' && multiplayerMatchActive && typeof mpIsMyTurn === 'function' && !mpIsMyTurn()) {
      renderMultiplayerWaiting()
    } else {
      battle.phase = 'choose'
      renderBattle()
      saveCurrentRunSlot()
    }
  }
}

function drawBanner(text, k) {
  if (k <= 0) return
  const ease = 1 - Math.pow(1 - Math.min(1, k), 3)
  c.font = window.ByteboundFont.canvas(16)
  const w = c.measureText(text).width + 48
  const x = canvas.width / 2 - w / 2 + (1 - ease) * 700
  c.fillStyle = '#f7e6c4'
  c.fillRect(x, 56, w, 48)
  c.strokeStyle = '#1d1a2a'
  c.lineWidth = 4
  c.strokeRect(x, 56, w, 48)
  c.fillStyle = '#1d1a2a'
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.fillText(text, x + w / 2, 81)
  c.textBaseline = 'alphabetic'
  c.textAlign = 'left'
}

// ===== Character-Head Health & Mana Frames with Smooth Damage & Healing Trails =====
const headBarAnimState = {
  hero: {
    entityRef: null,
    targetRatio: 1,
    mainRatio: 1,
    trailRatio: 1,
    mode: 'idle', // 'idle' | 'damage' | 'heal'
    holdTimer: 0,
    flashTimer: 0,
    lastHp: null,
    lastMaxHp: null,
    lastDelta: 0,
    manaRatio: 1,
    lastMana: null,
  },
  enemy: {
    entityRef: null,
    targetRatio: 1,
    mainRatio: 1,
    trailRatio: 1,
    mode: 'idle',
    holdTimer: 0,
    flashTimer: 0,
    lastHp: null,
    lastMaxHp: null,
    lastDelta: 0,
    manaRatio: 1,
    lastMana: null,
  },
}
window.ByteboundHeadBars = headBarAnimState

function clampUnitRatio(val) {
  if (!Number.isFinite(val)) return 0
  return Math.max(0, Math.min(1, val))
}

function resetHeadBarState(unitKey, entityRef = null, hp = 100, maxHp = 100, mana = 100, maxMana = 100) {
  const st = headBarAnimState[unitKey]
  if (!st) return
  const r = clampUnitRatio(maxHp > 0 ? hp / maxHp : 0)
  st.entityRef = entityRef
  st.targetRatio = r
  st.mainRatio = r
  st.trailRatio = r
  st.mode = 'idle'
  st.holdTimer = 0
  st.flashTimer = 0
  st.lastHp = hp
  st.lastMaxHp = maxHp
  st.lastDelta = 0
  st.defBuffActive = false
  st.manaRatio = clampUnitRatio(maxMana > 0 ? mana / maxMana : 0)
  st.lastMana = mana
}

function syncHeadBarTarget(unitKey, entityRef, hp, maxHp, mana, maxMana) {
  const st = headBarAnimState[unitKey]
  if (!st) return
  const safeMax = Math.max(1, Number(maxHp) || 1)
  const safeHp = Math.max(0, Math.min(safeMax, Number(hp) || 0))
  const nextRatio = clampUnitRatio(safeHp / safeMax)

  if (st.entityRef !== entityRef || st.lastHp === null || st.lastMaxHp === null) {
    resetHeadBarState(unitKey, entityRef, safeHp, safeMax, mana ?? 0, maxMana ?? 100)
    return st
  }

  const reduced = document.body.classList.contains('reduce-motion') ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  if (safeHp !== st.lastHp || safeMax !== st.lastMaxHp) {
    const rawDelta = safeHp - st.lastHp
    if (nextRatio < st.targetRatio - 0.0005) {
      // Health decreased: preserve upper watermark for red trailing afterimage, retargeting cleanly on rapid hits
      const highMark = st.mode === 'damage'
        ? Math.max(st.trailRatio, st.mainRatio)
        : Math.max(st.mainRatio, st.targetRatio)
      st.trailRatio = clampUnitRatio(highMark)
      st.targetRatio = nextRatio
      st.mode = 'damage'
      st.holdTimer = reduced ? 24 : 16
      st.flashTimer = 30
      st.lastDelta = (st.flashTimer > 18 && st.lastDelta < 0) ? (st.lastDelta + rawDelta) : rawDelta
      if (reduced) {
        st.mainRatio = nextRatio
      }
    } else if (nextRatio > st.targetRatio + 0.0005) {
      // Health increased: preserve lower baseline so the gained segment [trailRatio .. mainRatio] renders in bright green
      const lowMark = st.mode === 'heal'
        ? Math.min(st.trailRatio, st.mainRatio)
        : Math.min(st.mainRatio, st.targetRatio)
      st.trailRatio = clampUnitRatio(lowMark)
      st.targetRatio = nextRatio
      st.mode = 'heal'
      st.holdTimer = reduced ? 24 : 18
      st.flashTimer = 30
      st.lastDelta = (st.flashTimer > 18 && st.lastDelta > 0) ? (st.lastDelta + rawDelta) : rawDelta
      if (reduced) {
        st.mainRatio = nextRatio
      }
    } else {
      st.targetRatio = nextRatio
    }
    st.lastHp = safeHp
    st.lastMaxHp = safeMax
  }

  if (mana !== undefined && maxMana !== undefined) {
    const safeMaxMp = Math.max(1, Number(maxMana) || 100)
    const safeMp = Math.max(0, Math.min(safeMaxMp, Number(mana) || 0))
    const targetMpRatio = clampUnitRatio(safeMp / safeMaxMp)
    if (reduced || st.lastMana === null) {
      st.manaRatio = targetMpRatio
    } else {
      st.manaRatio += (targetMpRatio - st.manaRatio) * 0.28
      if (Math.abs(targetMpRatio - st.manaRatio) < 0.004) st.manaRatio = targetMpRatio
    }
    st.lastMana = safeMp
  }

  return st
}

function stepHeadBarAnimation(unitKey) {
  const st = headBarAnimState[unitKey]
  if (!st) return
  const reduced = document.body.classList.contains('reduce-motion') ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  if (st.flashTimer > 0) st.flashTimer--

  if (reduced) {
    st.mainRatio = st.targetRatio
    if (st.holdTimer > 0) {
      st.holdTimer--
    } else {
      st.trailRatio = st.targetRatio
      st.mode = 'idle'
    }
    return
  }

  if (st.mode === 'damage') {
    // 1. Smoothly animate main fill down to the new authoritative value
    st.mainRatio += (st.targetRatio - st.mainRatio) * 0.25
    if (Math.abs(st.mainRatio - st.targetRatio) < 0.003) {
      st.mainRatio = st.targetRatio
    }
    // 2. Keep red afterimage at previous level briefly, then smoothly catch up and disappear
    if (st.holdTimer > 0) {
      st.holdTimer--
    } else {
      st.trailRatio += (st.mainRatio - st.trailRatio) * 0.16
      if (Math.abs(st.trailRatio - st.targetRatio) < 0.003 && st.mainRatio === st.targetRatio) {
        st.trailRatio = st.targetRatio
        st.mode = 'idle'
      }
    }
  } else if (st.mode === 'heal') {
    // 1. Smoothly animate main fill up (showing green gained segment above trailRatio)
    st.mainRatio += (st.targetRatio - st.mainRatio) * 0.22
    if (Math.abs(st.mainRatio - st.targetRatio) < 0.003) {
      st.mainRatio = st.targetRatio
    }
    // 2. Once main fill has risen, hold green segment briefly, then resolve trailRatio into normal bar color
    if (st.holdTimer > 0) {
      st.holdTimer--
    } else {
      st.trailRatio += (st.mainRatio - st.trailRatio) * 0.17
      if (Math.abs(st.trailRatio - st.targetRatio) < 0.003 && st.mainRatio === st.targetRatio) {
        st.trailRatio = st.targetRatio
        st.mode = 'idle'
      }
    }
  } else {
    st.mainRatio = st.targetRatio
    st.trailRatio = st.targetRatio
  }
}

function isReducedMotionActive() {
  return Boolean(
    document.body.classList.contains('reduce-motion') ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  )
}

function hasHeroFullDefenseBuff() {
  if (typeof battle === 'undefined' || !battle) return false
  return Boolean((battle.block || 0) >= 0.75 || battle.remedialDefenseBuff)
}

const PIXEL_SHIELD_MAP = [
  '..OOOOOOO..',
  '.OHHHHHHHO.',
  'OHSSWWWWSHO',
  'OHSSWWWWSHO',
  'OHWWWWWWWWO',
  'OHWWWWWWWWO',
  'OHSSWWWWSHO',
  '.OHSSWWSHO.',
  '.OHSSWWSHO.',
  '..OHSSSSO..',
  '...OHSSO...',
  '....OHO....',
  '.....O.....',
]

function drawPixelShield(cx, cy, pixelSize = 4, options = {}) {
  const alpha = options.alpha ?? 1
  const highlight = Boolean(options.highlight)
  const palette = highlight
    ? { O: '#131c24', H: '#ffffff', S: '#b4cbe0', W: '#ffffff' }
    : { O: '#131c24', H: '#eef5fc', S: '#7d93a8', W: '#dce8f5' }
  const rows = PIXEL_SHIELD_MAP.length
  const cols = PIXEL_SHIELD_MAP[0].length
  const startX = Math.round(cx - (cols * pixelSize) / 2)
  const startY = Math.round(cy - (rows * pixelSize) / 2)

  c.save()
  c.globalAlpha *= alpha
  for (let r = 0; r < rows; r++) {
    const row = PIXEL_SHIELD_MAP[r]
    for (let col = 0; col < cols; col++) {
      const ch = row[col]
      if (ch === '.') continue
      c.fillStyle = palette[ch] || palette.S
      c.fillRect(startX + col * pixelSize, startY + r * pixelSize, pixelSize, pixelSize)
    }
  }
  if (!isReducedMotionActive() && !highlight) {
    const gleamBand = Math.floor((arenaT * 0.35) % 16)
    c.fillStyle = 'rgba(255, 255, 255, 0.55)'
    for (let r = 1; r < rows - 2; r++) {
      const col = gleamBand - r
      if (col >= 1 && col < cols - 1 && PIXEL_SHIELD_MAP[r][col] !== '.' && PIXEL_SHIELD_MAP[r][col] !== 'O') {
        c.fillRect(startX + col * pixelSize, startY + r * pixelSize, pixelSize, pixelSize)
      }
    }
  }
  c.restore()
}

// Decorative pixel-art character-head status frame drawn above each fighter in battle.
function drawStatTag(cx, bottom, name, hp, maxHp, nameColor, mana, maxMana, options = {}) {
  const hasMana = mana !== undefined
  const unitKey = options.unitKey || (hasMana && nameColor === '#f2bb61' ? 'hero' : 'enemy')
  const entityRef = options.entityRef || (unitKey === 'hero' ? hero : battle.enemy)
  const st = syncHeadBarTarget(unitKey, entityRef, hp, maxHp, mana, maxMana)
  stepHeadBarAnimation(unitKey)

  const isHero = unitKey === 'hero'
  const isHeavyIntent = Boolean(options.isHeavyIntent)
  const defBuffActive = Boolean(options.defBuffActive)
  if (st) st.defBuffActive = defBuffActive
  const subText = options.subText || ''

  c.save()
  c.font = window.ByteboundFont.canvas(10)
  const hpLabel = `${hp}/${maxHp}`
  const deltaText = (st && st.flashTimer > 0 && st.lastDelta !== 0)
    ? `${st.lastDelta > 0 ? '+' : ''}${st.lastDelta}`
    : ''
  const nameStr = String(name || '').toUpperCase()
  const headerWidth = Math.ceil(
    c.measureText(nameStr).width +
    c.measureText(hpLabel).width +
    (deltaText ? c.measureText(deltaText).width + 18 : 0) +
    (defBuffActive ? 44 : 0) +
    46
  )
  c.font = window.ByteboundFont.canvas(8)
  const subWidth = subText ? Math.ceil(c.measureText(subText).width + 28) : 0
  const w = Math.max(228, headerWidth, subWidth)
  const h = hasMana ? (subText ? 76 : 64) : (subText ? 62 : 50)
  const x = Math.round(Math.max(12, Math.min(canvas.width - w - 12, cx - w / 2)))
  const y = Math.round(Math.max(10, Math.min(canvas.height - h - 10, bottom - h)))

  const outerBorder = '#060a0d'
  const frameBorder = defBuffActive
    ? '#c8d6e5'
    : (isHero ? '#d9a44a' : (isHeavyIntent ? '#ff784f' : '#cf5978'))
  const cornerColor = defBuffActive
    ? '#f4f9ff'
    : (isHero ? '#ffe082' : (isHeavyIntent ? '#ffb38a' : '#ff9eb6'))
  const plaqueBg = isHero ? 'rgba(13, 21, 25, 0.94)' : 'rgba(22, 13, 25, 0.94)'
  const innerBevel = defBuffActive
    ? 'rgba(220, 232, 245, 0.34)'
    : (isHero ? 'rgba(242, 187, 97, 0.2)' : 'rgba(232, 148, 162, 0.2)')

  // 1. Pixel drop shadow + outer dark plaque
  c.fillStyle = 'rgba(3, 6, 8, 0.72)'
  c.fillRect(x + 4, y + 4, w, h)
  c.fillStyle = outerBorder
  c.fillRect(x - 2, y - 2, w + 4, h + 4)

  // 2. Main plaque background & pixel-art double frame
  c.fillStyle = plaqueBg
  c.fillRect(x, y, w, h)
  c.strokeStyle = frameBorder
  c.lineWidth = 2
  c.strokeRect(x + 1, y + 1, w - 2, h - 2)
  c.strokeStyle = innerBevel
  c.lineWidth = 1
  c.strokeRect(x + 3.5, y + 3.5, w - 7, h - 7)

  // Top accent bar & 4 pixel corner brackets
  c.fillStyle = frameBorder
  c.fillRect(x + 2, y + 2, w - 4, 2)
  c.fillStyle = cornerColor
  c.fillRect(x, y, 4, 4)
  c.fillRect(x + w - 4, y, 4, 4)
  c.fillRect(x, y + h - 4, 4, 4)
  c.fillRect(x + w - 4, y + h - 4, 4, 4)

  // 3. Name & Authoritative HP reading + DEF pill + delta pill
  c.font = window.ByteboundFont.canvas(10)
  c.textBaseline = 'middle'
  c.textAlign = 'left'
  c.fillStyle = nameColor
  c.fillText(nameStr, x + 10, y + 14)

  c.textAlign = 'right'
  c.fillStyle = '#f6f2e6'
  c.fillText(hpLabel, x + w - 10, y + 14)

  let rightAccessoryX = x + w - 14 - c.measureText(hpLabel).width
  if (defBuffActive) {
    c.font = window.ByteboundFont.canvas(7)
    const defW = 34
    const dx = Math.round(rightAccessoryX - defW)
    const dy = y + 7
    c.fillStyle = '#2b3947'
    c.fillRect(dx, dy, defW, 13)
    c.strokeStyle = '#dce8f5'
    c.lineWidth = 1
    c.strokeRect(dx + 0.5, dy + 0.5, defW - 1, 12)
    c.fillStyle = '#f4f9ff'
    c.fillRect(dx, dy, 2, 2)
    c.fillRect(dx + defW - 2, dy, 2, 2)
    c.textAlign = 'center'
    c.fillText('DEF', dx + defW / 2, dy + 7)
    rightAccessoryX = dx - 4
  }

  if (deltaText && st) {
    const isHealDelta = st.lastDelta > 0
    c.font = window.ByteboundFont.canvas(8)
    const dw = Math.ceil(c.measureText(deltaText).width + 8)
    const dx = Math.round(rightAccessoryX - dw)
    const dy = y + 7
    c.fillStyle = isHealDelta ? 'rgba(32, 128, 66, 0.9)' : 'rgba(164, 36, 36, 0.9)'
    c.fillRect(dx, dy, dw, 13)
    c.strokeStyle = isHealDelta ? '#62f596' : '#ff7b73'
    c.lineWidth = 1
    c.strokeRect(dx + 0.5, dy + 0.5, dw - 1, 12)
    c.fillStyle = isHealDelta ? '#9effbe' : '#ffc2bd'
    c.textAlign = 'center'
    c.fillText(deltaText, dx + dw / 2, dy + 7)
  }

  // 4. Health bar with Red Damage Afterimage Trail, Green Healing Trail, & Silver Defense-Buff Frame
  const barX = x + 10
  const barY = y + 23
  const barW = w - 20
  const barH = 10
  const mainR = st ? st.mainRatio : clampUnitRatio(maxHp > 0 ? hp / maxHp : 0)
  const trailR = st ? st.trailRatio : mainR
  const normalColor = isHero ? '#e06252' : '#d84e78'
  const normalHi = isHero ? '#ff9687' : '#ff8eb0'

  // Trough
  c.fillStyle = '#070b0e'
  c.fillRect(barX - 1, barY - 1, barW + 2, barH + 2)
  c.fillStyle = 'rgba(255, 255, 255, 0.1)'
  c.fillRect(barX, barY, barW, barH)

  if (st && st.mode === 'damage' && trailR > mainR + 0.001) {
    const trailW = Math.round(barW * trailR)
    c.fillStyle = '#ff3636'
    c.fillRect(barX, barY, trailW, barH)
    c.fillStyle = '#ff9c9c'
    c.fillRect(barX, barY, trailW, 2)
  }

  if (st && st.mode === 'heal' && mainR > trailR + 0.001) {
    const gainW = Math.round(barW * mainR)
    c.fillStyle = '#38e878'
    c.fillRect(barX, barY, gainW, barH)
    c.fillStyle = '#b4ffd0'
    c.fillRect(barX, barY, gainW, 2)

    const baseW = Math.round(barW * trailR)
    if (baseW > 0) {
      c.fillStyle = normalColor
      c.fillRect(barX, barY, baseW, barH)
      c.fillStyle = normalHi
      c.fillRect(barX, barY, baseW, 2)
    }
  } else {
    const fillW = Math.round(barW * mainR)
    if (fillW > 0) {
      c.fillStyle = normalColor
      c.fillRect(barX, barY, fillW, barH)
      c.fillStyle = normalHi
      c.fillRect(barX, barY, fillW, 2)
    }
  }

  // Pixel ticks at 25%, 50%, 75%
  c.fillStyle = 'rgba(7, 11, 14, 0.45)'
  for (let t = 1; t <= 3; t++) {
    c.fillRect(Math.round(barX + (barW * t) / 4), barY, 1, barH)
  }

  // Metallic silver armor border & glaze overlay when a full defense buff is active (HP fill remains accurate)
  if (defBuffActive) {
    c.fillStyle = '#7b90a6'
    c.fillRect(barX - 2, barY - 2, barW + 4, 2)
    c.fillRect(barX - 2, barY + barH, barW + 4, 2)
    c.fillRect(barX - 2, barY, 2, barH)
    c.fillRect(barX + barW, barY, 2, barH)
    c.fillStyle = '#eef5fc'
    c.fillRect(barX - 1, barY - 1, barW + 2, 1)
    c.fillRect(barX - 2, barY - 2, 3, 3)
    c.fillRect(barX + barW - 1, barY - 2, 3, 3)
    c.fillRect(barX - 2, barY + barH - 1, 3, 3)
    c.fillRect(barX + barW - 1, barY + barH - 1, 3, 3)

    // Subtle brushed-silver glaze stripe that signals shielding without obscuring fill ratio
    c.save()
    c.fillStyle = 'rgba(225, 240, 255, 0.24)'
    c.fillRect(barX, barY, barW, 3)
    if (!isReducedMotionActive()) {
      const scanX = Math.round(barX + ((arenaT * 3) % (barW + 28)) - 20)
      const clipL = Math.max(barX, scanX)
      const clipR = Math.min(barX + barW, scanX + 16)
      if (clipR > clipL) {
        c.fillStyle = 'rgba(255, 255, 255, 0.42)'
        c.fillRect(clipL, barY, clipR - clipL, barH)
      }
    }
    c.restore()
  }

  // 5. Mana sub-bar (if unit has mana)
  let nextRowY = barY + barH + 8
  if (hasMana) {
    c.font = window.ByteboundFont.canvas(8)
    c.textAlign = 'left'
    c.fillStyle = '#8be0f0'
    c.fillText('MP', barX, nextRowY)
    c.textAlign = 'right'
    c.fillStyle = '#d9f0f7'
    c.fillText(`${mana}/${maxMana}`, barX + barW, nextRowY)

    const mpY = nextRowY + 6
    const mpH = 5
    const mpR = st ? st.manaRatio : clampUnitRatio(maxMana > 0 ? mana / maxMana : 0)
    c.fillStyle = '#070b0e'
    c.fillRect(barX - 1, mpY - 1, barW + 2, mpH + 2)
    c.fillStyle = 'rgba(255, 255, 255, 0.1)'
    c.fillRect(barX, mpY, barW, mpH)
    const mpW = Math.round(barW * mpR)
    if (mpW > 0) {
      c.fillStyle = '#48a4de'
      c.fillRect(barX, mpY, mpW, mpH)
      c.fillStyle = '#8ee0ff'
      c.fillRect(barX, mpY, mpW, 1)
    }
    nextRowY = mpY + mpH + 9
  } else {
    nextRowY += 2
  }

  // 6. Optional combat stats / enemy intent sub-strip
  if (subText) {
    c.font = window.ByteboundFont.canvas(8)
    c.textAlign = 'left'
    c.fillStyle = isHeavyIntent ? '#ff9659' : (isHero ? '#cad8ce' : '#dfc6d0')
    c.fillText(subText, barX, nextRowY)
  }

  c.restore()
}

function currentChargeProgress() {
  return battle.chargeCard
    ? Math.min(1, (performance.now() - battle.chargeStartedAt) / 580)
    : 0
}

function chargeColor(progress) {
  if (progress < 0.36) return '#6fe3e8'
  if (progress < 0.76) return '#f2bb61'
  return '#ff9659'
}

function drawChargeEffects(cx, progress) {
  const cy = HERO_SPOT.y - 42
  const color = chargeColor(progress)
  c.save()
  c.lineWidth = 2
  for (let i = 0; i < 3; i++) {
    const radius = 84 * (1 - progress) * (1 + i * 0.1)
    c.strokeStyle = `rgba(111, 227, 232, ${0.34 + i * 0.12})`
    c.beginPath()
    c.arc(cx, cy, radius, 0, Math.PI * 2)
    c.stroke()
  }
  for (const spark of battle.chargeSparks) {
    const radius = 90 * spark.spread * (1 - progress)
    const angle = spark.angle + arenaT * 0.045
    const x = cx + Math.cos(angle) * radius
    const y = cy + Math.sin(angle) * radius
    c.fillStyle = color
    c.fillRect(Math.round(x), Math.round(y), 3, 3)
  }
  for (let i = 0; i < 6; i++) {
    const phase = arenaT * 0.16 + i * 1.7
    c.globalAlpha = 0.2 + 0.35 * Math.abs(Math.sin(phase))
    c.fillStyle = '#b7c8bc'
    c.fillRect(cx + Math.sin(phase) * 29 - 2, HERO_SPOT.y + 8 - (arenaT + i * 5) % 12, 4, 3)
  }
  c.restore()
}

function drawChargeMeter(cx, progress) {
  const x = cx - 47
  const y = HERO_SPOT.y + 27
  const ready = progress >= 1
  const color = ready ? '#fff3c4' : chargeColor(progress)
  c.save()
  c.fillStyle = 'rgba(8, 6, 16, 0.85)'
  c.fillRect(x - 3, y - 3, 100, 12)
  c.fillStyle = 'rgba(255, 255, 255, 0.22)'
  c.fillRect(x, y, 94, 6)
  c.fillStyle = color
  c.fillRect(x, y, 94 * progress, 6)
  c.strokeStyle = ready ? '#fff3c4' : '#6fe3e8'
  c.lineWidth = 1
  c.strokeRect(x - 0.5, y - 0.5, 95, 7)
  if (ready) {
    c.globalAlpha = 0.58 + 0.42 * Math.abs(Math.sin(arenaT * 0.28))
    c.fillStyle = '#fff3c4'
    c.font = window.ByteboundFont.canvas(8)
    c.textAlign = 'center'
    c.fillText('MAX', cx, y + 22)
  }
  c.restore()
}

function drawDefendEffect(cx, heroTop, options = {}) {
  const timer = options.timer ?? battle.defendEffectT
  if (timer <= 0) return
  const facingLeft = Boolean(options.facingLeft)
  const labelText = options.text || 'BLOCKED!'
  const reduced = isReducedMotionActive()
  const progress = 1 - timer / DEFEND_EFFECT_FRAMES
  const alpha = Math.min(1, timer / 6)
  const shieldX = Math.round(cx + (facingLeft ? -52 : 52))
  const heroDrawH = typeof options.heroHeight === 'number' ? options.heroHeight : 128
  const shieldY = Math.round(heroTop + heroDrawH * 0.52)
  const pixelSize = 4

  drawPixelShield(shieldX, shieldY, pixelSize, {
    alpha,
    highlight: !reduced && progress < 0.14,
  })

  c.save()
  const textProgress = reduced ? 0.5 : Math.min(1, progress * 2.2)
  const textScale = reduced ? 1 : (1 + 0.14 * Math.max(0, 1 - textProgress * 5))
  c.globalAlpha = Math.min(1, timer / 8)
  c.translate(shieldX + (facingLeft ? -6 : 6), Math.round(shieldY - 36 - (reduced ? 4 : textProgress * 12)))
  c.scale(textScale, textScale)
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.font = window.ByteboundFont.canvas(9)
  c.lineWidth = 4
  c.strokeStyle = '#131c24'
  c.strokeText(labelText, 0, 0)
  c.fillStyle = '#eef5fc'
  c.fillText(labelText, 0, 0)
  c.restore()
  c.textAlign = 'left'
  c.textBaseline = 'alphabetic'
}

function triggerEnemyImpact() {
  const charged = battle.projectileCharged
  const isMp = typeof multiplayerMatchActive !== 'undefined' && multiplayerMatchActive
  const dmgToApply = Number(battle.projectileDamage) || 0
  if (!isMp && dmgToApply > 0 && battle.enemy) {
    battle.enemy.hp = Math.max(0, battle.enemy.hp - dmgToApply)
  }
  battle.projectileDamage = 0
  battle.pendingAttack = false
  battle.hitT = 1
  battle.enemyInvertT = charged ? 12 : 8
  battle.flash.enemy = charged ? 16 : 12
  battle.cameraPushDistance = charged ? 26 : 18
  battle.cameraShakeT = 1
  battle.impactRingT = 1
  if (!isMp && battle.enemy && battle.enemy.hp <= 0) battle.enemyDefeatT = 0
  if (typeof renderHud === 'function') renderHud()
  if (isMp && typeof mpState !== 'undefined' && mpState.outcome) {
    emitFx(FOE_SPOT.x, FOE_SPOT.y - 70, charged ? '#ff9659' : '#ffd27a', charged ? 32 : 20, charged ? 5.2 : 4.2)
    emitFx(FOE_SPOT.x, FOE_SPOT.y - 70, '#fff3c4', charged ? 18 : 10, 3.6)
    emitFx(FOE_SPOT.x, FOE_SPOT.y - 70, '#6fe3e8', charged ? 16 : 8, 3.2)
    Sound.play('hit')
    mpTriggerFinishSequence()
    return
  }
  const continueButton = panel.querySelector('[data-act="continue"]')
  if (continueButton) {
    continueButton.disabled = false
    continueButton.innerHTML = 'Continue<span class="keyhint"> (Enter)</span>'
  }
  if (!isMp && dmgToApply > 0) {
    popup('enemy', `-${dmgToApply}`, '#ffd27a')
  }
  emitFx(FOE_SPOT.x, FOE_SPOT.y - 70, charged ? '#ff9659' : '#ffd27a', charged ? 32 : 20, charged ? 5.2 : 4.2)
  emitFx(FOE_SPOT.x, FOE_SPOT.y - 70, '#fff3c4', charged ? 18 : 10, 3.6)
  emitFx(FOE_SPOT.x, FOE_SPOT.y - 70, '#6fe3e8', charged ? 16 : 8, 3.2)
  Sound.play('hit')
}

function drawAttackProjectile() {
  const b = battle
  if (b.projectileT < 0) return
  const charged = b.projectileCharged
  const progress = Math.min(1, b.projectileT)
  const startX = HERO_SPOT.x + 70
  const endX = FOE_SPOT.x - 18
  const startY = HERO_SPOT.y - 100
  const endY = FOE_SPOT.y - 82
  const color = charged ? '#ff9659' : '#ffd27a'
  const size = charged ? 13 : 7
  c.save()
  c.globalCompositeOperation = 'lighter'
  c.shadowColor = color
  c.shadowBlur = charged ? 18 : 10
  for (let i = charged ? 4 : 2; i >= 0; i--) {
    const trailProgress = Math.max(0, progress - i * (charged ? 0.035 : 0.05))
    const trailEase = 1 - Math.pow(1 - trailProgress, 2)
    const trailX = startX + (endX - startX) * trailEase
    const trailY = startY + (endY - startY) * trailEase - (charged ? Math.sin(trailProgress * Math.PI) * 34 : 0)
    c.globalAlpha = 1 - i * 0.16
    c.fillStyle = i ? color : '#fff3c4'
    c.fillRect(Math.round(trailX - size / 2), Math.round(trailY - size / 2), size, size)
  }
  c.restore()
  b.projectileT += charged ? 0.055 : 0.1
  if (b.projectileT >= 1) {
    b.projectileT = -1
    triggerEnemyImpact()
  }
}

function drawEnemyProjectile() {
  const b = battle
  if (b.enemyProjectileT < 0) return
  const charged = b.enemyProjectileCharged
  const progress = Math.min(1, b.enemyProjectileT)
  const startX = FOE_SPOT.x - 70
  const endX = HERO_SPOT.x + 18
  const startY = FOE_SPOT.y - 100
  const endY = HERO_SPOT.y - 82
  const color = charged ? '#ff9659' : '#ffd27a'
  const size = charged ? 13 : 7
  c.save()
  c.globalCompositeOperation = 'lighter'
  c.shadowColor = color
  c.shadowBlur = charged ? 18 : 10
  for (let i = charged ? 4 : 2; i >= 0; i--) {
    const trailProgress = Math.max(0, progress - i * (charged ? 0.035 : 0.05))
    const trailEase = 1 - Math.pow(1 - trailProgress, 2)
    const trailX = startX + (endX - startX) * trailEase
    const trailY = startY + (endY - startY) * trailEase - (charged ? Math.sin(trailProgress * Math.PI) * 34 : 0)
    c.globalAlpha = 1 - i * 0.16
    c.fillStyle = i ? color : '#fff3c4'
    c.fillRect(Math.round(trailX - size / 2), Math.round(trailY - size / 2), size, size)
  }
  c.restore()
  b.enemyProjectileT += charged ? 0.055 : 0.1
  if (b.enemyProjectileT >= 1) {
    b.enemyProjectileT = -1
    b.enemyProjectileCharged = false
    emitFx(HERO_SPOT.x, HERO_SPOT.y - 74, '#ff9659', 18, 3.8)
  }
}

function drawCardActionAnim() {
  const anim = battle.cardAnim
  if (!anim || anim.t <= 0) return
  const dur = Math.max(1, anim.duration || 28)
  const progress = 1 - anim.t / dur
  const alpha = Math.min(1, anim.t / 6)
  const reduced = isReducedMotionActive()
  const hx = HERO_SPOT.x
  const hy = HERO_SPOT.y - 68
  const ex = FOE_SPOT.x
  const ey = FOE_SPOT.y - 66

  c.save()
  c.globalAlpha *= alpha

  if (reduced) {
    // Reduced-motion mode: concise, brief static pixel glyph distinct per card action
    const drawPixelCross = (cx, cy, color, sz = 4) => {
      c.fillStyle = color
      c.fillRect(Math.round(cx - sz * 1.5), Math.round(cy - sz * 0.5), sz * 3, sz)
      c.fillRect(Math.round(cx - sz * 0.5), Math.round(cy - sz * 1.5), sz, sz * 3)
    }
    if (anim.type === 'power' || anim.type === 'heavy') {
      const col = anim.type === 'heavy' ? '#ff594f' : '#ff9f43'
      c.fillStyle = col
      for (let i = -3; i <= 3; i++) {
        c.fillRect(Math.round(ex + i * 8 - 4), Math.round(ey + i * 7 - 4), 8, 8)
        if (anim.type === 'power') c.fillRect(Math.round(ex - i * 8 - 4), Math.round(ey + i * 7 - 4), 8, 8)
      }
    } else if (anim.type === 'strike' || anim.type === 'quick') {
      c.fillStyle = anim.type === 'quick' ? '#6fe3e8' : '#ffe07a'
      c.fillRect(Math.round(ex - 28), Math.round(ey - 4), 56, 6)
      if (anim.type === 'quick') {
        c.fillRect(Math.round(ex - 22), Math.round(ey - 16), 44, 4)
        c.fillRect(Math.round(ex - 22), Math.round(ey + 10), 44, 4)
      }
    } else if (anim.type === 'overclock') {
      c.fillStyle = '#6fe3e8'
      for (let i = 0; i < 6; i++) {
        const px = Math.round(hx + 70 + ((ex - hx - 90) * i) / 5)
        const py = Math.round(hy + (i % 2 === 0 ? -8 : 8))
        c.fillRect(px - 4, py - 4, 8, 8)
      }
    } else if (anim.type === 'defend') {
      drawPixelShield(hx + 52, HERO_SPOT.y - 62, 4, { highlight: false, alpha: 0.9 })
    } else if (anim.type === 'charge' || anim.type === 'siphon') {
      drawPixelCross(hx, hy - 34, anim.type === 'siphon' ? '#c77dff' : '#6fe3e8', 5)
    } else if (anim.type === 'mend') {
      drawPixelCross(hx, hy - 36, '#62f596', 5)
    } else if (anim.type === 'fortify' || anim.type === 'remedial_surge') {
      c.strokeStyle = '#dce8f5'
      c.lineWidth = 3
      c.strokeRect(Math.round(hx - 40), Math.round(HERO_SPOT.y - 108), 80, 96)
    }
    c.restore()
    return
  }

  switch (anim.type) {
    case 'power': {
      // Forceful golden-orange cross-cleave + ground shockwave + ember chunks
      c.globalCompositeOperation = 'lighter'
      const span = 58
      const stepEnd = Math.min(1, progress * 2.1)
      const count = 9
      for (let i = 0; i < count; i++) {
        const r = i / (count - 1)
        if (r > stepEnd) break
        const sx1 = Math.round(ex - span + r * span * 2)
        const sy1 = Math.round(ey - span + r * span * 2)
        c.fillStyle = i % 2 === 0 ? '#ff8f3a' : '#fff3c4'
        c.fillRect(sx1 - 6, sy1 - 6, 12, 12)
        const sx2 = Math.round(ex + span - r * span * 2)
        c.fillStyle = i % 2 === 0 ? '#ffd27a' : '#ff683b'
        c.fillRect(sx2 - 5, sy1 - 5, 10, 10)
      }
      const waveW = Math.round(28 + progress * 86)
      c.fillStyle = 'rgba(255, 210, 122, 0.72)'
      c.fillRect(Math.round(FOE_SPOT.x - waveW), FOE_SPOT.y - 8, waveW * 2, 6)
      c.fillStyle = '#fff5cf'
      c.fillRect(Math.round(FOE_SPOT.x - waveW * 0.65), FOE_SPOT.y - 6, Math.round(waveW * 1.3), 3)
      break
    }

    case 'strike': {
      // Clean swift single diagonal steel blade slash
      const span = 44
      const tCut = Math.min(1, progress * 2.4)
      for (let i = 0; i < 7; i++) {
        const r = i / 6
        if (r > tCut) break
        const sx = Math.round(ex - span + r * span * 2)
        const sy = Math.round(ey - span * 0.8 + r * span * 1.6)
        c.fillStyle = i > 4 ? '#ffffff' : '#dce8f5'
        c.fillRect(sx - 4, sy - 4, 8, 8)
      }
      break
    }

    case 'quick': {
      // Triple rapid horizontal jab streaks + fast mana glint toward hero
      const streaks = [-18, 0, 18]
      streaks.forEach((dy, idx) => {
        const local = Math.max(0, Math.min(1, progress * 2.6 - idx * 0.25))
        if (local <= 0) return
        const xPos = Math.round(ex - 42 + local * 84)
        c.fillStyle = idx === 1 ? '#ffffff' : '#6fe3e8'
        c.fillRect(xPos - 14, Math.round(ey + dy - 3), 28, 6)
      })
      const orbX = Math.round(ex + (hx - ex) * Math.min(1, progress * 1.25))
      const orbY = Math.round(ey - Math.sin(progress * Math.PI) * 32)
      c.fillStyle = '#7ef0a2'
      c.fillRect(orbX - 4, orbY - 4, 8, 8)
      break
    }

    case 'heavy': {
      // Crushing crimson-gold vertical pillar + fracture bricks at base
      const slamH = Math.round(140 * Math.min(1, progress * 2.4))
      c.fillStyle = 'rgba(255, 89, 79, 0.78)'
      c.fillRect(Math.round(FOE_SPOT.x - 16), Math.round(FOE_SPOT.y - slamH), 32, slamH)
      c.fillStyle = '#ffe07a'
      c.fillRect(Math.round(FOE_SPOT.x - 8), Math.round(FOE_SPOT.y - slamH), 16, slamH)
      const spread = Math.round(progress * 68)
      c.fillStyle = '#ff9659'
      c.fillRect(Math.round(FOE_SPOT.x - 24 - spread), FOE_SPOT.y - 10, 10, 10)
      c.fillRect(Math.round(FOE_SPOT.x + 14 + spread), FOE_SPOT.y - 10, 10, 10)
      break
    }

    case 'overclock': {
      // Electric pixel lightning bolt across arena with static glitch squares
      const segments = 9
      let prevX = hx + 36
      let prevY = hy
      c.strokeStyle = '#6fe3e8'
      c.lineWidth = 4
      c.beginPath()
      c.moveTo(prevX, prevY)
      for (let i = 1; i <= segments; i++) {
        const r = i / segments
        const nx = Math.round(hx + 36 + (ex - hx - 36) * r)
        const ny = Math.round(hy + (ey - hy) * r + (i < segments ? Math.sin(i * 2.5 + arenaT * 0.8) * 16 : 0))
        c.lineTo(nx, ny)
        c.fillStyle = i % 2 === 0 ? '#ff89d6' : '#aef8ff'
        c.fillRect(nx - 3, ny - 3, 6, 6)
      }
      c.stroke()
      break
    }

    case 'defend': {
      // Crisp silver-steel perimeter shimmer around hero shield
      const expand = Math.round(progress * 26)
      c.strokeStyle = anim.correct ? '#eef5fc' : '#7d93a8'
      c.lineWidth = 2
      c.strokeRect(
        Math.round(hx + 52 - 22 - expand * 0.5),
        Math.round(HERO_SPOT.y - 86 - expand * 0.5),
        44 + expand,
        52 + expand
      )
      break
    }

    case 'charge': {
      // Converging cyan pixel prisms + vertical mana rise at hero
      for (let i = 0; i < 8; i++) {
        const ang = (Math.PI * 2 * i) / 8 + progress * 2.4
        const rad = Math.max(8, 56 * (1 - progress))
        const px = Math.round(hx + Math.cos(ang) * rad)
        const py = Math.round(hy + Math.sin(ang) * rad)
        c.fillStyle = i % 2 === 0 ? '#6fe3e8' : '#7ef0a2'
        c.fillRect(px - 3, py - 3, 6, 6)
      }
      const pillarH = Math.round(88 * (1 - Math.abs(progress * 2 - 1)))
      if (pillarH > 0) {
        c.fillStyle = 'rgba(111, 227, 232, 0.36)'
        c.fillRect(Math.round(hx - 18), HERO_SPOT.y - pillarH - 6, 36, pillarH)
      }
      break
    }

    case 'siphon': {
      // Teal-violet pixel orbs siphoned from enemy back into hero
      for (let i = 0; i < 6; i++) {
        const local = Math.max(0, Math.min(1, progress * 1.4 - i * 0.08))
        const px = Math.round(ex + (hx - ex) * local)
        const py = Math.round(ey + (hy - ey) * local - Math.sin(local * Math.PI) * 34)
        c.fillStyle = i % 2 === 0 ? '#c77dff' : '#6fe3e8'
        c.fillRect(px - 4, py - 4, 8, 8)
      }
      break
    }

    case 'mend': {
      // Rising green pixel '+' crosses around hero
      const offsets = [-28, -12, 4, 22, 34]
      offsets.forEach((ox, idx) => {
        const py = Math.round(HERO_SPOT.y - 18 - ((progress * 74 + idx * 14) % 80))
        const px = Math.round(hx + ox)
        c.fillStyle = idx % 2 === 0 ? '#62f596' : '#d2ffe4'
        c.fillRect(px - 5, py - 2, 10, 4)
        c.fillRect(px - 2, py - 5, 4, 10)
      })
      break
    }

    case 'fortify': {
      // Twin metallic-lavender bastion plates locking onto hero sides
      const slide = Math.round((1 - Math.min(1, progress * 2)) * 28)
      c.fillStyle = 'rgba(201, 182, 255, 0.72)'
      c.fillRect(Math.round(hx - 48 - slide), HERO_SPOT.y - 98, 8, 66)
      c.fillRect(Math.round(hx + 40 + slide), HERO_SPOT.y - 98, 8, 66)
      c.fillStyle = '#eef5fc'
      c.fillRect(Math.round(hx - 48 - slide), HERO_SPOT.y - 98, 8, 6)
      c.fillRect(Math.round(hx + 40 + slide), HERO_SPOT.y - 98, 8, 6)
      break
    }

    case 'remedial_surge': {
      // Bright silver-teal-gold ascending surge bars around hero
      for (let i = 0; i < 4; i++) {
        const px = Math.round(hx - 36 + i * 24)
        const barH = Math.round(92 * Math.sin(Math.min(1, progress) * Math.PI))
        c.fillStyle = i % 2 === 0 ? '#dce8f5' : '#ffe07a'
        c.fillRect(px, HERO_SPOT.y - barH - 6, 5, barH)
      }
      break
    }

    default: {
      // Subtle pixel diamond flash fallback for exclusive skills (paired with their dedicated timers)
      c.fillStyle = '#ffe07a'
      c.fillRect(Math.round(ex - 10), Math.round(ey - 10), 20, 20)
      break
    }
  }

  c.restore()
}

function drawImpactRings() {
  if (battle.impactRingT > 0) {
    const progress = 1 - battle.impactRingT
    c.save()
    if (battle.projectileCharged && progress < 0.45) {
      c.globalAlpha = 1 - progress / 0.45
      c.lineCap = 'square'
      c.strokeStyle = '#ff9659'
      c.lineWidth = 12 * (1 - progress)
      c.beginPath()
      c.moveTo(FOE_SPOT.x - 42, FOE_SPOT.y - 128)
      c.lineTo(FOE_SPOT.x + 42, FOE_SPOT.y - 24)
      c.stroke()
      c.strokeStyle = '#fff3c4'
      c.lineWidth = 3
      c.stroke()
    }
    for (let i = 0; i < 3; i++) {
      const radius = 12 + progress * (72 + i * 12)
      c.globalAlpha = Math.max(0, 0.82 * (1 - progress))
      c.strokeStyle = i === 2 ? '#f2bb61' : '#6fe3e8'
      c.lineWidth = 3 - i * 0.5
      c.beginPath()
      c.arc(FOE_SPOT.x, FOE_SPOT.y - 70, radius, 0, Math.PI * 2)
      c.stroke()
    }
    c.restore()
  }
  if (battle.enemyImpactRingT > 0) {
    const progress = 1 - battle.enemyImpactRingT
    c.save()
    if (progress < 0.45) {
      c.globalAlpha = 1 - progress / 0.45
      c.lineCap = 'square'
      c.strokeStyle = '#ff9659'
      c.lineWidth = 12 * (1 - progress)
      c.beginPath()
      c.moveTo(HERO_SPOT.x + 42, HERO_SPOT.y - 128)
      c.lineTo(HERO_SPOT.x - 42, HERO_SPOT.y - 24)
      c.stroke()
      c.strokeStyle = '#fff3c4'
      c.lineWidth = 3
      c.stroke()
    }
    for (let i = 0; i < 3; i++) {
      const radius = 12 + progress * (72 + i * 12)
      c.globalAlpha = Math.max(0, 0.82 * (1 - progress))
      c.strokeStyle = i === 2 ? '#f2bb61' : '#ff9659'
      c.lineWidth = 3 - i * 0.5
      c.beginPath()
      c.arc(HERO_SPOT.x, HERO_SPOT.y - 70, radius, 0, Math.PI * 2)
      c.stroke()
    }
    c.restore()
  }
}

// Draws the king and the current enemy, plus shadows, shield and heavy-attack warning.
function drawCombatants(heroX, foeX, shake) {
  const b = battle
  const foe = b.enemy
  const bob = Math.sin(arenaT * 0.08)
  const lunge = b.lungeT > 0 ? Math.sin((1 - b.lungeT) * Math.PI) * 160 : 0
  const hs = 2.2
  const charging = b.chargeCard
  const chargeProgress = currentChargeProgress()
  const heroTremble = charging ? Math.sin(performance.now() * 0.06) * 4 * chargeProgress : 0
  const knockbackProgress = b.heroKnockbackT >= 0
    ? Math.min(1, b.heroKnockbackT / HERO_KNOCKBACK_TICKS)
    : 0
  const knockbackTravel = knockbackProgress < 0.3
    ? 1 - Math.pow(1 - knockbackProgress / 0.3, 3)
    : Math.pow(1 - (knockbackProgress - 0.3) / 0.7, 2)
  const knockbackX = b.heroKnockbackT >= 0 ? -56 * knockbackTravel : 0
  const knockbackArc = b.heroKnockbackT >= 0 ? 20 * Math.sin(knockbackProgress * Math.PI) : 0
  const hx = heroX + lunge + heroTremble + knockbackX
  const attackActive = b.heroAttackT > 0
  const heroScale = hs
  const heroDrawHeight = battleKing.destinationSize.height * heroScale
  // Step through the hop using how long the attack has been running.
  const attackElapsed = BATTLE_ATTACK_FRAME_COUNT * BATTLE_ATTACK_FRAME_BUFFER - b.heroAttackT
  const attackJumpFrame = Math.min(BATTLE_ATTACK_FRAME_COUNT - 1, Math.max(0, Math.floor(attackElapsed / BATTLE_ATTACK_FRAME_BUFFER)))
  const jumpOffset = attackActive
    ? BATTLE_ATTACK_JUMP_OFFSETS[attackJumpFrame] * heroScale
    : 0
  const hy = HERO_SPOT.y + (attackActive ? jumpOffset : bob * 2) - knockbackArc
  const foeScale = foe.nyrmed ? 4.1 : foe.grenu ? 3.55 : foe.brute ? 3.6 : 3.2
  const enemyLunge = b.enemyLungeT > 0
    ? Math.sin((1 - b.enemyLungeT) * Math.PI) * b.enemyLungeDistance
    : 0
  const hitProgress = b.hitT > 0 ? Math.sin((1 - b.hitT) * Math.PI) : 0
  const defeatProgress = b.enemyDefeatT >= 0 && b.enemyDefeatT < 1 ? b.enemyDefeatT : -1
  const defeating = foe.hp <= 0 && defeatProgress >= 0
  const fx = foeX + shake - enemyLunge
  const fy = FOE_SPOT.y + Math.sin(arenaT * 0.08 + 1) * 2

  c.fillStyle = 'rgba(8, 6, 16, 0.5)'
  c.beginPath()
  c.ellipse(hx, HERO_SPOT.y + 2, 70, 12, 0, 0, Math.PI * 2)
  c.fill()

  if (charging) drawChargeEffects(hx, chargeProgress)
  if (b.block > 0 && b.defendEffectT <= 0) {
    drawPixelShield(hx + 52, hy - heroDrawHeight * 0.48, b.block >= 0.75 ? 4 : 3, {
      alpha: b.block >= 0.75 ? 0.94 : 0.62,
      highlight: false,
    })
  }
  const drawHero = (...args) => {
    const hitElapsed = Math.max(0, HERO_HIT_IFRAME_TICKS - b.heroHitT)
    if (b.heroHitT > 0 && Math.floor(hitElapsed / 2) % 2 === 1) {
      if (args[4] !== false) args[0].updateFrames()
      return
    }
    c.save()
    if (charging) {
      const flickerWhite = chargeProgress > 0.72 && Math.sin(performance.now() * 0.045) > 0.2
      c.filter = flickerWhite ? 'brightness(0) invert(1)' : `brightness(${1 + chargeProgress * 0.55})`
      c.shadowColor = chargeColor(chargeProgress)
      c.shadowBlur = 7 + chargeProgress * 19
    }
    const tint = b.heroHealFlashT > 0
      ? { color: '#ffffff', alpha: 1 }
      : b.heroHitTintT > 0
        ? { color: '#e34f4f', alpha: 0.9 * (b.heroHitTintT / HERO_HIT_TINT_TICKS) }
        : b.heroHealTintT > 0
          ? { color: '#82f2b1', alpha: 0.62 * (b.heroHealTintT / HERO_HEAL_TINT_TICKS) }
          : null
    if (tint) {
      const [sprite, x, y, scale, advance] = args
      const width = Math.ceil(sprite.destinationSize.width * scale)
      const height = Math.ceil(sprite.destinationSize.height * scale)
      if (heroHitCanvas.width !== width || heroHitCanvas.height !== height) {
        heroHitCanvas.width = width
        heroHitCanvas.height = height
        heroHitContext.imageSmoothingEnabled = false
      } else {
        heroHitContext.clearRect(0, 0, width, height)
      }
      drawSheet(sprite, 0, 0, scale, false, heroHitContext)
      heroHitContext.globalCompositeOperation = 'source-atop'
      heroHitContext.globalAlpha = tint.alpha
      heroHitContext.fillStyle = tint.color
      heroHitContext.fillRect(0, 0, width, height)
      heroHitContext.globalCompositeOperation = 'source-over'
      heroHitContext.globalAlpha = 1
      c.drawImage(heroHitCanvas, x, y, width, height)
      if (advance !== false) sprite.updateFrames()
    } else {
      drawSheet(...args)
    }
    c.restore()
  }
  if (hero.hp <= 0 || b.phase === 'dying' || b.phase === 'lost') {
    const deathWidth = battleKingDeath.destinationSize.width * hs
    const deathHeight = battleKingDeath.destinationSize.height * hs
    const floorDrop = battleKingDeath.currentFrame >= 4
      ? Math.round(14 * (battleKingDeath.destinationSize.height / 164) * hs)
      : 0
    drawSheet(
      battleKingDeath,
      HERO_SPOT.x - deathWidth / 2,
      HERO_SPOT.y - deathHeight + floorDrop,
      hs
    )
  } else if (b.heroAttackT > 0) {
    drawHero(
      battleKing,
      hx - (battleKing.destinationSize.width / 2) * heroScale,
      hy - heroDrawHeight,
      heroScale,
      false
    )
    b.heroAttackT--
  } else {
    drawHero(
      battleKing,
      hx - (battleKing.destinationSize.width / 2) * hs,
      hy - battleKing.destinationSize.height * hs,
      hs
    )
  }
  const heroMetaText = `ATK ${hero.attack + (hero.tempAttack || 0)} · DEF ${hero.defense + (b.tempDefense || 0)}`
  drawStatTag(
    hx,
    HERO_SPOT.y - heroDrawHeight - 10,
    activePlayerName || 'PLAYER',
    hero.hp,
    hero.maxHp,
    '#f2bb61',
    hero.mana,
    hero.maxMana,
    { unitKey: 'hero', entityRef: hero, subText: heroMetaText, defBuffActive: hasHeroFullDefenseBuff() }
  )
  if (charging || b.chargeMaxT > 0) {
    drawChargeMeter(hx, charging ? chargeProgress : 1)
  }
  if (b.defendEffectT > 0) drawDefendEffect(hx, hy - heroDrawHeight, { heroHeight: heroDrawHeight })
  if ((typeof hero !== 'undefined' && hero.runInvincible) || b.aegisAnimT > 0) {
    c.save()
    c.globalCompositeOperation = 'lighter'
    const pulse = b.aegisAnimT > 0 ? 0.55 + Math.sin(arenaT * 0.45) * 0.25 : 0.28 + Math.sin(arenaT * 0.14) * 0.1
    c.globalAlpha = pulse
    c.strokeStyle = b.aegisAnimT > 0 ? '#ffe07a' : '#7bf5c8'
    c.lineWidth = b.aegisAnimT > 0 ? 5 : 3
    c.beginPath()
    const radius = b.aegisAnimT > 0 ? 86 + (56 - b.aegisAnimT) * 0.3 : 78
    for (let i = 0; i < 6; i++) {
      const ang = (Math.PI / 3) * i + arenaT * 0.02
      const px = hx + Math.cos(ang) * radius
      const py = hy - heroDrawHeight * 0.5 + Math.sin(ang) * radius
      if (i === 0) c.moveTo(px, py)
      else c.lineTo(px, py)
    }
    c.closePath()
    c.stroke()
    c.restore()
  }

  // Resurrected Necromancy allies standing in distinct positions beside the player
  const necroAlliesList = !foe.isMultiplayerPlayer && typeof hero !== 'undefined'
    ? (Array.isArray(hero.necroAllies) && hero.necroAllies.length ? hero.necroAllies : (hero.necroAlly ? [hero.necroAlly] : []))
    : []
  if (necroAlliesList.length) {
    const allySlots = [
      { dx: -138, dy: 8 },
      { dx: 118, dy: 16 },
      { dx: -72, dy: -44 },
    ]
    necroAlliesList.forEach((ally, idx) => {
      const slot = allySlots[idx] || { dx: -138 - idx * 44, dy: 8 + idx * 10 }
      const slotLungeT = Array.isArray(b.allyLungeTs) ? (b.allyLungeTs[idx] || 0) : (b.allyLungeT || 0)
      const slotAttackT = Array.isArray(b.allyAttackTs) ? (b.allyAttackTs[idx] || 0) : (b.allyAttackT || 0)
      const allyLunge = slotLungeT > 0 ? Math.sin((1 - slotLungeT) * Math.PI) * 210 : 0
      const ax = HERO_SPOT.x + slot.dx + allyLunge
      const ay = HERO_SPOT.y + slot.dy + Math.sin(arenaT * 0.09 + 2 + idx * 1.4) * 2
      c.save()
      c.fillStyle = 'rgba(130, 56, 210, 0.35)'
      c.beginPath()
      c.ellipse(ax, HERO_SPOT.y + slot.dy + 2, 48, 9, 0, 0, Math.PI * 2)
      c.fill()
      c.shadowColor = '#c77dff'
      c.shadowBlur = slotAttackT > 0 ? 22 : 12
      c.filter = 'hue-rotate(235deg) saturate(1.5)'
      if (ally.isBoss) {
        const allyDur = typeof getBossAttackDuration === 'function' ? getBossAttackDuration(ally) : BOSS_ATTACK_FRAMES * BOSS_ATTACK_BUFFER
        drawBossArt(c, ally, ax, ay, 140, { attacking: slotAttackT > 0, attackElapsed: Math.round(((24 - slotAttackT) / 24) * allyDur), faceLeft: false })
      } else {
        const aScale = ally.nyrmed ? 3.1 : ally.grenu ? 2.75 : ally.brute ? 2.8 : 2.5
        drawPig(c, ax - 24 * aScale, ay - 36 * aScale, aScale, false, {
          animated: true,
          idle: true,
          brute: Boolean(ally.brute),
          nyrmed: Boolean(ally.nyrmed),
          grenu: Boolean(ally.grenu),
          attacking: Boolean(ally.brute) && slotAttackT > 0,
          attackElapsed: 24 - slotAttackT,
        })
      }
      c.restore()
      c.save()
      c.font = window.ByteboundFont.canvas(8)
      c.textAlign = 'center'
      c.fillStyle = '#e0aaff'
      c.fillText(`ALLY ${idx + 1}: ${String(ally.name || 'UNDEAD').toUpperCase()}`, ax, ay - (ally.isBoss ? 148 : 96))
      c.restore()
    })
  }

  if (foe.hp > 0 || foe.isMultiplayerPlayer || b.hitT > 0 || b.projectileT >= 0 || b.projectileQueued || charging || defeating) {
    const flash = b.flash.enemy > 0 && b.flash.enemy % 4 >= 2
    const invert = b.enemyInvertT > 0 && !flash
    const heavy = !foe.isMultiplayerPlayer && isHeavy() && b.phase === 'choose'
    const label = foe.isMultiplayerPlayer ? foe.name : `${heavy ? '! ' : ''}${foe.name}`
    const labelColor = foe.isMultiplayerPlayer ? '#8fd0dc' : (heavy ? '#e8706a' : '#ffd1dc')
    const drawFoeSprite = (x, alpha = 1, afterimage = false, ghost = false, feetY = fy) => {
      c.save()
      c.globalAlpha *= alpha
      if (ghost) c.filter = 'brightness(0) invert(0.82)'
      else if (afterimage) c.filter = 'hue-rotate(135deg) saturate(1.6)'
      if (foe.isMultiplayerPlayer) {
        const oppW = opponentKing.destinationSize.width * hs
        const oppH = opponentKing.destinationSize.height * hs
        if (flash) c.filter = 'brightness(1.85)'
        else if (invert) c.filter = 'brightness(0) invert(1)'
        drawSheet(opponentKing, x - oppW / 2, feetY - oppH, hs, mode === 'battle' && !ghost && !afterimage)
      } else if (foe.isBoss && !foe.grenu) {
        const atkDur = typeof getBossAttackDuration === 'function' ? getBossAttackDuration(foe) : BOSS_ATTACK_FRAMES * BOSS_ATTACK_BUFFER
        drawBossArt(c, foe, x, feetY, BOSS_BATTLE_HEIGHT, {
          attacking: b.bossAttackT > 0,
          attackElapsed: atkDur - b.bossAttackT,
          faceLeft: true,
          flash: !ghost && !afterimage && flash,
          invert: !ghost && !afterimage && invert,
        })
      } else {
        const useScale = foe.isBoss && foe.grenu ? 4.4 : foeScale
        drawPig(c, x - 24 * useScale, feetY - 36 * useScale, useScale, true, {
          animated: mode === 'battle',
          idle: true,
          brute: Boolean(foe.brute),
          nyrmed: Boolean(foe.nyrmed),
          grenu: Boolean(foe.grenu),
          attacking: Boolean(foe.brute) && b.driusAttackT > 0,
          attackElapsed: (typeof DRIUS_ATTACK_FRAMES_COUNT !== 'undefined' ? DRIUS_ATTACK_FRAMES_COUNT : 10) * (typeof DRIUS_ATTACK_BUFFER !== 'undefined' ? DRIUS_ATTACK_BUFFER : 3) - b.driusAttackT,
          flash: !ghost && !afterimage && flash,
          invert: !ghost && !afterimage && invert,
        })
      }
      c.restore()
    }

    // Nyrmed's loyal follower Grenu standing right beside him in battle
    if (!foe.isMultiplayerPlayer && foe.hp > 0 && b.enemyFollower && b.enemyFollower.hp > 0) {
      const fl = b.enemyFollower
      const flLunge = (fl.lungeT || 0) > 0 ? Math.sin((1 - fl.lungeT) * Math.PI) * 260 : 0
      const gx = FOE_SPOT.x + 122 + shake - flLunge
      const gy = FOE_SPOT.y + 10 + Math.sin(arenaT * 0.09 + 1.8) * 2
      const gScale = 3.05
      c.save()
      c.fillStyle = 'rgba(8, 6, 16, 0.48)'
      c.beginPath()
      c.ellipse(gx, FOE_SPOT.y + 12, 52, 9, 0, 0, Math.PI * 2)
      c.fill()
      c.shadowColor = '#ff9659'
      c.shadowBlur = fl.lungeT > 0 ? 20 : 10
      drawPig(c, gx - 24 * gScale, gy - 36 * gScale, gScale, true, {
        animated: mode === 'battle',
        idle: true,
        grenu: true,
      })
      c.restore()
      c.save()
      c.font = window.ByteboundFont.canvas(8)
      c.textAlign = 'center'
      c.fillStyle = '#ffc299'
      c.fillText('ALLY: GRENU', gx, gy - 118)
      c.restore()
    }

    c.fillStyle = foe.isBoss ? 'rgba(8, 6, 16, 0.55)' : 'rgba(8, 6, 16, 0.5)'
    const shadowY = FOE_SPOT.y + 2
    c.save()
    if (defeating) {
      const flatten = Math.min(1, defeatProgress / 0.4)
      c.globalAlpha *= Math.max(0, 1 - defeatProgress / 0.42)
      c.translate(fx, shadowY)
      c.scale(1, Math.max(0.04, 1 - flatten))
      c.translate(-fx, -shadowY)
    }
    c.beginPath()
    c.ellipse(fx, shadowY, foe.isBoss ? 120 : (foe.isMultiplayerPlayer ? 70 : 80), foe.isBoss ? 16 : 13, 0, 0, Math.PI * 2)
    c.fill()
    c.restore()
    if (foe.isMultiplayerPlayer && foe.hp <= 0) {
      const oppDeathW = opponentKingDeath.destinationSize.width * hs
      const oppDeathH = opponentKingDeath.destinationSize.height * hs
      const floorDrop = opponentKingDeath.currentFrame >= 4
        ? Math.round(14 * (opponentKingDeath.destinationSize.height / 164) * hs)
        : 0
      drawSheet(opponentKingDeath, FOE_SPOT.x - oppDeathW / 2, FOE_SPOT.y - oppDeathH + floorDrop, hs)
      drawStatTag(fx, FOE_SPOT.y - oppDeathH - 10, label, foe.hp, foe.maxHp, labelColor, foe.mana, foe.maxMana, {
        unitKey: 'enemy',
        entityRef: foe,
        subText: `ATK ${foe.attack} · DEF ${foe.defense}`,
      })
    } else if (defeating) {
      const flatten = Math.min(1, defeatProgress / 0.4)
      const bodyAlpha = Math.max(0, 1 - defeatProgress / 0.42)
      if (bodyAlpha > 0.02) {
        c.save()
        c.globalAlpha *= bodyAlpha
        c.translate(fx, fy)
        c.scale(1, Math.max(0.04, 1 - flatten))
        c.translate(-fx, -fy)
        drawFoeSprite(fx)
        c.restore()
      }
      const ghostAlpha = Math.min(0.62, defeatProgress * 2.6) * (1 - defeatProgress)
      if (ghostAlpha > 0.01) {
        const ghostX = fx + Math.sin(defeatProgress * Math.PI * 4) * 10
        drawFoeSprite(ghostX, ghostAlpha, false, true, fy - 80 * defeatProgress)
      }
    } else {
      if (hitProgress > 0.08) {
        drawFoeSprite(fx - hitProgress * 18, 0.14, true)
        drawFoeSprite(fx - hitProgress * 9, 0.24, true)
      }
      drawFoeSprite(fx)
      if (foe.isMultiplayerPlayer) {
        const oppH = opponentKing.destinationSize.height * hs
        if (b.enemyChargeT > 0) {
          c.save()
          c.globalCompositeOperation = 'lighter'
          c.globalAlpha = Math.min(0.6, b.enemyChargeT / 24)
          c.strokeStyle = '#ff9659'
          c.lineWidth = 3
          c.beginPath()
          c.arc(fx, fy - oppH * 0.5, 42 + Math.sin(arenaT * 0.3) * 4, 0, Math.PI * 2)
          c.stroke()
          c.restore()
        }
        if (b.enemyHealTintT > 0) {
          c.save()
          c.globalCompositeOperation = 'lighter'
          c.globalAlpha = Math.min(0.45, b.enemyHealTintT / 18)
          c.fillStyle = '#7fd49a'
          c.beginPath()
          c.arc(fx, fy - oppH * 0.45, 36, 0, Math.PI * 2)
          c.fill()
          c.restore()
        }
        if (typeof mpState !== 'undefined' && mpState?.fighters) {
          const oppRole = mpState.role === 'host' ? 'guest' : 'host'
          const oppBlock = mpState.fighters[oppRole]?.block || 0
          if (oppBlock > 0) {
            drawPixelShield(fx - 46, fy - oppH * 0.48, oppBlock >= 0.75 ? 4 : 3, {
              alpha: oppBlock >= 0.75 ? 0.94 : 0.62,
              highlight: false,
            })
          }
        }
        if (b.enemyDefendEffectT > 0) {
          drawDefendEffect(fx, fy - oppH, {
            facingLeft: true,
            timer: b.enemyDefendEffectT,
            text: 'GUARD UP!',
          })
        }
      }
      const foeHeight = foe.isMultiplayerPlayer
        ? opponentKing.destinationSize.height * hs
        : (foe.isBoss ? BOSS_BATTLE_HEIGHT : 36 * foeScale)
      if (!foe.isMultiplayerPlayer && ((b.enemyStunTurns || 0) > 0 || b.stunAnimT > 0)) {
        c.save()
        c.globalCompositeOperation = 'lighter'
        c.strokeStyle = '#6fe3e8'
        c.lineWidth = b.stunAnimT > 0 ? 4 : 2.5
        c.globalAlpha = b.stunAnimT > 0 ? 0.85 : 0.45 + Math.sin(arenaT * 0.25) * 0.2
        c.beginPath()
        c.ellipse(fx, fy - foeHeight * 0.45, 58, 18, 0.2, 0, Math.PI * 2)
        c.stroke()
        c.beginPath()
        c.ellipse(fx, fy - foeHeight * 0.55, 58, 18, -0.2, 0, Math.PI * 2)
        c.stroke()
        c.restore()
      }
      if (!foe.isMultiplayerPlayer && ((b.enemyBurnTurns || 0) > 0 || b.burnAnimT > 0)) {
        c.save()
        c.globalCompositeOperation = 'lighter'
        const flames = b.burnAnimT > 0 ? 7 : 4
        for (let i = 0; i < flames; i++) {
          const offsetX = Math.sin(arenaT * 0.2 + i * 1.4) * 34
          const offsetY = ((arenaT * 2 + i * 18) % 52)
          c.globalAlpha = 0.72 * (1 - offsetY / 52)
          c.fillStyle = i % 2 === 0 ? '#ff7b47' : '#ffd27a'
          c.fillRect(Math.round(fx + offsetX - 4), Math.round(fy - 18 - offsetY), 8, 8)
        }
        c.restore()
      }
      const foeMetaText = foe.isMultiplayerPlayer
        ? `ATK ${foe.attack} · DEF ${foe.defense}`
        : `${foe.attack} ATK · ${isHeavy(foe) ? '! HEAVY NEXT' : 'NORMAL NEXT'}`
      const mpOppDefBuff = Boolean(
        foe.isMultiplayerPlayer &&
        typeof mpState !== 'undefined' &&
        mpState?.fighters &&
        (mpState.fighters[mpState.role === 'host' ? 'guest' : 'host']?.block || 0) >= 0.75
      )
      drawStatTag(fx, FOE_SPOT.y - foeHeight - 10, label, foe.hp, foe.maxHp, labelColor, foe.mana, foe.maxMana, {
        unitKey: 'enemy',
        entityRef: foe,
        subText: foeMetaText,
        isHeavyIntent: !foe.isMultiplayerPlayer && isHeavy(foe),
        defBuffActive: mpOppDefBuff,
      })
      if (!foe.isMultiplayerPlayer && ((b.enemyStunTurns || 0) > 0 || (b.enemyBurnTurns || 0) > 0)) {
        const pills = []
        if ((b.enemyStunTurns || 0) > 0) pills.push({ text: `STUNNED ${b.enemyStunTurns}t`, color: '#6fe3e8', bg: '#0e2830' })
        if ((b.enemyBurnTurns || 0) > 0) pills.push({ text: `BURNING ${b.enemyBurnTurns}t`, color: '#ff9659', bg: '#2f140d' })
        let pillY = fy - foeHeight - (foe.mana !== undefined ? 86 : 70)
        c.save()
        c.font = window.ByteboundFont.canvas(9)
        c.textAlign = 'center'
        c.textBaseline = 'middle'
        for (const pill of pills) {
          const pw = Math.max(128, c.measureText(pill.text).width + 20)
          c.fillStyle = pill.bg
          c.fillRect(Math.round(fx - pw / 2), Math.round(pillY - 10), pw, 20)
          c.strokeStyle = pill.color
          c.lineWidth = 2
          c.strokeRect(Math.round(fx - pw / 2), Math.round(pillY - 10), pw, 20)
          c.fillStyle = pill.color
          c.fillText(pill.text, fx, pillY + 1)
          pillY -= 24
        }
        c.restore()
      }
    }
    if (foe.isBoss && b.bossAttackT > 0) b.bossAttackT--
    if (foe.brute && !foe.isBoss && b.driusAttackT > 0) b.driusAttackT--
  }
}

function drawPopups() {
  battle.popups = battle.popups.filter((p) => p.life > 0)
  const isReducedMotion = document.body.classList.contains('reduce-motion') ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  c.textAlign = 'center'
  battle.popups.forEach((p) => {
    const progress = 1 - p.life / p.duration
    p.y = isReducedMotion ? p.originY : (p.originY - p.rise * progress)
    p.life--
    c.globalAlpha = Math.max(0, p.life / p.duration)
    c.fillStyle = p.color
    if (p.style === 'heal') {
      const popScale = isReducedMotion ? 1 : (1 + 0.24 * Math.max(0, 1 - progress * 6))
      c.font = window.ByteboundFont.canvas(Math.round(13 * popScale))
      c.lineWidth = 3
      c.strokeStyle = '#174d3b'
      c.strokeText(p.text, p.x, p.y)
    } else {
      c.font = window.ByteboundFont.canvas(18)
    }
    c.fillText(p.text, p.x, p.y)
  })
  c.globalAlpha = 1
  c.textAlign = 'left'
}

function drawBattle() {
  const b = battle
  const chargeProgress = currentChargeProgress()
  if (b.chargeCard && chargeProgress >= 1) {
    b.chargeReady = true
  }
  if (b.projectileQueued && !b.chargeReady && (!b.chargeCard || performance.now() - (b.chargeStartedAt || 0) > 1200)) {
    b.chargeReady = true
  }
  if (b.projectileQueued && b.chargeReady) {
    b.projectileQueued = false
    b.projectileT = 0
    b.chargeCard = false
    b.chargeMaxT = 10
  }
  const reducedMotion = isReducedMotionActive()
  const shake = !reducedMotion && b.flash.enemy > 0 ? Math.sin((12 - b.flash.enemy) * 2.6) * 3 : 0
  const hitProgress = !reducedMotion && b.hitT > 0 ? Math.sin((1 - b.hitT) * Math.PI) : 0
  const zoom = 1 + hitProgress * 0.075
  const cameraPush = hitProgress * b.cameraPushDistance
  const cameraShakeX = !reducedMotion && b.cameraShakeT > 0
    ? Math.sin((1 - b.cameraShakeT) * Math.PI * 6) * b.cameraShakeT * 6
    : 0
  const cameraShakeY = !reducedMotion && b.cameraShakeT > 0
    ? Math.cos((1 - b.cameraShakeT) * Math.PI * 6) * b.cameraShakeT * 3
    : 0
  c.save()
  c.translate(canvas.width / 2 - cameraPush + cameraShakeX, canvas.height / 2 - hitProgress * 3 + cameraShakeY)
  c.scale(zoom, zoom)
  c.translate(-canvas.width / 2, -canvas.height / 2)
  drawArena()
  drawCombatants(HERO_SPOT.x, FOE_SPOT.x, shake)
  drawAttackProjectile()
  drawEnemyProjectile()
  drawImpactRings()
  drawCardActionAnim()
  drawFx()
  drawPopups()
  c.restore()
  if (typeof multiplayerMatchActive !== 'undefined' && multiplayerMatchActive && typeof mpState !== 'undefined' && b.phase !== 'mp_dying' && b.phase !== 'mp_won' && b.phase !== 'mp_lost') {
    const myTurn = typeof mpIsMyTurn === 'function' && mpIsMyTurn() && b.phase !== 'mp_waiting'
    const turnLabel = myTurn
      ? `> YOUR TURN  //  TURN ${mpState.round + 1}`
      : `WAIT: ${String(mpState.opponentName || 'OPPONENT').toUpperCase()}'S TURN  //  TURN ${mpState.round + 1}`
    c.save()
    c.font = window.ByteboundFont.canvas(10)
    const tw = Math.max(280, c.measureText(turnLabel).width + 32)
    const tx = Math.round((canvas.width - tw) / 2)
    const ty = 14
    c.fillStyle = 'rgba(13, 18, 22, 0.88)'
    c.fillRect(tx, ty, tw, 28)
    c.strokeStyle = myTurn ? '#f2bb61' : '#6fe3e8'
    c.lineWidth = 2
    c.strokeRect(tx, ty, tw, 28)
    c.fillStyle = myTurn ? '#f2bb61' : '#6fe3e8'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(turnLabel, canvas.width / 2, ty + 15)
    c.restore()
  }
  if (b.lungeT > 0) b.lungeT -= 0.04
  if (b.allyLungeT > 0) b.allyLungeT -= 0.06
  if (b.allyAttackT > 0) b.allyAttackT--
  if (Array.isArray(b.allyLungeTs)) {
    for (let i = 0; i < b.allyLungeTs.length; i++) if (b.allyLungeTs[i] > 0) b.allyLungeTs[i] = Math.max(0, b.allyLungeTs[i] - 0.06)
  }
  if (Array.isArray(b.allyAttackTs)) {
    for (let i = 0; i < b.allyAttackTs.length; i++) if (b.allyAttackTs[i] > 0) b.allyAttackTs[i]--
  }
  if (b.aegisAnimT > 0) b.aegisAnimT--
  if (b.stunAnimT > 0) b.stunAnimT--
  if (b.burnAnimT > 0) b.burnAnimT--
  if (b.cardAnim && b.cardAnim.t > 0) b.cardAnim.t--
  if (b.enemyLungeT > 0) b.enemyLungeT -= 0.04
  if (b.enemyFollower && b.enemyFollower.lungeT > 0) b.enemyFollower.lungeT = Math.max(0, b.enemyFollower.lungeT - 0.05)
  if (b.hitT > 0) b.hitT = Math.max(0, b.hitT - 0.065)
  if (b.heroHitT > 0) b.heroHitT--
  if (b.heroHitTintT > 0) b.heroHitTintT--
  if (b.heroHealFlashT > 0) b.heroHealFlashT--
  if (b.heroHealTintT > 0) b.heroHealTintT--
  if (b.defendEffectT > 0) b.defendEffectT--
  if (b.enemyDefendEffectT > 0) b.enemyDefendEffectT--
  if (b.enemyHealTintT > 0) b.enemyHealTintT--
  if (b.enemyChargeT > 0) b.enemyChargeT--
  if (b.heroKnockbackT >= 0) {
    if (b.heroKnockbackT >= HERO_KNOCKBACK_TICKS) b.heroKnockbackT = -1
    else b.heroKnockbackT++
  }
  if (b.enemyInvertT > 0) b.enemyInvertT--
  if (b.cameraShakeT > 0) b.cameraShakeT = Math.max(0, b.cameraShakeT - 0.16)
  if (b.impactRingT > 0) b.impactRingT = Math.max(0, b.impactRingT - 0.08)
  if (b.enemyImpactRingT > 0) b.enemyImpactRingT = Math.max(0, b.enemyImpactRingT - 0.08)
  if (b.enemyDefeatT >= 0 && b.enemyDefeatT < 1) {
    b.enemyDefeatT = Math.min(1, b.enemyDefeatT + 0.02)
  }
  if (b.chargeMaxT > 0 && !b.chargeCard) b.chargeMaxT--
  if (b.flash.hero > 0) b.flash.hero--
  if (b.flash.enemy > 0) b.flash.enemy--
  if (b.phase === 'dying') {
    b.deathTimer = (b.deathTimer || 0) + 1
    if (b.deathTimer >= 85) {
      b.phase = 'lost'
      renderLose()
    }
  } else if (b.phase === 'mp_dying' && typeof mpState !== 'undefined') {
    mpState.deathCountdown = Math.max(0, (mpState.deathCountdown || 0) - 1)
    if (mpState.deathCountdown <= 0) {
      renderMultiplayerResult()
    }
  }
}

function drawMenu() {
  const W = canvas.width, H = canvas.height
  drawArenaBackground()
  const heroScale = 2
  const heroWidth = battleKing.destinationSize.width * heroScale
  const heroHeight = battleKing.destinationSize.height * heroScale
  const floorY = HERO_SPOT.y + 55
  drawSheet(battleKing, W * 0.27 - heroWidth / 2, floorY - heroHeight, heroScale, false)
  drawPig(c, W * 0.72 - 24 * 3.2, floorY - 36 * 3.2, 3.2, true)
}

function startGame() {
  if (!activePlayerName) return
  Sound.ensure()
  playViewActive = true
  newGame()
  gsap.killTweensOf(overlay)
  gsap.fromTo(overlay, { opacity: 1 }, { opacity: 0, duration: 0.6 })
  syncAnimationLoop()
}

const RUN_SAVES_STORAGE_KEY = 'bytebound-run-saves-v1'
const RUN_SAVE_SCHEMA_VERSION = 2
let activeRunSaveId = null
let activeRunName = ''
let activeRunRoleFocus = ''
let runSaveSuspendCount = 0
let lastExploreSaveCheckpoint = { runId: null, level: 0, x: NaN, y: NaN, at: 0 }
let runRecoveryNoticeTimer = 0

function getRunProfileId(profileId) {
  if (typeof profileId === 'string' && profileId.trim()) return getUsernameKey(profileId)
  return getUsernameKey(activePlayerName)
}

function getRunSavesStorageKey(profileId = activePlayerName) {
  return `${RUN_SAVES_STORAGE_KEY}:${encodeURIComponent(getRunProfileId(profileId))}`
}

function loadRunSaves(profileId = activePlayerName) {
  const key = getRunProfileId(profileId)
  if (!key) return { activeId: null, saves: [] }
  try {
    const raw = localStorage.getItem(getRunSavesStorageKey(key))
    if (!raw) return { activeId: null, saves: [] }
    const parsed = JSON.parse(raw)
    const rawSaves = Array.isArray(parsed?.saves) ? parsed.saves : []
    const validSaves = rawSaves.filter((s) => s && typeof s === 'object' && typeof s.id === 'string' && s.id.trim())
    const activeId = typeof parsed?.activeId === 'string' && validSaves.some((s) => s.id === parsed.activeId)
      ? parsed.activeId
      : null
    return { activeId, saves: validSaves }
  } catch {
    return { activeId: null, saves: [] }
  }
}

function writeRunSaves(data, profileId = activePlayerName) {
  const key = getRunProfileId(profileId)
  if (!key || !data || !Array.isArray(data.saves)) return
  try {
    const sanitized = {
      version: RUN_SAVE_SCHEMA_VERSION,
      activeId: typeof data.activeId === 'string' ? data.activeId : null,
      saves: data.saves.filter((s) => s && typeof s === 'object' && typeof s.id === 'string' && s.id.trim()),
    }
    localStorage.setItem(getRunSavesStorageKey(key), JSON.stringify(sanitized))
  } catch (error) {
    console.error('Unable to save run slots.', error)
  }
}

function resetExploreCheckpointTracker() {
  lastExploreSaveCheckpoint = {
    runId: activeRunSaveId,
    level,
    x: Number.isFinite(player?.position?.x) ? player.position.x : NaN,
    y: Number.isFinite(player?.position?.y) ? player.position.y : NaN,
    at: performance.now(),
  }
}

function maybeCheckpointExplorePosition() {
  if (
    !activePlayerName ||
    !activeRunSaveId ||
    practiceRunActive ||
    multiplayerMatchActive ||
    runSaveSuspendCount > 0 ||
    mode !== 'explore' ||
    !playViewActive ||
    player?.preventInput
  ) {
    return
  }
  const px = player?.position?.x
  const py = player?.position?.y
  if (!Number.isFinite(px) || !Number.isFinite(py)) return
  // Save only when grounded so we never persist mid-air positions over pits or ceilings
  const grounded = Math.abs(player?.velocity?.y || 0) < 0.05
  if (!grounded) return
  const now = performance.now()
  const sameContext = lastExploreSaveCheckpoint.runId === activeRunSaveId && lastExploreSaveCheckpoint.level === level
  const dx = sameContext && Number.isFinite(lastExploreSaveCheckpoint.x) ? Math.abs(px - lastExploreSaveCheckpoint.x) : Infinity
  const dy = sameContext && Number.isFinite(lastExploreSaveCheckpoint.y) ? Math.abs(py - lastExploreSaveCheckpoint.y) : Infinity
  const dist = Math.hypot(dx, dy)
  const stopped = Math.abs(player?.velocity?.x || 0) < 0.05
  const elapsed = now - (lastExploreSaveCheckpoint.at || 0)
  if ((dist >= 44 && elapsed >= 900) || (stopped && dist >= 16 && elapsed >= 350)) {
    saveCurrentRunSlot()
  }
}

function hideRunRecoveryNotice() {
  window.clearTimeout(runRecoveryNoticeTimer)
  runRecoveryNoticeTimer = 0
  const el = document.getElementById('runRecoveryNotice')
  if (el) el.remove()
}

function showRunRecoveryNotice(message) {
  if (!message) return
  hideRunRecoveryNotice()
  const host = document.querySelector('#app .play-stage') || document.getElementById('app') || document.body
  if (!host) return
  const el = document.createElement('div')
  el.id = 'runRecoveryNotice'
  el.className = 'run-recovery-notice'
  el.setAttribute('role', 'status')
  el.setAttribute('aria-live', 'polite')
  el.innerHTML = `<span class="run-recovery-tag">SAVE RECOVERED</span><span class="run-recovery-text">${esc(message)}</span><button type="button" class="run-recovery-dismiss" aria-label="Dismiss recovery notice">OK</button>`
  el.querySelector('.run-recovery-dismiss')?.addEventListener('click', hideRunRecoveryNotice)
  host.appendChild(el)
  runRecoveryNoticeTimer = window.setTimeout(hideRunRecoveryNotice, 7500)
}

function getRunRoleSummary(save) {
  const ex = save?.exclusiveSkillTree
  if (ex === 'computerSystems') return { label: 'Kernel Aegis · Computer Systems', theme: 'cs' }
  if (ex === 'networkingSecurity') return { label: 'Packet Lockdown · Networking', theme: 'ns' }
  if (ex === 'programming') return { label: 'Overburn Execution · Programming', theme: 'pr' }
  if (ex === 'database') return { label: 'Necromancy Pact · Database', theme: 'db' }
  const focus = save?.roleFocus
  if (focus === 'computerSystems') return { label: 'Focus: Computer Systems', theme: 'cs' }
  if (focus === 'networkingSecurity') return { label: 'Focus: Networking & Security', theme: 'ns' }
  if (focus === 'programming') return { label: 'Focus: Programming', theme: 'pr' }
  if (focus === 'database') return { label: 'Focus: Database', theme: 'db' }
  return { label: 'Unbound · Any Path', theme: 'none' }
}

function countRunSkillRanks(save) {
  let total = 0
  const sp = save?.skillProgress
  if (!sp || typeof sp !== 'object') return 0
  for (const key of SKILL_TREE_KEYS) {
    const ranks = sp[key]?.ranks
    if (!ranks) continue
    for (const r of Object.values(ranks)) total += Number(r) || 0
  }
  return total
}

function serializeQuestionSnapshot(q) {
  if (!q || typeof q !== 'object' || typeof q.q !== 'string' || !Array.isArray(q.choices) || !q.choices.length) {
    return null
  }
  const answer = Number.isInteger(q.answer) ? q.answer : -1
  if (answer < 0 || answer >= q.choices.length) return null
  return {
    q: q.q,
    choices: q.choices.map((c) => String(c)),
    answer,
    explain: typeof q.explain === 'string' ? q.explain : '',
    category: typeof q.category === 'string' ? q.category : 'Computer Systems',
    topic: typeof q.topic === 'string' ? q.topic : 'General',
    difficulty: typeof q.difficulty === 'string' ? q.difficulty : 'easy',
    ...(typeof q.remedialSource === 'string' ? { remedialSource: q.remedialSource } : {}),
  }
}

function serializePlayerExploreState() {
  const x = Number.isFinite(player?.position?.x) ? Math.round(player.position.x * 100) / 100 : null
  const y = Number.isFinite(player?.position?.y) ? Math.round(player.position.y * 100) / 100 : null
  return {
    x,
    y,
    facing: player?.lastDirection === 'left' ? 'left' : 'right',
    cameraX: Number.isFinite(exploreCamera?.x) ? Math.round(exploreCamera.x * 100) / 100 : 0,
    cameraY: Number.isFinite(exploreCamera?.y) ? Math.round(exploreCamera.y * 100) / 100 : 0,
  }
}

function serializeRunEnemies() {
  if (!Array.isArray(enemies)) return []
  return enemies.map((e, index) => ({
    index,
    alive: Boolean(e?.alive),
    x: Number.isFinite(e?.x) ? Math.round(e.x * 100) / 100 : 0,
    y: Number.isFinite(e?.y) ? Math.round(e.y * 100) / 100 : 0,
    vx: Number.isFinite(e?.vx) ? Math.round(e.vx * 1000) / 1000 : 0,
    dir: e?.dir === -1 ? -1 : 1,
    hp: Number.isFinite(e?.hp) ? Math.max(0, Math.round(e.hp)) : 0,
    maxHp: Number.isFinite(e?.maxHp) ? Math.max(1, Math.round(e.maxHp)) : 1,
    turns: Number.isInteger(e?.turns) && e.turns >= 0 ? e.turns : 0,
  }))
}

function serializeBattleState() {
  if (mode !== 'battle' && mode !== 'intro') return null
  if (!battle || !battle.enemy || battle.enemy.isMultiplayerPlayer) return null
  const enemyIndex = Array.isArray(enemies) ? enemies.indexOf(battle.enemy) : -1
  let safePhase = String(battle.phase || 'choose')
  if (mode === 'intro' || safePhase === 'intro') safePhase = 'choose'
  else if (safePhase === 'dying') safePhase = 'lost'

  const validPhases = new Set([
    'choose', 'question', 'feedback', 'remedial',
    'ally_turn', 'enemy_follower_turn', 'necro_prompt',
    'won', 'reward', 'upgrade', 'lost',
  ])
  if (!validPhases.has(safePhase)) safePhase = 'choose'

  const enemySnap = {
    name: String(battle.enemy.name || 'Virus'),
    hp: Math.max(0, Math.round(Number(battle.enemy.hp) || 0)),
    maxHp: Math.max(1, Math.round(Number(battle.enemy.maxHp) || 1)),
    attack: Math.max(1, Math.round(Number(battle.enemy.attack) || 10)),
    heavyEvery: Math.max(1, Math.round(Number(battle.enemy.heavyEvery) || 3)),
    turns: Math.max(0, Math.round(Number(battle.enemy.turns) || 0)),
    alive: Boolean(battle.enemy.alive),
    isBoss: Boolean(battle.enemy.isBoss),
    isFinal: Boolean(battle.enemy.isFinal),
    kor: Boolean(battle.enemy.kor),
    brute: Boolean(battle.enemy.brute),
    nyrmed: Boolean(battle.enemy.nyrmed),
    grenu: Boolean(battle.enemy.grenu),
  }

  const followerSnap = battle.enemyFollower && typeof battle.enemyFollower === 'object'
    ? {
        name: String(battle.enemyFollower.name || 'Grenu'),
        grenu: Boolean(battle.enemyFollower.grenu),
        hp: Math.max(0, Math.round(Number(battle.enemyFollower.hp) || 0)),
        maxHp: Math.max(1, Math.round(Number(battle.enemyFollower.maxHp) || 1)),
        attack: Math.max(1, Math.round(Number(battle.enemyFollower.attack) || 9)),
      }
    : null

  const remedialSnap = safePhase === 'remedial' && battle.remedial && Array.isArray(battle.remedial.questions)
    ? {
        questions: battle.remedial.questions.map(serializeQuestionSnapshot).filter(Boolean),
        index: Math.max(0, Math.round(Number(battle.remedial.index) || 0)),
        results: Array.isArray(battle.remedial.results) ? battle.remedial.results.map(Boolean) : [],
        correctCount: Math.max(0, Math.round(Number(battle.remedial.correctCount) || 0)),
      }
    : null

  const outcomeFlags = {
    killRecorded: Boolean(battle.outcomeFlags?.killRecorded || ['necro_prompt', 'won', 'reward', 'upgrade'].includes(safePhase)),
    rewardClaimed: Boolean(battle.outcomeFlags?.rewardClaimed || safePhase === 'upgrade'),
    upgradeClaimed: Boolean(battle.outcomeFlags?.upgradeClaimed),
    necroResolved: Boolean(battle.outcomeFlags?.necroResolved || ['won', 'reward', 'upgrade'].includes(safePhase)),
  }

  return {
    enemyIndex,
    enemy: enemySnap,
    enemyFollower: followerSnap,
    phase: safePhase,
    card: typeof battle.card === 'string' && CARD_LIBRARY[battle.card] ? battle.card : null,
    question: serializeQuestionSnapshot(battle.question),
    fromReview: Boolean(battle.fromReview),
    feedbackCorrect: Boolean(battle.feedbackCorrect),
    feedbackNotes: Array.isArray(battle.feedbackNotes) ? battle.feedbackNotes.map((n) => String(n)) : [],
    remedial: remedialSnap,
    allyTurnIndex: Math.max(0, Math.round(Number(battle.allyTurnIndex) || 0)),
    allyTurnMessage: typeof battle.allyTurnMessage === 'string' ? battle.allyTurnMessage : '',
    enemyFollowerMessage: typeof battle.enemyFollowerMessage === 'string' ? battle.enemyFollowerMessage : '',
    block: Number.isFinite(battle.block) ? Math.max(0, Math.min(1, battle.block)) : 0,
    tempDefense: Math.max(0, Math.round(Number(battle.tempDefense) || 0)),
    remedialDefenseBuff: Boolean(battle.remedialDefenseBuff),
    defendCooldownTurns: Math.max(0, Math.round(Number(battle.defendCooldownTurns) || 0)),
    defendUsedThisTurn: Boolean(battle.defendUsedThisTurn),
    exclusiveCooldownTurns: Math.max(0, Math.round(Number(battle.exclusiveCooldownTurns) || 0)),
    exclusiveUsedThisTurn: Boolean(battle.exclusiveUsedThisTurn),
    exclusiveAppearTick: Math.max(0, Math.round(Number(battle.exclusiveAppearTick) || 0)),
    enemyStunTurns: Math.max(0, Math.round(Number(battle.enemyStunTurns) || 0)),
    enemyBurnTurns: Math.max(0, Math.round(Number(battle.enemyBurnTurns) || 0)),
    enemyBurnDamage: Math.max(0, Math.round(Number(battle.enemyBurnDamage) || 0)),
    enemyAttackedThisTurn: Boolean(battle.enemyAttackedThisTurn),
    lastAnswerCorrect: battle.lastAnswerCorrect !== false,
    log: typeof battle.log === 'string' ? battle.log : '',
    hand: Array.isArray(battle.hand) ? battle.hand.filter((id) => Boolean(CARD_LIBRARY[id])) : [],
    drawPile: Array.isArray(battle.drawPile) ? battle.drawPile.filter((id) => Boolean(CARD_LIBRARY[id])) : [],
    discard: Array.isArray(battle.discard) ? battle.discard.filter((id) => Boolean(CARD_LIBRARY[id])) : [],
    rewards: Array.isArray(battle.rewards) ? battle.rewards.filter((id) => Boolean(CARD_LIBRARY[id])) : [],
    upgradeNames: Array.isArray(battle.upgrades)
      ? battle.upgrades.map((u) => (typeof u === 'string' ? u : u?.name)).filter(Boolean)
      : [],
    newUnlocks: Array.isArray(battle.newUnlocks) ? battle.newUnlocks.filter((id) => Boolean(CARD_LIBRARY[id])) : [],
    necroCandidate: battle.necroCandidate && typeof battle.necroCandidate === 'object'
      ? clonePracticeData(battle.necroCandidate)
      : null,
    outcomeFlags,
  }
}

function serializeHeroSnapshot() {
  const allies = Array.isArray(hero.necroAllies)
    ? hero.necroAllies.filter((a) => a && typeof a === 'object').map((a) => clonePracticeData(a))
    : (hero.necroAlly && typeof hero.necroAlly === 'object' ? [clonePracticeData(hero.necroAlly)] : [])
  return {
    hp: Math.max(0, Math.round(Number(hero.hp) || 0)),
    maxHp: Math.max(1, Math.round(Number(hero.maxHp) || 100)),
    mana: Math.max(0, Math.round(Number(hero.mana) || 0)),
    maxMana: Math.max(1, Math.round(Number(hero.maxMana) || 100)),
    attack: Math.max(1, Math.round(Number(hero.attack) || 12)),
    defense: Math.max(0, Math.round(Number(hero.defense) || 2)),
    empowerCost: Math.max(0, Math.round(Number(hero.empowerCost) || 20)),
    bonusHeal: Math.max(0, Math.round(Number(hero.bonusHeal) || 0)),
    bonusMana: Math.max(0, Math.round(Number(hero.bonusMana) || 0)),
    runInvincible: Boolean(hero.runInvincible),
    tempAttack: Math.max(0, Math.round(Number(hero.tempAttack) || 0)),
    necroAllies: allies,
    necroAlly: allies[0] || null,
  }
}

function snapshotCurrentRunSave() {
  const battleSnap = serializeBattleState()
  const savedMode = mode === 'end'
    ? 'end'
    : (battleSnap ? 'battle' : 'explore')
  return {
    version: RUN_SAVE_SCHEMA_VERSION,
    id: activeRunSaveId,
    name: activeRunName || 'Run',
    roleFocus: activeRunRoleFocus || '',
    updatedAt: new Date().toISOString(),
    level,
    roomName: currentRoom?.name || `Room ${level}`,
    arenaTheme: currentRoom?.arenaTheme || 'datacenter',
    mode: savedMode,
    clearedRooms: [...clearedRooms].filter((r) => Number.isInteger(r) && r >= 1),
    visitedRooms: [...visitedRooms].filter((r) => Number.isInteger(r) && r >= 1),
    playerState: serializePlayerExploreState(),
    enemies: serializeRunEnemies(),
    battle: battleSnap,
    hero: serializeHeroSnapshot(),
    stats: {
      kills: Math.max(0, Math.round(Number(stats.kills) || 0)),
      correct: Math.max(0, Math.round(Number(stats.correct) || 0)),
      total: Math.max(0, Math.round(Number(stats.total) || 0)),
      streak: Math.max(0, Math.round(Number(stats.streak) || 0)),
      roomKills: Math.max(0, Math.round(Number(stats.roomKills) || 0)),
      upgrades: Array.isArray(stats.upgrades) ? stats.upgrades.map((u) => String(u)) : [],
      cardsTaken: Math.max(0, Math.round(Number(stats.cardsTaken) || 0)),
    },
    runDeck: runDeck.filter((id) => Boolean(CARD_LIBRARY[id])),
    adaptive: {
      level: Number.isInteger(adaptive.level) ? Math.max(0, Math.min(2, adaptive.level)) : 0,
      mediumStreak: Number.isInteger(adaptive.mediumStreak) ? Math.max(0, adaptive.mediumStreak) : 0,
      focusCategory: typeof adaptive.focusCategory === 'string' ? adaptive.focusCategory : null,
      categoryState: clonePracticeData(adaptive.categoryState),
    },
    skillProgress: clonePracticeData(skillProgress),
    activeSkillSpecialization,
    exclusiveSkillTree,
    leaderboardRunId,
  }
}

function saveCurrentRunSlot() {
  if (!activePlayerName || practiceRunActive || multiplayerMatchActive || !activeRunSaveId || runSaveSuspendCount > 0) return
  const profileId = getRunProfileId()
  if (!profileId) return
  if (mode === 'menu') {
    // On the hub/menu (e.g. upgrading skills before resuming), update ONLY skill fields without overwriting saved room/position/battle!
    const store = loadRunSaves(profileId)
    const idx = store.saves.findIndex((s) => s && s.id === activeRunSaveId)
    if (idx >= 0) {
      store.saves[idx].skillProgress = clonePracticeData(skillProgress)
      store.saves[idx].activeSkillSpecialization = activeSkillSpecialization
      store.saves[idx].exclusiveSkillTree = exclusiveSkillTree
      store.saves[idx].updatedAt = new Date().toISOString()
      store.activeId = activeRunSaveId
      writeRunSaves(store, profileId)
    }
    return
  }
  const store = loadRunSaves(profileId)
  const snap = snapshotCurrentRunSave()
  const idx = store.saves.findIndex((s) => s && s.id === activeRunSaveId)
  if (idx >= 0) store.saves[idx] = snap
  else store.saves.unshift(snap)
  store.activeId = activeRunSaveId
  writeRunSaves(store, profileId)
  resetExploreCheckpointTracker()
}

function isSafeExplorePosition(x, y, cfg) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false
  const worldScale = cfg?.worldScale || 1
  const worldWidth = Math.round(canvas.width * worldScale)
  const worldHeight = Math.round(canvas.height * worldScale)
  const prevX = player.position.x
  const prevY = player.position.y
  player.position.x = x
  player.position.y = y
  if (typeof player.updateHitbox === 'function') player.updateHitbox()
  const h = player.hitbox
  let safe = true
  if (!h) {
    safe = x >= -64 && x <= worldWidth + 64 && y >= -64 && y <= worldHeight + 64
  } else {
    const outOfBounds =
      h.position.x < -8 ||
      h.position.x + h.width > worldWidth + 8 ||
      h.position.y < -8 ||
      h.position.y + h.height > worldHeight + 8
    if (outOfBounds) {
      safe = false
    } else if (Array.isArray(collisionBlocks)) {
      for (const block of collisionBlocks) {
        if (!block || block.type === 'oneway' || block.type === 'slope') continue
        const overlapX = h.position.x + 2 < block.position.x + block.width && h.position.x + h.width - 2 > block.position.x
        const overlapY = h.position.y + 2 < block.position.y + block.height && h.position.y + h.height - 2 > block.position.y
        if (overlapX && overlapY) {
          safe = false
          break
        }
      }
    }
  }
  player.position.x = prevX
  player.position.y = prevY
  if (typeof player.updateHitbox === 'function') player.updateHitbox()
  return safe
}

function validateAndNormalizeRunSave(rawSave) {
  const notices = []
  let recovered = false
  if (!rawSave || typeof rawSave !== 'object') {
    return {
      save: null,
      recovered: true,
      notices: ['Saved run data was unreadable; started from a safe checkpoint.'],
    }
  }

  const maxLevel = RUN_LENGTH > 0 ? RUN_LENGTH : 999
  const rawLevel = Number(rawSave.level)
  let safeLevel = Number.isInteger(rawLevel) && rawLevel >= 1 && rawLevel <= maxLevel ? rawLevel : 1
  if (rawLevel !== safeLevel) {
    recovered = true
    notices.push('Invalid room number was reset to Room 01.')
  }

  const rawMode = typeof rawSave.mode === 'string' ? rawSave.mode : 'explore'
  let safeMode = rawMode === 'intro' ? 'battle' : rawMode
  if (!['explore', 'battle', 'end'].includes(safeMode)) {
    safeMode = 'explore'
    recovered = true
    notices.push('Unrecognized run phase recovered to room exploration.')
  }

  const cleared = Array.isArray(rawSave.clearedRooms)
    ? [...new Set(rawSave.clearedRooms.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 1 && n <= maxLevel))]
    : []
  const visited = Array.isArray(rawSave.visitedRooms)
    ? [...new Set(rawSave.visitedRooms.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 1 && n <= ROOM_COUNT))]
    : []

  const rawHero = rawSave.hero && typeof rawSave.hero === 'object' ? rawSave.hero : null
  let safeHero = null
  if (rawHero) {
    const maxHp = Number.isFinite(Number(rawHero.maxHp)) && Number(rawHero.maxHp) >= 10 ? Math.round(Number(rawHero.maxHp)) : 100
    const maxMana = Number.isFinite(Number(rawHero.maxMana)) && Number(rawHero.maxMana) >= 10 ? Math.round(Number(rawHero.maxMana)) : 100
    const hpRaw = Number.isFinite(Number(rawHero.hp)) ? Math.round(Number(rawHero.hp)) : maxHp
    const manaRaw = Number.isFinite(Number(rawHero.mana)) ? Math.round(Number(rawHero.mana)) : maxMana
    const allies = Array.isArray(rawHero.necroAllies)
      ? rawHero.necroAllies.filter((a) => a && typeof a === 'object' && typeof a.name === 'string').map((a) => clonePracticeData(a))
      : (rawHero.necroAlly && typeof rawHero.necroAlly === 'object' && typeof rawHero.necroAlly.name === 'string'
        ? [clonePracticeData(rawHero.necroAlly)]
        : [])
    safeHero = {
      hp: Math.max(0, Math.min(maxHp, hpRaw)),
      maxHp,
      mana: Math.max(0, Math.min(maxMana, manaRaw)),
      maxMana,
      attack: Number.isFinite(Number(rawHero.attack)) && Number(rawHero.attack) >= 1 ? Math.round(Number(rawHero.attack)) : 12,
      defense: Number.isFinite(Number(rawHero.defense)) && Number(rawHero.defense) >= 0 ? Math.round(Number(rawHero.defense)) : 2,
      empowerCost: Number.isFinite(Number(rawHero.empowerCost)) && Number(rawHero.empowerCost) >= 0 ? Math.round(Number(rawHero.empowerCost)) : 20,
      bonusHeal: Number.isFinite(Number(rawHero.bonusHeal)) && Number(rawHero.bonusHeal) >= 0 ? Math.round(Number(rawHero.bonusHeal)) : 0,
      bonusMana: Number.isFinite(Number(rawHero.bonusMana)) && Number(rawHero.bonusMana) >= 0 ? Math.round(Number(rawHero.bonusMana)) : 0,
      runInvincible: Boolean(rawHero.runInvincible),
      tempAttack: Number.isFinite(Number(rawHero.tempAttack)) && Number(rawHero.tempAttack) >= 0 ? Math.round(Number(rawHero.tempAttack)) : 0,
      necroAllies: allies,
      necroAlly: allies[0] || null,
    }
  } else {
    recovered = true
    notices.push('Missing hero stats were restored to defaults.')
  }

  const rawStats = rawSave.stats && typeof rawSave.stats === 'object' ? rawSave.stats : {}
  const safeStats = {
    kills: Math.max(0, Math.round(Number(rawStats.kills) || 0)),
    correct: Math.max(0, Math.round(Number(rawStats.correct) || 0)),
    total: Math.max(0, Math.round(Number(rawStats.total) || 0)),
    streak: Math.max(0, Math.round(Number(rawStats.streak) || 0)),
    roomKills: Math.max(0, Math.round(Number(rawStats.roomKills) || 0)),
    upgrades: Array.isArray(rawStats.upgrades) ? rawStats.upgrades.map((u) => String(u)) : [],
    cardsTaken: Math.max(0, Math.round(Number(rawStats.cardsTaken) || 0)),
  }
  if (safeStats.correct > safeStats.total) safeStats.total = safeStats.correct

  const validDeck = Array.isArray(rawSave.runDeck)
    ? rawSave.runDeck.filter((id) => typeof id === 'string' && Boolean(CARD_LIBRARY[id]))
    : []

  const rawPlayer = rawSave.playerState && typeof rawSave.playerState === 'object' ? rawSave.playerState : null
  const safePlayer = rawPlayer
    ? {
        x: Number.isFinite(Number(rawPlayer.x)) ? Number(rawPlayer.x) : null,
        y: Number.isFinite(Number(rawPlayer.y)) ? Number(rawPlayer.y) : null,
        facing: rawPlayer.facing === 'left' ? 'left' : 'right',
        cameraX: Number.isFinite(Number(rawPlayer.cameraX)) ? Number(rawPlayer.cameraX) : null,
        cameraY: Number.isFinite(Number(rawPlayer.cameraY)) ? Number(rawPlayer.cameraY) : null,
      }
    : null

  const safeEnemies = Array.isArray(rawSave.enemies)
    ? rawSave.enemies.map((e, idx) => (e && typeof e === 'object'
      ? {
          index: Number.isInteger(e.index) ? e.index : idx,
          alive: Boolean(e.alive),
          x: Number.isFinite(Number(e.x)) ? Number(e.x) : null,
          y: Number.isFinite(Number(e.y)) ? Number(e.y) : null,
          vx: Number.isFinite(Number(e.vx)) ? Number(e.vx) : null,
          dir: e.dir === -1 ? -1 : 1,
          hp: Number.isFinite(Number(e.hp)) ? Math.max(0, Math.round(Number(e.hp))) : null,
          maxHp: Number.isFinite(Number(e.maxHp)) ? Math.max(1, Math.round(Number(e.maxHp))) : null,
          turns: Number.isInteger(e.turns) && e.turns >= 0 ? e.turns : 0,
        }
      : null))
    : null

  const safeBattle = safeMode === 'battle' && rawSave.battle && typeof rawSave.battle === 'object'
    ? rawSave.battle
    : null
  if (safeMode === 'battle' && !safeBattle) {
    safeMode = 'explore'
    recovered = true
    notices.push('Older mid-battle save had no combat snapshot; resumed safely in the current room.')
  }

  return {
    save: {
      version: Number(rawSave.version) || 1,
      id: rawSave.id,
      name: normalizeRunSaveName(rawSave.name) || 'Saved Run',
      roleFocus: typeof rawSave.roleFocus === 'string' ? rawSave.roleFocus : '',
      level: safeLevel,
      mode: safeMode,
      clearedRooms: cleared,
      visitedRooms: visited,
      playerState: safePlayer,
      enemies: safeEnemies,
      battle: safeBattle,
      hero: safeHero,
      stats: safeStats,
      runDeck: validDeck.length ? validDeck : [...STARTING_DECK],
      adaptive: rawSave.adaptive && typeof rawSave.adaptive === 'object' ? rawSave.adaptive : null,
      skillProgress: rawSave.skillProgress && typeof rawSave.skillProgress === 'object' ? rawSave.skillProgress : null,
      activeSkillSpecialization: rawSave.activeSkillSpecialization || null,
      exclusiveSkillTree: rawSave.exclusiveSkillTree || null,
      leaderboardRunId: typeof rawSave.leaderboardRunId === 'string' && rawSave.leaderboardRunId ? rawSave.leaderboardRunId : createLeaderboardRunId(),
    },
    recovered,
    notices,
  }
}

function getRunSaveStateBadge(save) {
  if (!save) return null
  if (save.mode === 'end') return { label: 'VICTORY', cls: 'is-victory' }
  if (save.mode === 'battle' && save.battle) {
    const phase = save.battle.phase
    if (phase === 'reward') return { label: 'CARD REWARD', cls: 'is-reward' }
    if (phase === 'upgrade') return { label: 'LEVEL UP', cls: 'is-reward' }
    if (phase === 'lost' || phase === 'dying') return { label: 'RETRY ROOM', cls: 'is-lost' }
    if (phase === 'necro_prompt') return { label: 'SOUL PACT', cls: 'is-reward' }
    if (phase === 'won') return { label: 'BATTLE WON', cls: 'is-reward' }
    const foeName = save.battle.enemy?.name
    return { label: foeName ? `IN BATTLE · ${foeName}` : 'IN BATTLE', cls: 'is-battle' }
  }
  return null
}

function renderRunSavesList() {
  const listEl = document.getElementById('runSavesList')
  if (!listEl) return
  const store = loadRunSaves()
  if (!store.saves.length) {
    listEl.innerHTML = `<div class="run-saves-empty">No saved runs yet. Create a new run above to start with a fresh skill build and role!</div>`
    return
  }
  const sorted = [...store.saves].sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0))
  listEl.innerHTML = sorted.map((save) => {
    const role = getRunRoleSummary(save)
    const ranks = countRunSkillRanks(save)
    const isCurrent = save.id === activeRunSaveId && mode !== 'menu'
    const stateBadge = getRunSaveStateBadge(save)
    const totalQ = save.stats?.total || 0
    const acc = totalQ ? `${Math.round((100 * (save.stats?.correct || 0)) / totalQ)}%` : '-'
    const hp = save.hero?.hp ?? 100
    const maxHp = save.hero?.maxHp ?? 100
    const mp = save.hero?.mana ?? 100
    const maxMp = save.hero?.maxMana ?? 100
    const kills = save.stats?.kills ?? 0
    const when = save.updatedAt ? new Date(save.updatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
    return `<article class="run-save-card${isCurrent ? ' is-active-run' : ''} theme-${role.theme}">
      <div class="run-save-main">
        <div class="run-save-top">
          <strong>${esc(save.name || 'Saved Run')}</strong>
          ${isCurrent ? '<span class="run-save-active-pill">ACTIVE</span>' : ''}
          ${stateBadge ? `<span class="run-save-status-pill ${stateBadge.cls}">${esc(stateBadge.label)}</span>` : ''}
          <span class="run-save-role-pill theme-${role.theme}">${esc(role.label)}</span>
        </div>
        <div class="run-save-meta">
          <span>Room ${String(save.level || 1).padStart(2, '0')} (${esc(save.roomName || 'Terminal Bay')})</span>
          <span>${kills} Kills</span>
          <span>HP ${hp}/${maxHp} · MP ${mp}/${maxMp}</span>
          <span>${ranks} Skill Ranks · Acc ${acc}</span>
          <span>${esc(when)}</span>
        </div>
      </div>
      <div class="run-save-actions">
        <button type="button" class="run-save-btn is-continue" data-run-act="continue" data-run-id="${esc(save.id)}">Continue</button>
        <button type="button" class="run-save-btn is-delete" data-run-act="delete" data-run-id="${esc(save.id)}">Delete</button>
      </div>
    </article>`
  }).join('')
}

function normalizeRunSaveName(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim()
}

function validateNewRunName({ showEmptyError = false, overrideName } = {}) {
  const nameInput = document.getElementById('newRunNameInput')
  const createBtn = document.getElementById('createNewRunButton')
  const errorEl = document.getElementById('newRunNameError')
  const rawValue = overrideName !== undefined ? overrideName : (nameInput?.value ?? '')
  const runName = normalizeRunSaveName(rawValue)
  const store = loadRunSaves()
  const lower = runName.toLowerCase()
  const isDuplicate = Boolean(
    runName &&
    store.saves.some((save) => normalizeRunSaveName(save?.name).toLowerCase() === lower)
  )

  let reason = ''
  let visibleError = ''
  if (!runName) {
    reason = 'empty'
    if (showEmptyError) visibleError = 'Please enter a name for your run data.'
  } else if (isDuplicate) {
    reason = 'duplicate'
    visibleError = `A run named "${runName}" already exists. Choose a different name.`
  }

  const valid = !reason
  if (createBtn) createBtn.disabled = !valid
  if (nameInput) nameInput.setAttribute('aria-invalid', visibleError ? 'true' : 'false')
  if (errorEl) {
    errorEl.textContent = visibleError
    errorEl.hidden = !visibleError
  }
  return { valid, runName, reason }
}

function openRunSavesModal() {
  const modal = document.getElementById('runSavesOverlay')
  if (!modal) {
    startGame()
    return
  }
  const nameInput = document.getElementById('newRunNameInput')
  if (nameInput) nameInput.value = ''
  renderRunSavesList()
  validateNewRunName({ showEmptyError: false })
  modal.hidden = false
  modal.setAttribute('aria-hidden', 'false')
  nameInput?.focus()
}

function closeRunSavesModal() {
  const modal = document.getElementById('runSavesOverlay')
  if (!modal) return
  modal.hidden = true
  modal.setAttribute('aria-hidden', 'true')
}

function createAndStartNewRun(options = {}) {
  if (!activePlayerName) return false
  const nameInput = document.getElementById('newRunNameInput')
  const check = validateNewRunName({ showEmptyError: true, overrideName: options.name })
  if (!check.valid) {
    nameInput?.focus()
    return false
  }
  const runName = check.runName

  // Save the previously active run BEFORE mutating any state or switching activeRunSaveId
  if (activeRunSaveId && mode !== 'menu') {
    saveCurrentRunSlot()
  }

  hideRunRecoveryNotice()
  closeRunSavesModal()

  runSaveSuspendCount++
  try {
    activeRunSaveId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    activeRunName = runName
    activeRunRoleFocus = ''
    keys.w.pressed = false
    keys.a.pressed = false
    keys.d.pressed = false
    if (typeof resetRuntimeBattleState === 'function') resetRuntimeBattleState()
    if (typeof resetSkillTreeForNewRun === 'function') resetSkillTreeForNewRun()
    startGame()
  } finally {
    runSaveSuspendCount = Math.max(0, runSaveSuspendCount - 1)
  }

  saveCurrentRunSlot()
  return true
}

function restoreSavedBattleState(savedBattle, notices) {
  let recovered = false
  if (!savedBattle || typeof savedBattle !== 'object') {
    notices.push('Combat snapshot was missing; resumed at the room checkpoint.')
    return { restored: false, recovered: true }
  }

  const rawIdx = Number(savedBattle.enemyIndex)
  let foe = Number.isInteger(rawIdx) && rawIdx >= 0 && rawIdx < enemies.length ? enemies[rawIdx] : null
  if (!foe && savedBattle.enemy && typeof savedBattle.enemy === 'object') {
    foe = enemies.find((e) => e && e.name === savedBattle.enemy.name && e.alive) || enemies.find((e) => e && e.alive) || enemies[0] || null
  }
  if (!foe) {
    notices.push('Saved enemy could not be found in this room; resumed in exploration.')
    return { restored: false, recovered: true }
  }

  const enemySnap = savedBattle.enemy && typeof savedBattle.enemy === 'object' ? savedBattle.enemy : null
  if (enemySnap) {
    if (Number.isFinite(Number(enemySnap.maxHp)) && Number(enemySnap.maxHp) >= 1) {
      foe.maxHp = Math.round(Number(enemySnap.maxHp))
    }
    if (Number.isFinite(Number(enemySnap.hp))) {
      foe.hp = Math.max(0, Math.min(foe.maxHp, Math.round(Number(enemySnap.hp))))
    }
    if (Number.isInteger(enemySnap.turns) && enemySnap.turns >= 0) {
      foe.turns = enemySnap.turns
    }
    foe.alive = Boolean(enemySnap.alive)
  }

  let phase = typeof savedBattle.phase === 'string' ? savedBattle.phase : 'choose'
  if (phase === 'intro') phase = 'choose'
  if (phase === 'dying') phase = 'lost'

  const outcomeFlags = {
    killRecorded: Boolean(savedBattle.outcomeFlags?.killRecorded || ['necro_prompt', 'won', 'reward', 'upgrade'].includes(phase)),
    rewardClaimed: Boolean(savedBattle.outcomeFlags?.rewardClaimed || phase === 'upgrade'),
    upgradeClaimed: Boolean(savedBattle.outcomeFlags?.upgradeClaimed),
    necroResolved: Boolean(savedBattle.outcomeFlags?.necroResolved || ['won', 'reward', 'upgrade'].includes(phase)),
  }

  // If hero already died, keep them cleanly in 'lost' (Retry Room overlay)
  if (hero.hp <= 0 || phase === 'lost') {
    phase = 'lost'
    hero.hp = 0
  }

  // Reconcile already-defeated enemy vs combat phase so dead enemies never respawn or re-trigger kills
  const combatPhases = new Set(['choose', 'question', 'feedback', 'remedial', 'ally_turn', 'enemy_follower_turn'])
  if (combatPhases.has(phase) && (foe.hp <= 0 || !foe.alive)) {
    if (outcomeFlags.upgradeClaimed || (outcomeFlags.rewardClaimed && !(stats.kills > 0 && stats.kills % 2 === 0))) {
      foe.alive = false
      foe.hp = 0
      notices.push('Completed battle was already resolved; resumed safely in the room.')
      return { restored: false, recovered: true }
    }
    if (outcomeFlags.killRecorded) {
      foe.alive = false
      foe.hp = 0
      phase = outcomeFlags.rewardClaimed ? 'upgrade' : 'won'
      recovered = true
      notices.push('Enemy was already defeated; resumed at post-battle resolution.')
    } else if (phase !== 'feedback') {
      foe.alive = false
      foe.hp = 0
      phase = 'won'
      recovered = true
    }
  }

  // Restore clean battle state (zero stale animation/UI timers)
  resetRuntimeBattleState()
  if (typeof setArenaTheme === 'function') {
    setArenaTheme((currentRoom && currentRoom.arenaTheme) || 'datacenter')
  }

  const validHand = Array.isArray(savedBattle.hand) ? savedBattle.hand.filter((id) => Boolean(CARD_LIBRARY[id])) : []
  const validDraw = Array.isArray(savedBattle.drawPile) ? savedBattle.drawPile.filter((id) => Boolean(CARD_LIBRARY[id])) : []
  const validDiscard = Array.isArray(savedBattle.discard) ? savedBattle.discard.filter((id) => Boolean(CARD_LIBRARY[id])) : []

  const followerSnap = savedBattle.enemyFollower && typeof savedBattle.enemyFollower === 'object'
    ? {
        name: String(savedBattle.enemyFollower.name || 'Grenu'),
        grenu: Boolean(savedBattle.enemyFollower.grenu),
        hp: Math.max(0, Math.round(Number(savedBattle.enemyFollower.hp) || 0)),
        maxHp: Math.max(1, Math.round(Number(savedBattle.enemyFollower.maxHp) || 65)),
        attack: Math.max(1, Math.round(Number(savedBattle.enemyFollower.attack) || 9)),
        lungeT: 0,
      }
    : null

  Object.assign(battle, {
    enemy: foe,
    enemyFollower: followerSnap,
    phase,
    card: typeof savedBattle.card === 'string' && CARD_LIBRARY[savedBattle.card] ? savedBattle.card : null,
    question: serializeQuestionSnapshot(savedBattle.question),
    fromReview: Boolean(savedBattle.fromReview),
    feedbackCorrect: Boolean(savedBattle.feedbackCorrect),
    feedbackNotes: Array.isArray(savedBattle.feedbackNotes) ? savedBattle.feedbackNotes.map((n) => String(n)) : [],
    allyTurnIndex: Math.max(0, Math.round(Number(savedBattle.allyTurnIndex) || 0)),
    allyTurnMessage: typeof savedBattle.allyTurnMessage === 'string' ? savedBattle.allyTurnMessage : '',
    enemyFollowerMessage: typeof savedBattle.enemyFollowerMessage === 'string' ? savedBattle.enemyFollowerMessage : '',
    block: Number.isFinite(savedBattle.block) ? Math.max(0, Math.min(1, savedBattle.block)) : 0,
    tempDefense: Math.max(0, Math.round(Number(savedBattle.tempDefense) || 0)),
    remedialDefenseBuff: Boolean(savedBattle.remedialDefenseBuff),
    defendCooldownTurns: Math.max(0, Math.round(Number(savedBattle.defendCooldownTurns) || 0)),
    defendUsedThisTurn: Boolean(savedBattle.defendUsedThisTurn),
    exclusiveCooldownTurns: Math.max(0, Math.round(Number(savedBattle.exclusiveCooldownTurns) || 0)),
    exclusiveUsedThisTurn: Boolean(savedBattle.exclusiveUsedThisTurn),
    exclusiveAppearTick: Math.max(0, Math.round(Number(savedBattle.exclusiveAppearTick) || 0)),
    enemyStunTurns: Math.max(0, Math.round(Number(savedBattle.enemyStunTurns) || 0)),
    enemyBurnTurns: Math.max(0, Math.round(Number(savedBattle.enemyBurnTurns) || 0)),
    enemyBurnDamage: Math.max(0, Math.round(Number(savedBattle.enemyBurnDamage) || 0)),
    enemyAttackedThisTurn: Boolean(savedBattle.enemyAttackedThisTurn),
    lastAnswerCorrect: savedBattle.lastAnswerCorrect !== false,
    log: typeof savedBattle.log === 'string' ? savedBattle.log : `${foe.name} blocks the way!`,
    hand: validHand,
    drawPile: validDraw.length || validHand.length || validDiscard.length ? validDraw : shuffle([...runDeck]),
    discard: validDiscard,
    newUnlocks: Array.isArray(savedBattle.newUnlocks) ? savedBattle.newUnlocks.filter((id) => Boolean(CARD_LIBRARY[id])) : [],
    necroCandidate: savedBattle.necroCandidate && typeof savedBattle.necroCandidate === 'object'
      ? clonePracticeData(savedBattle.necroCandidate)
      : null,
    outcomeFlags,
    pendingAttack: false,
  })

  if (!battle.hand.length && ['choose', 'question', 'feedback'].includes(phase)) {
    fillHand()
  }

  // Validate phase-specific requirements and recover gracefully if incomplete
  if (phase === 'question') {
    if (!battle.question || !battle.card) {
      // Refund card cost if we lost the question snapshot and drop safely to card selection
      if (battle.card && CARD_LIBRARY[battle.card]) {
        const refund = cardCost(CARD_LIBRARY[battle.card], hero)
        hero.mana = Math.min(hero.maxMana, hero.mana + refund)
      }
      battle.card = null
      battle.question = null
      battle.phase = 'choose'
      recovered = true
      notices.push('Incomplete battle question was recovered to card selection.')
    }
  } else if (phase === 'feedback') {
    if (!battle.question) {
      battle.phase = battle.enemy.hp <= 0 ? 'won' : 'choose'
      recovered = true
      notices.push('Battle feedback state was recovered to the next safe step.')
    }
  } else if (phase === 'remedial') {
    const rem = savedBattle.remedial
    const remQs = rem && Array.isArray(rem.questions) ? rem.questions.map(serializeQuestionSnapshot).filter(Boolean) : []
    const remIdx = Math.max(0, Math.round(Number(rem?.index) || 0))
    if (remQs.length && remIdx < remQs.length) {
      battle.remedial = {
        questions: remQs,
        index: remIdx,
        results: Array.isArray(rem.results) ? rem.results.slice(0, remIdx).map(Boolean) : [],
        correctCount: Math.max(0, Math.min(remIdx, Math.round(Number(rem.correctCount) || 0))),
      }
    } else {
      battle.remedial = null
      battle.phase = 'choose'
      recovered = true
      notices.push('Remedial challenge snapshot was incomplete; resumed at card selection.')
    }
  } else if (phase === 'ally_turn') {
    const allies = getNecroAllies()
    if (!allies.length || battle.allyTurnIndex >= allies.length) {
      battle.phase = battle.enemy.hp <= 0 ? 'won' : 'choose'
      recovered = true
    }
  } else if (phase === 'enemy_follower_turn') {
    if (!battle.enemyFollower || battle.enemyFollower.hp <= 0) {
      battle.phase = 'choose'
      recovered = true
    }
  } else if (phase === 'necro_prompt') {
    if (outcomeFlags.necroResolved || !battle.necroCandidate) {
      battle.necroCandidate = null
      battle.phase = 'won'
      recovered = true
    }
  } else if (phase === 'reward') {
    if (outcomeFlags.rewardClaimed) {
      if (stats.kills > 0 && stats.kills % 2 === 0 && !outcomeFlags.upgradeClaimed) {
        battle.phase = 'upgrade'
      } else {
        return { restored: false, recovered: true }
      }
    }
  } else if (phase === 'upgrade') {
    if (outcomeFlags.upgradeClaimed) {
      return { restored: false, recovered: true }
    }
  }

  mode = 'battle'
  snapshot = null
  introT = INTRO_END
  Sound.music(battle.phase === 'lost' ? null : (foe.isBoss ? 'boss' : 'battle'))

  if (battle.phase === 'choose') {
    renderBattle()
  } else if (battle.phase === 'question') {
    renderQuestion()
  } else if (battle.phase === 'feedback') {
    renderFeedback(battle.feedbackCorrect, battle.feedbackNotes)
  } else if (battle.phase === 'remedial') {
    renderRemedialQuestion()
  } else if (battle.phase === 'ally_turn') {
    renderAllyTurn(battle.allyTurnIndex, battle.allyTurnMessage || 'Undead ally struck!')
  } else if (battle.phase === 'enemy_follower_turn') {
    renderEnemyFollowerTurn(battle.enemyFollowerMessage || 'Enemy follower attacked!')
  } else if (battle.phase === 'necro_prompt') {
    renderNecromancyPrompt()
  } else if (battle.phase === 'won') {
    if (!battle.outcomeFlags.killRecorded) {
      winBattle()
    } else {
      renderWin()
    }
  } else if (battle.phase === 'reward') {
    const savedRewards = Array.isArray(savedBattle.rewards)
      ? savedBattle.rewards.filter((id) => Boolean(CARD_LIBRARY[id]))
      : []
    renderCardReward(savedRewards.length ? savedRewards : null)
  } else if (battle.phase === 'upgrade') {
    const savedNames = Array.isArray(savedBattle.upgradeNames) ? savedBattle.upgradeNames : []
    const matchedUpgrades = savedNames
      .map((name) => UPGRADES.find((u) => u.name === name))
      .filter(Boolean)
    renderUpgrades(matchedUpgrades.length ? matchedUpgrades : null)
  } else if (battle.phase === 'lost') {
    renderLose()
  } else {
    battle.phase = 'choose'
    renderBattle()
  }

  return { restored: true, recovered }
}

function continueSavedRun(runId) {
  if (!activePlayerName) return
  const profileId = getRunProfileId()
  const store = loadRunSaves(profileId)
  const rawSave = store.saves.find((s) => s && s.id === runId)
  if (!rawSave) return

  // Flush the previously active run FIRST before switching slots
  if (activeRunSaveId && activeRunSaveId !== runId && mode !== 'menu') {
    saveCurrentRunSlot()
  }

  const validated = validateAndNormalizeRunSave(rawSave)
  if (!validated.save) {
    showRunRecoveryNotice(validated.notices[0] || 'Saved run could not be loaded.')
    return
  }
  const save = validated.save
  let recovered = validated.recovered
  const notices = [...validated.notices]

  Sound.ensure()
  hideRunRecoveryNotice()
  closeRunSavesModal()

  if (activeRunSaveId !== save.id) {
    window.ByteboundTutorial?.onProfileSwitch?.()
  }

  runSaveSuspendCount++
  try {
    activeRunSaveId = save.id
    activeRunName = save.name
    activeRunRoleFocus = save.roleFocus
    keys.w.pressed = false
    keys.a.pressed = false
    keys.d.pressed = false

    // Apply this run's skill snapshot BEFORE resetRun so baseline skill bonuses match this run
    if (typeof applyRunSkillSnapshot === 'function') {
      applyRunSkillSnapshot(
        save.skillProgress,
        save.activeSkillSpecialization || null,
        save.exclusiveSkillTree || null,
        { skipSlotSave: true }
      )
    }

    // Fully reset all transient & previous-run state
    resetRun()
    clearedRooms.clear()
    visitedRooms.clear()
    for (const r of save.clearedRooms) clearedRooms.add(r)
    for (const r of save.visitedRooms) visitedRooms.add(r)

    leaderboardRunId = save.leaderboardRunId
    leaderboardRunSubmitted = false
    leaderboardLastSubmittedSnapshot = ''
    playViewActive = true

    // Load the saved room without auto-saving stale/unhydrated state!
    loadLevel(save.level, { skipAutoSave: true })

    // Hydrate hero from clean baseline
    if (save.hero) {
      Object.assign(hero, save.hero)
      if (save.mode !== 'battle' && hero.hp <= 0) {
        hero.hp = Math.max(1, Math.round(hero.maxHp / 2))
        recovered = true
        notices.push('Recovered downed hero to 50% HP at the room checkpoint.')
      }
    }

    // Hydrate stats
    Object.assign(stats, save.stats)

    // Hydrate run deck
    runDeck.splice(0, runDeck.length, ...save.runDeck)

    // Hydrate adaptive difficulty
    adaptive.calibrateFromProgress()
    if (save.adaptive) {
      if (save.adaptive.categoryState && typeof save.adaptive.categoryState === 'object') {
        for (const cat of DISCIPLINE_CATEGORIES) {
          const savedCat = save.adaptive.categoryState[cat]
          if (savedCat && typeof savedCat === 'object') {
            adaptive.categoryState[cat] = {
              level: Number.isInteger(savedCat.level) ? Math.max(0, Math.min(2, savedCat.level)) : adaptive.categoryLevel(cat),
              mediumStreak: Number.isInteger(savedCat.mediumStreak) ? Math.max(0, savedCat.mediumStreak) : 0,
            }
          }
        }
      }
      if (typeof save.adaptive.focusCategory === 'string' || save.adaptive.focusCategory === null) {
        adaptive.setFocusCategory(save.adaptive.focusCategory || null)
      }
      if (Number.isInteger(save.adaptive.level)) {
        adaptive.level = Math.max(0, Math.min(2, save.adaptive.level))
      }
      if (Number.isInteger(save.adaptive.mediumStreak)) {
        adaptive.mediumStreak = Math.max(0, save.adaptive.mediumStreak)
      }
    }

    // Hydrate exact per-enemy room state (never respawning already defeated enemies)
    if (Array.isArray(save.enemies) && save.enemies.length === enemies.length) {
      let deadCount = 0
      for (let i = 0; i < enemies.length; i++) {
        const snap = save.enemies[i]
        const enemy = enemies[i]
        if (!snap || !enemy) continue
        enemy.alive = clearedRooms.has(save.level) ? false : Boolean(snap.alive)
        if (snap.maxHp !== null) enemy.maxHp = snap.maxHp
        if (snap.hp !== null) enemy.hp = enemy.alive ? Math.max(1, Math.min(enemy.maxHp, snap.hp)) : 0
        enemy.turns = snap.turns || 0
        if (snap.x !== null && Number.isFinite(snap.x)) {
          enemy.x = Math.max(enemy.minX ?? 0, Math.min(enemy.maxX ?? exploreCamera.worldWidth, snap.x))
        }
        if (snap.y !== null && Number.isFinite(snap.y)) {
          enemy.y = Math.max(0, Math.min(exploreCamera.worldHeight - enemy.h, snap.y))
        }
        if (snap.vx !== null && Number.isFinite(snap.vx)) enemy.vx = snap.vx
        enemy.dir = snap.dir === -1 ? -1 : 1
        if (!enemy.alive) deadCount++
      }
      stats.roomKills = deadCount
    } else if (clearedRooms.has(save.level)) {
      enemies.forEach((enemy) => {
        enemy.alive = false
        enemy.hp = 0
      })
      stats.roomKills = enemies.length
    } else {
      // Backwards compatibility for older v1 saves without per-enemy snapshots
      const defeatedInRoom = Math.max(0, Math.min(enemies.length, Number(save.stats.roomKills) || 0))
      for (let i = 0; i < defeatedInRoom; i++) {
        if (enemies[i]) {
          enemies[i].alive = false
          enemies[i].hp = 0
        }
      }
      stats.roomKills = defeatedInRoom
    }

    // Hydrate exact player in-room position, facing, and camera
    if (save.playerState && save.playerState.x !== null && save.playerState.y !== null) {
      if (isSafeExplorePosition(save.playerState.x, save.playerState.y, currentRoom)) {
        const facingLeft = save.playerState.facing === 'left'
        player.position.x = save.playerState.x
        player.position.y = save.playerState.y
        player.velocity = { x: 0, y: 0 }
        player.preventInput = false
        player.lastDirection = facingLeft ? 'left' : 'right'
        player.switchSprite(facingLeft ? 'idleLeft' : 'idleRight')
        if (typeof player.updateHitbox === 'function') player.updateHitbox()
        resetExploreCamera(currentRoom)
        if (save.playerState.cameraX !== null && save.playerState.cameraY !== null) {
          exploreCamera.x = clampCameraAxis(save.playerState.cameraX, canvas.width, exploreCamera.worldWidth)
          exploreCamera.y = clampCameraAxis(save.playerState.cameraY, canvas.height, exploreCamera.worldHeight)
        }
      } else {
        recovered = true
        notices.push('Saved player position was unsafe; placed at the room entrance.')
      }
    }

    // Hydrate active battle, victory end-screen, or exploration mode
    if (save.mode === 'battle' && save.battle) {
      const battleResult = restoreSavedBattleState(save.battle, notices)
      if (battleResult.recovered) recovered = true
      if (!battleResult.restored) {
        mode = 'explore'
        grace = 90
        renderExplore()
        Sound.music('explore')
      }
    } else if (save.mode === 'end') {
      mode = 'end'
      showVictory()
    } else {
      mode = 'explore'
      grace = 90
      renderExplore()
      Sound.music('explore')
    }
  } finally {
    runSaveSuspendCount = Math.max(0, runSaveSuspendCount - 1)
  }

  saveCurrentRunSlot()
  renderHud()
  gsap.killTweensOf(overlay)
  gsap.fromTo(overlay, { opacity: 1 }, { opacity: 0, duration: 0.5 })
  syncAnimationLoop()

  if (recovered && notices.length) {
    showRunRecoveryNotice(notices[0])
  }
}

function deleteSavedRun(runId) {
  if (!activePlayerName) return
  const profileId = getRunProfileId()
  const store = loadRunSaves(profileId)
  store.saves = store.saves.filter((s) => s && s.id !== runId)
  if (store.activeId === runId) store.activeId = null
  writeRunSaves(store, profileId)
  if (activeRunSaveId === runId) {
    runSaveSuspendCount++
    try {
      activeRunSaveId = null
      activeRunName = ''
      activeRunRoleFocus = ''
      clearedRooms.clear()
      visitedRooms.clear()
      mode = 'menu'
      playViewActive = false
      if (typeof resetRuntimeBattleState === 'function') resetRuntimeBattleState()
      resetRun()
      setPanel('')
    } finally {
      runSaveSuspendCount = Math.max(0, runSaveSuspendCount - 1)
    }
    renderDashboard()
  }
  renderRunSavesList()
  validateNewRunName({ showEmptyError: false })
}

function renderWorldBeacon() {
  return `<div class="world-beacon">
    <header class="world-beacon-head">
      <span class="eyebrow">Citadel Signal</span>
      <h2>World Beacon</h2>
      <p class="world-beacon-tagline">Light across the kingdom’s cyber realms.</p>
    </header>
    <div class="world-beacon-scene" aria-hidden="true">
      <div class="world-beacon-backdrop"></div>
      <div class="world-beacon-scanlines"></div>
      <svg class="world-beacon-art" viewBox="0 0 320 188" shape-rendering="crispEdges" focusable="false" aria-hidden="true">
        <!-- Starry pixel sky motes -->
        <rect class="world-beacon-star is-s1" x="26" y="20" width="4" height="4" />
        <rect class="world-beacon-star is-s2" x="68" y="34" width="3" height="3" />
        <rect class="world-beacon-star is-s3" x="112" y="16" width="3" height="3" />
        <rect class="world-beacon-star is-s1" x="206" y="18" width="3" height="3" />
        <rect class="world-beacon-star is-s2" x="252" y="28" width="4" height="4" />
        <rect class="world-beacon-star is-s3" x="288" y="16" width="3" height="3" />

        <!-- Concentric beacon signal pulses -->
        <rect class="world-beacon-ring is-r3" x="116" y="14" width="88" height="64" fill="none" stroke-width="2" />
        <rect class="world-beacon-ring is-r2" x="128" y="22" width="64" height="48" fill="none" stroke-width="2" />
        <rect class="world-beacon-ring is-r1" x="140" y="30" width="40" height="32" fill="none" stroke-width="2" />

        <!-- Vertical sky signal beam -->
        <rect class="world-beacon-beam" x="156" y="0" width="8" height="44" />

        <!-- Distant realm silhouettes (Data Center, BB Corp, Net Cafe, Vault) -->
        <g class="world-beacon-skyline">
          <rect x="14" y="106" width="34" height="58" />
          <rect x="20" y="98" width="22" height="8" />
          <rect x="54" y="92" width="38" height="72" />
          <rect x="62" y="84" width="22" height="8" />
          <rect x="98" y="114" width="28" height="50" />
          <rect x="194" y="110" width="30" height="54" />
          <rect x="230" y="94" width="40" height="70" />
          <rect x="238" y="86" width="24" height="8" />
          <rect x="276" y="108" width="30" height="56" />
        </g>

        <!-- Skyline window & server rack lights -->
        <g class="world-beacon-windows">
          <rect x="22" y="114" width="6" height="4" />
          <rect x="34" y="114" width="6" height="4" />
          <rect x="22" y="124" width="6" height="4" />
          <rect x="34" y="134" width="6" height="4" />
          <rect x="62" y="102" width="6" height="6" />
          <rect x="76" y="102" width="6" height="6" />
          <rect x="62" y="116" width="6" height="6" />
          <rect x="76" y="116" width="6" height="6" />
          <rect x="62" y="130" width="6" height="6" />
          <rect x="240" y="104" width="6" height="6" />
          <rect x="254" y="104" width="6" height="6" />
          <rect x="240" y="118" width="6" height="6" />
          <rect x="254" y="132" width="6" height="6" />
          <rect x="284" y="118" width="6" height="4" />
          <rect x="284" y="128" width="6" height="4" />
        </g>

        <!-- Central Citadel Beacon Tower -->
        <g class="world-beacon-tower">
          <rect x="126" y="148" width="68" height="16" />
          <rect x="134" y="122" width="52" height="26" />
          <rect x="140" y="92" width="40" height="30" />
          <rect x="146" y="68" width="28" height="24" />
          <!-- Crenellations -->
          <rect x="138" y="62" width="8" height="8" />
          <rect x="156" y="62" width="8" height="8" />
          <rect x="174" y="62" width="8" height="8" />
        </g>

        <!-- Tower circuit conduits & rune core -->
        <g class="world-beacon-circuits">
          <rect x="158" y="72" width="4" height="76" />
          <rect x="148" y="100" width="6" height="10" />
          <rect x="166" y="100" width="6" height="10" />
          <rect x="144" y="130" width="8" height="12" />
          <rect x="168" y="130" width="8" height="12" />
        </g>

        <!-- Floating Beacon Signal Crystal -->
        <g class="world-beacon-crystal">
          <rect class="beacon-crystal-outer" x="152" y="38" width="16" height="16" />
          <rect class="beacon-crystal-core" x="156" y="42" width="8" height="8" />
          <rect class="beacon-crystal-tip" x="158" y="34" width="4" height="4" />
          <rect class="beacon-crystal-tip" x="158" y="54" width="4" height="4" />
          <rect class="beacon-crystal-tip" x="148" y="44" width="4" height="4" />
          <rect class="beacon-crystal-tip" x="168" y="44" width="4" height="4" />
        </g>

        <!-- Rising pixel data motes -->
        <rect class="world-beacon-mote is-m1" x="134" y="50" width="4" height="4" />
        <rect class="world-beacon-mote is-m2" x="182" y="44" width="4" height="4" />
        <rect class="world-beacon-mote is-m3" x="144" y="26" width="3" height="3" />
        <rect class="world-beacon-mote is-m1" x="174" y="28" width="3" height="3" />

        <!-- Horizon ground & grid -->
        <rect class="world-beacon-ground" x="0" y="164" width="320" height="24" />
        <rect class="world-beacon-horizon" x="0" y="162" width="320" height="3" />
        <g class="world-beacon-grid-ticks">
          <rect x="28" y="170" width="16" height="2" />
          <rect x="74" y="176" width="22" height="2" />
          <rect x="144" y="172" width="32" height="2" />
          <rect x="224" y="176" width="22" height="2" />
          <rect x="274" y="170" width="16" height="2" />
        </g>
      </svg>
      <div class="world-beacon-pedestal">
        <span class="world-beacon-pip"></span>
        <span class="world-beacon-pip is-gold"></span>
        <span class="world-beacon-pip is-cyan"></span>
        <span class="world-beacon-pip is-gold"></span>
        <span class="world-beacon-pip"></span>
      </div>
    </div>
  </div>`
}

function clonePracticeData(value) {
  return JSON.parse(JSON.stringify(value))
}

function capturePracticeReturnState() {
  const savedPlayer = {
    ...player,
    position: { ...player.position },
    velocity: { ...player.velocity },
  }
  if (player.worldBounds) savedPlayer.worldBounds = { ...player.worldBounds }
  else delete savedPlayer.worldBounds
  if (player.hitbox) savedPlayer.hitbox = { ...player.hitbox, position: { ...player.hitbox.position } }
  else delete savedPlayer.hitbox
  if (player.sides) savedPlayer.sides = { ...player.sides }
  else delete savedPlayer.sides

  return {
    dashboardView,
    mode,
    level,
    grace,
    introT,
    snapshot,
    collisionBlocks,
    background,
    doors,
    enemies,
    currentRoom,
    clearedRooms: [...clearedRooms],
    visitedRooms: [...visitedRooms],
    exploreCamera: { ...exploreCamera },
    activeRunSaveId,
    activeRunName,
    activeRunRoleFocus,
    exclusiveSkillTree,
    player: savedPlayer,
    playerAnimationStates: Object.fromEntries(
      Object.entries(player.animations || {}).map(([name, animation]) => [name, animation.isActive])
    ),
    hero: clonePracticeData(hero),
    stats: clonePracticeData(stats),
    battle: { ...battle },
    runDeck: [...runDeck],
    adaptive: {
      level: adaptive.level,
      mediumStreak: adaptive.mediumStreak,
      used: clonePracticeData(adaptive.used),
      fromReview: adaptive.fromReview,
      focusCategory: adaptive.focusCategory,
      categoryState: clonePracticeData(adaptive.categoryState),
      lastSelection: clonePracticeData(adaptive.lastSelection),
    },
    topicProgress: clonePracticeData(topicProgress),
    skillProgress: clonePracticeData(skillProgress),
    reviewQueue: clonePracticeData(reviewQueue),
    answerCount,
    activeSkillSpecialization,
    achievementProgress: clonePracticeData(achievementProgress),
    unlockedAchievements: clonePracticeData(unlockedAchievements),
    skillTreeStarted,
    selectedSkillNode: clonePracticeData(selectedSkillNode),
    skillMapPan: clonePracticeData(skillMapPan),
    leaderboardRunId,
    leaderboardRunSubmitted,
    leaderboardLastSubmittedSnapshot,
    leaderboardState,
    leaderboardError,
    panelContent: panel.innerHTML,
    overlayOpacity: overlay.opacity,
    lastPlayerHpPercent,
  }
}

function replaceObjectState(target, source) {
  for (const key of Object.keys(target)) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) delete target[key]
  }
  Object.assign(target, source)
}

function restorePracticeReturnState() {
  if (!practiceReturnState) throw new Error('Practice run has no saved return state.')
  const saved = practiceReturnState
  dashboardView = saved.dashboardView
  mode = saved.mode
  level = saved.level
  grace = saved.grace
  introT = saved.introT
  snapshot = saved.snapshot
  collisionBlocks = saved.collisionBlocks
  background = saved.background
  doors = saved.doors
  enemies = saved.enemies
  currentRoom = saved.currentRoom
  clearedRooms.clear()
  if (Array.isArray(saved.clearedRooms)) saved.clearedRooms.forEach((r) => clearedRooms.add(r))
  visitedRooms.clear()
  if (Array.isArray(saved.visitedRooms)) saved.visitedRooms.forEach((r) => visitedRooms.add(r))
  if (saved.exploreCamera) Object.assign(exploreCamera, saved.exploreCamera)
  activeRunSaveId = saved.activeRunSaveId ?? null
  activeRunName = saved.activeRunName ?? ''
  activeRunRoleFocus = saved.activeRunRoleFocus ?? ''
  exclusiveSkillTree = saved.exclusiveSkillTree ?? null
  replaceObjectState(player, saved.player)
  for (const [name, isActive] of Object.entries(saved.playerAnimationStates)) {
    const animation = player.animations[name]
    if (!animation) continue
    if (isActive === undefined) delete animation.isActive
    else animation.isActive = isActive
  }
  player.updateHitbox()
  replaceObjectState(hero, saved.hero)
  replaceObjectState(stats, saved.stats)
  replaceObjectState(battle, saved.battle)
  runDeck.splice(0, runDeck.length, ...saved.runDeck)
  Object.assign(adaptive, saved.adaptive)
  replaceObjectState(topicProgress, saved.topicProgress)
  replaceObjectState(skillProgress, saved.skillProgress)
  reviewQueue = saved.reviewQueue
  answerCount = saved.answerCount
  activeSkillSpecialization = saved.activeSkillSpecialization
  const preservedTutorialUnlock = unlockedAchievements['codex-laureate']
  replaceObjectState(achievementProgress, saved.achievementProgress)
  replaceObjectState(unlockedAchievements, saved.unlockedAchievements)
  if (preservedTutorialUnlock && !unlockedAchievements['codex-laureate']) {
    unlockedAchievements['codex-laureate'] = preservedTutorialUnlock
  }
  skillTreeStarted = saved.skillTreeStarted
  selectedSkillNode = saved.selectedSkillNode
  skillMapPan = saved.skillMapPan
  leaderboardRunId = saved.leaderboardRunId
  leaderboardRunSubmitted = saved.leaderboardRunSubmitted
  leaderboardLastSubmittedSnapshot = saved.leaderboardLastSubmittedSnapshot || ''
  leaderboardState = saved.leaderboardState
  leaderboardError = saved.leaderboardError
  panel.innerHTML = saved.panelContent
  gsap.killTweensOf(overlay)
  overlay.opacity = saved.overlayOpacity
  lastPlayerHpPercent = saved.lastPlayerHpPercent
  practiceRunActive = false
  practiceReturnState = null
}

function startPracticeAdventure() {
  if (!activePlayerName || practiceRunActive) return
  practiceReturnState = capturePracticeReturnState()
  practiceRunActive = true
  Sound.ensure()
  playViewActive = true
  newGame()
  gsap.killTweensOf(overlay)
  gsap.fromTo(overlay, { opacity: 1 }, { opacity: 0, duration: 0.6 })
  syncAnimationLoop()
}

function syncTouchVisibility() {
  if (typeof app === 'undefined' || !app) return
  const gameOverEl = document.getElementById('gameOverOverlay')
  const inBattle = Boolean(playViewActive && (mode === 'battle' || mode === 'intro'))
  const hideTouch =
    !playViewActive ||
    mode !== 'explore' ||
    Boolean(player?.preventInput) ||
    Boolean(skillTreeOpen) ||
    Boolean(worldMapOpen) ||
    Boolean(window.mpUI?.isOpen) ||
    Boolean(gameOverEl && !gameOverEl.hidden)
  app.classList.toggle('is-touch-hidden', hideTouch)
  app.classList.toggle('is-in-battle', inBattle)
}

function updateNavigation() {
  const activeView = skillTreeOpen ? 'skilltree' : playViewActive ? 'play' : dashboardView
  document.querySelectorAll('[data-view]').forEach((button) => {
    if (button.dataset.view === activeView) button.setAttribute('aria-current', 'page')
    else button.removeAttribute('aria-current')
  })
  syncTouchVisibility()
}

function resetDeadRunToMenu() {
  if (hero.hp <= 0 || (mode === 'battle' && (battle.phase === 'dying' || battle.phase === 'lost'))) {
    mode = 'menu'
    battle.phase = 'choose'
    battle.deathTimer = 0
    battle.enemy = null
    battleKingDeath.autoplay = false
    battleKingDeath.currentFrame = 0
    battleKingDeath.elapsedFrames = 0
    resetRun()
    setPanel('')
  }
}

function showPlayView() {
  if (skillTreeOpen) closeSkillTree()
  if (worldMapOpen) closeWorldMap()
  if (typeof practice !== 'undefined') practice.mode = 'menu'
  playViewActive = true
  Sound.ensure()
  gsap.killTweensOf(overlay)
  gsap.fromTo(overlay, { opacity: 1 }, { opacity: 0, duration: 0.6 })
  renderDashboard()
  syncAnimationLoop()
}

function showDashboard(nextView) {
  if (!practiceRunActive && !multiplayerMatchActive && activeRunSaveId) {
    saveCurrentRunSlot()
  }
  if (typeof nextView === 'string' && nextView && nextView !== 'play') {
    dashboardView = nextView
  }
  if (skillTreeOpen) closeSkillTree()
  if (worldMapOpen) closeWorldMap()
  if (typeof practice !== 'undefined') practice.mode = 'menu'
  if (typeof multiplayerMatchActive !== 'undefined' && multiplayerMatchActive) {
    if (typeof mpState !== 'undefined' && !mpState.outcome) {
      window.mpUI?.matchmaking?.forfeitMatch(`${activePlayerName || 'Player'} exited the match.`)
    }
    if (typeof endMultiplayerMatchState === 'function') endMultiplayerMatchState()
    mode = 'menu'
    battle.phase = 'choose'
    battle.enemy = null
    setPanel('')
  }
  if (practiceRunActive) {
    restorePracticeReturnState()
    if (typeof nextView === 'string' && nextView && nextView !== 'play') {
      dashboardView = nextView
    }
  } else if (playViewActive) {
    submitLeaderboardRun({ skipReload: true })
    pushUserProfileToSupabase()
    resetDeadRunToMenu()
  }
  playViewActive = false
  const go = document.getElementById('gameOverOverlay')
  if (go) {
    go.hidden = true
    go.innerHTML = ''
  }
  const spBanner = document.getElementById('spEarnedBanner')
  if (spBanner) spBanner.hidden = true
  window.clearTimeout(spEarnedBannerTimer)
  spEarnedBannerTimer = 0
  Sound.music('dashboard')
  keys.w.pressed = false
  keys.a.pressed = false
  keys.d.pressed = false
  updateNavigation()
  renderHud()
  const mainEl = document.querySelector('#app main')
  if (mainEl) mainEl.scrollTop = 0
  if (typeof window.scrollTo === 'function') window.scrollTo(0, 0)
}

function skillTreeDetailMarkup() {
  let detail = `<section class="skill-detail skill-detail-empty" id="skillTreeDetail" aria-live="polite">
    <span class="skill-detail-eyebrow">KNIGHT'S SKILL PATH</span>
    <h2>Begin your journey</h2>
    <p class="skill-detail-description">Start at the center of the map. Your four disciplines branch outward, revealing new skills as you learn their prerequisites.</p>
    <p class="skill-detail-status">Choose START to reveal the first skills. Scroll to zoom and drag to explore; zoom-out below 100% unlocks after spending ${SKILL_MAP_ZOOM_OUT_POINTS} points.</p>
  </section>`
  if (selectedSkillNode) {
    const selectedTree = SKILL_TREES[selectedSkillNode.treeKey]
    const selectedSkill = selectedTree.skills.find((skill) => skill.id === selectedSkillNode.skillId)
    const selectedProgress = skillProgress[selectedSkillNode.treeKey]
    const selectedRank = selectedProgress.ranks[selectedSkill.id]
    const selectedMaxRank = selectedSkill.maxRank || SKILL_MAX_RANK
    const selectedBranchLocked = isSkillTreeLockedOut(selectedSkillNode.treeKey)
    const canPurchase = canUpgradeSkill(selectedSkillNode.treeKey, selectedSkill)
    let availability = ''
    if (selectedRank >= selectedMaxRank) availability = 'This skill is unlocked / at maximum rank.'
    else if (selectedBranchLocked) {
      const locker = exclusiveSkillTree || activeSkillSpecialization
      availability = `Locked because you committed to ${SKILL_TREES[locker].name}. Locked topics cannot spend or earn skill points.`
    } else if (skillPointsAvailable(selectedSkillNode.treeKey) === 0) {
      const remainder = selectedProgress.correct % SKILL_POINT_INTERVAL
      availability = `No ${selectedTree.name} point available. ${SKILL_POINT_INTERVAL - remainder} more correct ${SKILL_POINT_INTERVAL - remainder === 1 ? 'answer' : 'answers'} earns one.`
    } else if (selectedSkill.isExclusiveActive) {
      const transferTotal = SKILL_TREE_KEYS
        .filter((k) => k !== selectedSkillNode.treeKey)
        .reduce((sum, k) => sum + skillPointsAvailable(k), 0)
      availability = `Ready! Unlocking locks the other 3 topics and transfers ${transferTotal} unspent SP here.`
    } else {
      availability = selectedRank === 0 ? 'Ready to learn with 1 point.' : 'Ready to upgrade with 1 point.'
    }
    const actionLabel = selectedSkill.isExclusiveActive ? 'COMMIT & UNLOCK' : (selectedRank === 0 ? 'GET SKILL' : 'UPGRADE SKILL')
    detail = `<section class="skill-detail${selectedSkill.isExclusiveActive ? ` is-exclusive-detail tree-${esc(selectedSkillNode.treeKey)}` : ''}" id="skillTreeDetail" aria-live="polite" aria-labelledby="selectedSkillTitle">
      <span class="skill-detail-eyebrow">${esc(selectedTree.name)} · ${selectedSkill.isExclusiveActive ? 'EXCLUSIVE ACTIVE SKILL' : 'SELECTED SKILL'}</span>
      <h2 id="selectedSkillTitle">${esc(selectedSkill.name)}</h2>
      <p class="skill-detail-description">${esc(selectedSkill.description)}</p>
      <div class="skill-detail-effect"><span>${selectedSkill.isExclusiveActive ? 'Active power' : 'Effect per rank'}</span><strong>${esc(selectedSkill.effect)}</strong></div>
      <div class="skill-detail-rank"><span>Current rank</span><strong>${selectedRank} / ${selectedMaxRank}</strong></div>
      <p class="skill-detail-status ${canPurchase ? 'is-ready' : ''}">${esc(availability)}</p>
      <button class="skill-purchase-button ${canPurchase ? 'is-affordable' : 'is-unavailable'}" type="button" data-skill-purchase="${esc(selectedSkill.id)}" data-skill-tree="${esc(selectedSkillNode.treeKey)}" ${canPurchase ? '' : 'disabled'}>${selectedRank >= selectedMaxRank ? (selectedSkill.isExclusiveActive ? 'UNLOCKED' : 'MAX RANK') : `${actionLabel} · 1 POINT`}</button>
    </section>`
  }
  return detail
}

function orthogonalBranchPath(px, py, tx, ty, key) {
  const isVertical = key === 'computerSystems' || key === 'programming'
  if (isVertical) {
    if (Math.abs(px - tx) < 1) return `M ${px} ${py} L ${tx} ${ty}`
    const midY = Math.round((py + ty) / 2)
    return `M ${px} ${py} L ${px} ${midY} L ${tx} ${midY} L ${tx} ${ty}`
  }
  if (Math.abs(py - ty) < 1) return `M ${px} ${py} L ${tx} ${ty}`
  const midX = Math.round((px + tx) / 2)
  return `M ${px} ${py} L ${midX} ${py} L ${midX} ${ty} L ${tx} ${ty}`
}

function renderSkillTree() {
  if (typeof reconcileExclusiveSkillPoints === 'function' && reconcileExclusiveSkillPoints()) {
    saveSkillProgress()
  }
  const grid = document.getElementById('skillTreeGrid')
  const availableTotal = SKILL_TREE_KEYS.reduce((total, key) => total + skillPointsAvailable(key), 0)
  const spentPointsTotal = SKILL_TREE_KEYS.reduce((total, key) =>
    total + Object.values(skillProgress[key].ranks).reduce((spent, rank) => spent + rank, 0), 0
  )
  const zoomOutUnlocked = spentPointsTotal >= SKILL_MAP_ZOOM_OUT_POINTS
  const minimumZoom = zoomOutUnlocked ? SKILL_MAP_MIN_ZOOM : 1
  const acquiredAnySkill = SKILL_TREE_KEYS.some((key) => countSpecializedSkills(key) > 0)
  skillTreeStarted ||= acquiredAnySkill
  const specialization = activeSkillSpecialization
    ? SKILL_TREES[activeSkillSpecialization].name
    : 'Choose a specialization by getting a skill.'
  const pointsByTree = SKILL_TREE_KEYS.map((key) => {
    const earned = Math.floor(skillProgress[key].correct / SKILL_POINT_INTERVAL)
    const spent = Object.values(skillProgress[key].ranks).reduce((total, rank) => total + rank, 0)
    const locked = isSkillTreeLockedOut(key)
    return `<div class="skill-point-topic tree-${esc(key)}${locked ? ' is-locked-topic' : ''}">
      <span>${esc(SKILL_TREES[key].name)}</span>
      <strong>${locked ? 'LOCKED' : skillPointsAvailable(key)}</strong>
      <small>${locked ? 'locked by exclusive pact' : `available · ${earned} earned · ${spent} spent`}</small>
    </div>`
  }).join('')
  document.getElementById('skillTreeSummary').innerHTML = `
    <div class="skill-points-overview">
      <div class="skill-points-total" aria-label="${availableTotal} unspent skill points">
        <strong>${availableTotal}</strong>
        <span>UNSPENT<br>SKILL POINTS</span>
      </div>
      <div class="skill-points-topics">${pointsByTree}</div>
    </div>
    <p class="skill-points-hint">Earn 1 SP per 5 correct answers per topic. Choosing any midpoint Exclusive Active Skill locks the other 3 topics and transfers all unspent SP to your chosen tree. · Focus: ${esc(specialization)}</p>`

  const mapWidth = 1880
  const mapHeight = 1440
  const nodeWidth = 184
  const nodeHeight = 74
  const center = { x: 940, y: 685 }
  const positions = {
    computerSystems: {
      foundation: { x: 848, y: 495 },
      operatingSystem: { x: 848, y: 392 },
      kernelAegis: { x: 848, y: 286 },
      recovery: { x: 706, y: 172 },
      virtualization: { x: 990, y: 172 },
      thermalControl: { x: 706, y: 58 },
      firmwareOverclock: { x: 990, y: 58 },
    },
    networkingSecurity: {
      foundation: { x: 1074, y: 648 },
      threatAnalysis: { x: 1280, y: 648 },
      packetLockdown: { x: 1486, y: 648 },
      secureChannel: { x: 1682, y: 510 },
      intrusionDetection: { x: 1682, y: 786 },
      packetRouting: { x: 1682, y: 392 },
      zeroTrust: { x: 1682, y: 904 },
    },
    programming: {
      foundation: { x: 848, y: 800 },
      errorHandling: { x: 848, y: 904 },
      overburnExecution: { x: 848, y: 1010 },
      codeReuse: { x: 706, y: 1124 },
      concurrency: { x: 990, y: 1124 },
      runtimeOptimization: { x: 706, y: 1238 },
      compilerMastery: { x: 990, y: 1238 },
    },
    database: {
      foundation: { x: 622, y: 648 },
      transactions: { x: 416, y: 648 },
      necromancy: { x: 210, y: 648 },
      queryCache: { x: 14, y: 510 },
      replication: { x: 14, y: 786 },
      queryOptimizer: { x: 14, y: 392 },
      acidGuarantee: { x: 14, y: 904 },
    },
  }
  const visibleSkills = []
  if (skillTreeStarted) {
    for (const key of SKILL_TREE_KEYS) {
      const progress = skillProgress[key]
      for (const skill of SKILL_TREES[key].skills) {
        if (skillRequirements(skill).every((id) => progress.ranks[id] > 0)) {
          visibleSkills.push({ key, skill })
        }
      }
    }
  }
  if (selectedSkillNode && !visibleSkills.some(({ key, skill }) =>
    key === selectedSkillNode.treeKey && skill.id === selectedSkillNode.skillId
  )) {
    selectedSkillNode = null
  }
  if (!selectedSkillNode && visibleSkills.length) {
    const learned = visibleSkills.find(({ key, skill }) => skillProgress[key].ranks[skill.id] > 0)
    const first = learned || visibleSkills[0]
    selectedSkillNode = { treeKey: first.key, skillId: first.skill.id }
  }

  const centerX = center.x
  const centerY = center.y
  const edges = []
  if (skillTreeStarted) {
    for (const { key, skill } of visibleSkills) {
      const target = positions[key][skill.id]
      const targetX = target.x + nodeWidth / 2
      const targetY = target.y + nodeHeight / 2
      const requirements = skillRequirements(skill)
      const parentId = requirements[0]
      const parent = parentId ? positions[key][parentId] : center
      const parentX = parent.x + (parent === center ? 0 : nodeWidth / 2)
      const parentY = parent.y + (parent === center ? 0 : nodeHeight / 2)
      const d = orthogonalBranchPath(parentX, parentY, targetX, targetY, key)
      edges.push(`<path class="skill-map-edge tree-${esc(key)}${skill.isExclusiveActive ? ' is-exclusive-edge' : ''}" d="${d}"/>`)
    }
  }

  const nodes = visibleSkills.map(({ key, skill }) => {
    const tree = SKILL_TREES[key]
    const progress = skillProgress[key]
    const rank = progress.ranks[skill.id]
    const maxRank = skill.maxRank || SKILL_MAX_RANK
    const available = skillPointsAvailable(key)
    const branchLocked = isSkillTreeLockedOut(key)
    const selected = selectedSkillNode?.treeKey === key && selectedSkillNode.skillId === skill.id
    const canUp = canUpgradeSkill(key, skill)
    const justUp = lastPurchasedSkill && lastPurchasedSkill.treeKey === key && lastPurchasedSkill.skillId === skill.id
    const nodeClass = [
      'skill-map-node',
      `tree-${key}`,
      skill.isExclusiveActive ? 'is-exclusive-active' : '',
      skill.isNecromancy ? 'is-necromancy-node' : '',
      selected ? 'is-selected' : '',
      rank > 0 ? 'is-learned' : '',
      canUp ? 'is-can-upgrade' : '',
      justUp ? 'is-just-upgraded' : '',
      branchLocked ? 'is-locked' : '',
      !branchLocked && available === 0 && rank < maxRank ? 'is-unaffordable' : '',
    ].filter(Boolean).join(' ')
    const nodeStatus = rank >= maxRank
      ? (skill.isExclusiveActive ? 'ACTIVE' : 'MAX')
      : rank > 0
        ? `${rank}/${maxRank}`
        : branchLocked
          ? 'LOCKED'
          : available > 0
            ? (skill.isExclusiveActive ? 'CHOOSE' : 'READY')
            : 'NEED PT'
    const position = positions[key][skill.id]
    const topLabel = skill.isExclusiveActive
      ? '<span class="skill-node-tree is-exclusive-tag">★ EXCLUSIVE ACTIVE</span>'
      : (skillRequirements(skill).length ? '' : `<span class="skill-node-tree">${esc(tree.name)}</span>`)
    const markGlyph = skill.isExclusiveActive ? '◆' : (rank > 0 ? '■' : '□')
    return `<button type="button" class="${nodeClass}" style="left:${position.x}px;top:${position.y}px" data-skill-select="${esc(skill.id)}" data-skill-tree="${esc(key)}" aria-pressed="${selected}" aria-label="${esc(`${tree.name}: ${skill.name}, rank ${rank} of ${maxRank}`)}">
      ${topLabel}<span class="skill-node-mark" aria-hidden="true">${markGlyph}</span>
      <span class="skill-node-name">${esc(skill.name)}</span>
      <span class="skill-node-rank">${nodeStatus}</span>
    </button>`
  }).join('')

  grid.innerHTML = `<div class="skill-map-viewport" id="skillMapViewport" aria-label="Skill tree map. Drag to pan and scroll to zoom. Zoom-out below 100 percent unlocks after spending ${SKILL_MAP_ZOOM_OUT_POINTS} points.">
      <canvas class="skill-map-particles" id="skillMapParticles" aria-hidden="true"></canvas>
      <div class="skill-map-zoom-status" id="skillMapZoomStatus"></div>
      <div class="skill-map-world" id="skillMapWorld" style="width:${mapWidth}px;height:${mapHeight}px">
        <svg class="skill-map-links" width="${mapWidth}" height="${mapHeight}" viewBox="0 0 ${mapWidth} ${mapHeight}" aria-hidden="true">${edges.join('')}</svg>
        <div class="skill-map-center${skillTreeStarted ? ' is-started' : ''}" style="left:${centerX - 78}px;top:${centerY - 78}px">
          <span class="skill-center-port is-north" aria-hidden="true"></span>
          <span class="skill-center-port is-east" aria-hidden="true"></span>
          <span class="skill-center-port is-south" aria-hidden="true"></span>
          <span class="skill-center-port is-west" aria-hidden="true"></span>
          <button type="button" class="skill-map-start" id="startSkillTree" ${skillTreeStarted ? 'disabled' : ''}>
            <span class="skill-center-corner is-tl" aria-hidden="true"></span>
            <span class="skill-center-corner is-tr" aria-hidden="true"></span>
            <span class="skill-center-corner is-bl" aria-hidden="true"></span>
            <span class="skill-center-corner is-br" aria-hidden="true"></span>
            <svg class="skill-core-mark" viewBox="0 0 44 44" aria-hidden="true">
              <path class="skill-core-outer" d="M6 6H38V38H6Z" />
              <path class="skill-core-inner" d="M12 12H32V32H12Z" />
              <path class="skill-core-conduits" d="M22 4V16M22 28V40M4 22H16M28 22H40" />
              <rect class="skill-core-node-n" x="19" y="2" width="6" height="6" />
              <rect class="skill-core-node-e" x="36" y="19" width="6" height="6" />
              <rect class="skill-core-node-s" x="19" y="36" width="6" height="6" />
              <rect class="skill-core-node-w" x="2" y="19" width="6" height="6" />
              <path class="skill-core-gem" d="M22 14L30 22L22 30L14 22Z" />
              <rect class="skill-core-spark" x="20" y="20" width="4" height="4" />
            </svg>
            <strong>${skillTreeStarted ? 'PATH OPEN' : 'START'}</strong>
            <small>${skillTreeStarted ? 'Select a revealed node' : 'Awaken the nexus'}</small>
          </button>
        </div>
        ${nodes}
      </div>
    </div>${skillTreeDetailMarkup()}`

  const viewport = document.getElementById('skillMapViewport')
  const world = document.getElementById('skillMapWorld')
  document.getElementById('skillTreeFooter').textContent = practiceRunActive
    ? 'Practice Mode: purchases and learning progress are temporary and will be discarded when you exit.'
    : "Earn 1 point for every 5 correct answers in a topic. Points stay in that topic's skill tree."
  if (!skillMapPan || !viewport.clientWidth || !viewport.clientHeight) {
    skillMapPan = {
      x: viewport.clientWidth / 2 - centerX,
      y: viewport.clientHeight / 2 - centerY,
      scale: 1,
    }
  }
  if (!Number.isFinite(skillMapPan.scale)) skillMapPan.scale = 1
  skillMapPan.scale = Math.max(minimumZoom, Math.min(SKILL_MAP_MAX_ZOOM, skillMapPan.scale))
  const zoomStatus = document.getElementById('skillMapZoomStatus')
  const updateZoomStatus = () => {
    const zoomLabel = `Zoom ${Math.round(skillMapPan.scale * 100)}%`
    zoomStatus.textContent = zoomOutUnlocked
      ? `${zoomLabel} · Scroll to zoom, drag to pan`
      : `${zoomLabel} · Zoom-out unlocks at ${SKILL_MAP_ZOOM_OUT_POINTS} points (${spentPointsTotal}/${SKILL_MAP_ZOOM_OUT_POINTS} spent)`
  }
  const clampPan = () => {
    const scaledWidth = mapWidth * skillMapPan.scale
    const scaledHeight = mapHeight * skillMapPan.scale
    skillMapPan.x = scaledWidth <= viewport.clientWidth
      ? (viewport.clientWidth - scaledWidth) / 2
      : Math.min(0, Math.max(viewport.clientWidth - scaledWidth, skillMapPan.x))
    skillMapPan.y = scaledHeight <= viewport.clientHeight
      ? (viewport.clientHeight - scaledHeight) / 2
      : Math.min(0, Math.max(viewport.clientHeight - scaledHeight, skillMapPan.y))
    world.style.transform = `translate(${skillMapPan.x}px, ${skillMapPan.y}px) scale(${skillMapPan.scale})`
  }
  clampPan()
  updateZoomStatus()
  viewport.addEventListener('wheel', (event) => {
    if (event.deltaY === 0) return
    event.preventDefault()
    const rect = viewport.getBoundingClientRect()
    const anchorX = event.clientX - rect.left
    const anchorY = event.clientY - rect.top
    const nextScale = Math.max(
      minimumZoom,
      Math.min(SKILL_MAP_MAX_ZOOM, skillMapPan.scale * Math.exp(-event.deltaY * 0.001))
    )
    if (nextScale === skillMapPan.scale) return
    const mapX = (anchorX - skillMapPan.x) / skillMapPan.scale
    const mapY = (anchorY - skillMapPan.y) / skillMapPan.scale
    skillMapPan.scale = nextScale
    skillMapPan.x = anchorX - mapX * nextScale
    skillMapPan.y = anchorY - mapY * nextScale
    clampPan()
    updateZoomStatus()
  }, { passive: false })
  const activeMapPointers = new Map()
  let drag = null
  let pinch = null
  viewport.addEventListener('pointerdown', (event) => {
    if ((event.pointerType === 'mouse' && event.button !== 0) || event.target.closest('button')) return
    activeMapPointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    try { viewport.setPointerCapture(event.pointerId) } catch (_) {}
    if (activeMapPointers.size === 2) {
      drag = null
      const pts = [...activeMapPointers.values()]
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1
      const rect = viewport.getBoundingClientRect()
      const midX = (pts[0].x + pts[1].x) / 2 - rect.left
      const midY = (pts[0].y + pts[1].y) / 2 - rect.top
      pinch = {
        dist,
        scale: skillMapPan.scale,
        mapX: (midX - skillMapPan.x) / skillMapPan.scale,
        mapY: (midY - skillMapPan.y) / skillMapPan.scale,
      }
      viewport.classList.add('is-panning')
    } else if (activeMapPointers.size === 1) {
      drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX: skillMapPan.x, panY: skillMapPan.y }
    }
  })
  viewport.addEventListener('pointermove', (event) => {
    if (!activeMapPointers.has(event.pointerId)) return
    activeMapPointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pinch && activeMapPointers.size === 2) {
      const pts = [...activeMapPointers.values()]
      const nextDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1
      const rect = viewport.getBoundingClientRect()
      const midX = (pts[0].x + pts[1].x) / 2 - rect.left
      const midY = (pts[0].y + pts[1].y) / 2 - rect.top
      const nextScale = Math.max(minimumZoom, Math.min(SKILL_MAP_MAX_ZOOM, pinch.scale * (nextDist / pinch.dist)))
      skillMapPan.scale = nextScale
      skillMapPan.x = midX - pinch.mapX * nextScale
      skillMapPan.y = midY - pinch.mapY * nextScale
      clampPan()
      updateZoomStatus()
      return
    }
    if (!drag || drag.pointerId !== event.pointerId) return
    skillMapPan.x = drag.panX + event.clientX - drag.x
    skillMapPan.y = drag.panY + event.clientY - drag.y
    viewport.classList.add('is-panning')
    clampPan()
  })
  const finishDrag = (event) => {
    activeMapPointers.delete(event.pointerId)
    if (activeMapPointers.size < 2) pinch = null
    if (activeMapPointers.size === 1) {
      const [[remId, remPt]] = [...activeMapPointers.entries()]
      drag = { pointerId: remId, x: remPt.x, y: remPt.y, panX: skillMapPan.x, panY: skillMapPan.y }
    } else {
      drag = null
      viewport.classList.remove('is-panning')
    }
  }
  viewport.addEventListener('pointerup', finishDrag)
  viewport.addEventListener('pointercancel', finishDrag)
  startSkillTreeParticles(viewport)
}

let skillTreeParticleRaf = 0
let skillTreeAmbientParticles = []
let skillTreeBurstParticles = []
let lastPurchasedSkill = null
let spEarnedBannerTimer = 0

function stopSkillTreeParticles() {
  if (skillTreeParticleRaf) {
    cancelAnimationFrame(skillTreeParticleRaf)
    skillTreeParticleRaf = 0
  }
}

function burstSkillTreeParticles(treeKey, skillId) {
  const viewport = document.getElementById('skillMapViewport')
  const node = document.querySelector(`[data-skill-select="${CSS.escape(skillId)}"][data-skill-tree="${CSS.escape(treeKey)}"]`)
  if (!viewport || !node) return
  const vr = viewport.getBoundingClientRect()
  const nr = node.getBoundingClientRect()
  const cx = nr.left - vr.left + nr.width / 2
  const cy = nr.top - vr.top + nr.height / 2
  const palette = {
    computerSystems: '#f2bb61',
    networkingSecurity: '#6fe3e8',
    programming: '#8bc78e',
    database: '#cf8b7b',
  }
  const color = palette[treeKey] || '#ffe07a'
  for (let i = 0; i < 24; i++) {
    const angle = (Math.PI * 2 * i) / 24 + Math.random() * 0.35
    const speed = 1.4 + Math.random() * 3.4
    skillTreeBurstParticles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 3 + Math.floor(Math.random() * 4),
      life: 1,
      color: i % 3 === 0 ? '#fff6dc' : color,
    })
  }
}

function startSkillTreeParticles(viewport) {
  stopSkillTreeParticles()
  const canvasEl = document.getElementById('skillMapParticles')
  if (!canvasEl || !viewport) return
  const ctx = canvasEl.getContext('2d')
  if (!ctx) return
  const w = Math.max(320, viewport.clientWidth || 720)
  const h = Math.max(240, viewport.clientHeight || 480)
  canvasEl.width = w
  canvasEl.height = h
  const colors = ['#f2bb61', '#6fe3e8', '#8bc78e', '#cf8b7b']
  if (!skillTreeAmbientParticles.length) {
    skillTreeAmbientParticles = Array.from({ length: 34 }, (_, idx) => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.28,
      vy: -0.15 - Math.random() * 0.32,
      size: 2 + (idx % 3),
      alpha: 0.25 + Math.random() * 0.45,
      color: colors[idx % colors.length],
    }))
  }
  const step = () => {
    if (!skillTreeOpen || !canvasEl.isConnected) {
      skillTreeParticleRaf = 0
      return
    }
    if (canvasEl.width !== viewport.clientWidth || canvasEl.height !== viewport.clientHeight) {
      canvasEl.width = Math.max(320, viewport.clientWidth)
      canvasEl.height = Math.max(240, viewport.clientHeight)
    }
    const cw = canvasEl.width
    const ch = canvasEl.height
    ctx.clearRect(0, 0, cw, ch)
    for (const p of skillTreeAmbientParticles) {
      p.x += p.vx
      p.y += p.vy
      if (p.y < -6) { p.y = ch + 6; p.x = Math.random() * cw }
      if (p.x < -6) p.x = cw + 6
      if (p.x > cw + 6) p.x = -6
      ctx.globalAlpha = p.alpha
      ctx.fillStyle = p.color
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size)
    }
    for (let i = skillTreeBurstParticles.length - 1; i >= 0; i--) {
      const b = skillTreeBurstParticles[i]
      b.x += b.vx
      b.y += b.vy
      b.vx *= 0.94
      b.vy *= 0.94
      b.life -= 0.028
      if (b.life <= 0) {
        skillTreeBurstParticles.splice(i, 1)
        continue
      }
      ctx.globalAlpha = Math.max(0, b.life)
      ctx.fillStyle = b.color
      ctx.fillRect(Math.round(b.x - b.size / 2), Math.round(b.y - b.size / 2), b.size, b.size)
    }
    ctx.globalAlpha = 1
    skillTreeParticleRaf = requestAnimationFrame(step)
  }
  skillTreeParticleRaf = requestAnimationFrame(step)
}

function showSkillPointEarnedBanner(category, options = {}) {
  const banner = document.getElementById('spEarnedBanner')
  const titleEl = document.getElementById('spEarnedTitle')
  const noteEl = document.getElementById('spEarnedNote')
  const availableTotal = SKILL_TREE_KEYS.reduce((total, key) => total + skillPointsAvailable(key), 0)
  const spBadge = document.getElementById('skillPointHudBadge')
  const spText = document.getElementById('skillPointHudText')
  if (spBadge && spText && !(typeof multiplayerMatchActive !== 'undefined' && multiplayerMatchActive)) {
    spBadge.hidden = availableTotal <= 0
    if (availableTotal > 0) {
      spText.textContent = `${availableTotal} SP · [U]`
    }
  }
  if (!banner) return
  if (titleEl) titleEl.textContent = `SKILL POINT EARNED (${availableTotal} SP AVAILABLE)`
  if (noteEl) noteEl.textContent = `${category || 'Discipline'} unlocked +1 SP — Press [U] or click to upgrade`
  banner.hidden = false
  window.clearTimeout(spEarnedBannerTimer)
  spEarnedBannerTimer = 0
  if (options && options.persistForTutorial) return
  spEarnedBannerTimer = window.setTimeout(() => {
    if (window.ByteboundTutorial?.state?.activeId === 'game_skill_tree') {
      spEarnedBannerTimer = 0
      return
    }
    banner.hidden = true
    spEarnedBannerTimer = 0
  }, 5000)
}

function openSkillTree() {
  if (skillTreeOpen || document.getElementById('app').hidden) return
  if (typeof hideUiHoverBubble === 'function') hideUiHoverBubble()
  skillTreeOpen = true
  skillTreeReturnFocus = document.activeElement
  const tree = document.getElementById('skillTreeOverlay')
  tree.hidden = false
  tree.setAttribute('aria-hidden', 'false')
  renderSkillTree()
  document.getElementById('closeSkillTree').focus()
  updateNavigation()
  syncAnimationLoop()
  window.ByteboundTutorial?.onSkillTreeState?.(true)
}

function closeSkillTree() {
  if (!skillTreeOpen) return
  skillTreeOpen = false
  stopSkillTreeParticles()
  const tree = document.getElementById('skillTreeOverlay')
  tree.hidden = true
  tree.setAttribute('aria-hidden', 'true')
  const canRestoreFocus = skillTreeReturnFocus &&
    !tree.contains(skillTreeReturnFocus) &&
    skillTreeReturnFocus.isConnected &&
    skillTreeReturnFocus.matches('button, a[href], input, select, textarea, [tabindex]') &&
    skillTreeReturnFocus.getClientRects().length
  const focusTarget = canRestoreFocus
    ? skillTreeReturnFocus
    : document.querySelector('canvas')
  if (focusTarget?.isConnected) focusTarget.focus()
  skillTreeReturnFocus = null
  updateNavigation()
  syncAnimationLoop()
  window.ByteboundTutorial?.onSkillTreeState?.(false)
}

document.getElementById('skillTreeOverlay').addEventListener('click', (event) => {
  if (event.target.closest('#closeSkillTree')) {
    closeSkillTree()
    return
  }
  if (event.target.closest('#startSkillTree') && !skillTreeStarted) {
    skillTreeStarted = true
    renderSkillTree()
    document.querySelector('[data-skill-select="foundation"][data-skill-tree="computerSystems"]')?.focus()
    window.ByteboundTutorial?.onSkillTreeAction?.('start')
    return
  }
  const node = event.target.closest('[data-skill-select]')
  if (node) {
    selectedSkillNode = { treeKey: node.dataset.skillTree, skillId: node.dataset.skillSelect }
    document.querySelectorAll('.skill-map-node').forEach((skillNode) => {
      const selected = skillNode === node
      skillNode.classList.toggle('is-selected', selected)
      skillNode.setAttribute('aria-pressed', String(selected))
    })
    document.getElementById('skillTreeDetail').outerHTML = skillTreeDetailMarkup()
    window.ByteboundTutorial?.onSkillTreeAction?.('select')
    return
  }
  const button = event.target.closest('[data-skill-purchase]')
  if (!button) return
  const pTree = button.dataset.skillTree
  const pSkill = button.dataset.skillPurchase
  if (upgradeSkill(pTree, pSkill)) {
    lastPurchasedSkill = { treeKey: pTree, skillId: pSkill }
    Sound.play('heal')
    renderSkillTree()
    burstSkillTreeParticles(pTree, pSkill)
    window.setTimeout(() => {
      if (lastPurchasedSkill?.treeKey === pTree && lastPurchasedSkill?.skillId === pSkill) {
        lastPurchasedSkill = null
      }
    }, 750)
    renderHud()
  }
})

document.getElementById('skillTreeOverlay').addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return
  const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled)')]
  const first = controls[0]
  const last = controls[controls.length - 1]
  if (!first || !last) return
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
})

window.addEventListener('resize', () => {
  if (worldMapOpen) {
    worldMapPan = null
    renderWorldMap()
  }
  if (!skillTreeOpen) return
  skillMapPan = null
  renderSkillTree()
})

const WORLD_MAP_WIDTH = 1540
const WORLD_MAP_HEIGHT = 540
const WORLD_MAP_MIN_ZOOM = 0.65
const WORLD_MAP_MAX_ZOOM = 1.45
let worldMapPan = null
let worldMapParticleRaf = 0
let worldMapAmbientParticles = []
let worldMapActiveEdgePolylines = []
let worldMapWasDragging = false
let hoveredWorldMapRoom = null

const WORLD_MAP_NODES = [
  { id: 1, zone: 'datacenter', zoneLabel: 'DATA CENTER', x: 62, y: 48, desc: 'Industrial bay lined with wall CRT terminals. Defeat viruses to unlock the blast door.', exits: 'Door → Server Shaft (02)' },
  { id: 2, zone: 'datacenter', zoneLabel: 'DATA CENTER', x: 222, y: 48, desc: 'Stepped server shaft with an upper terminal alcove and lower rack corridor.', exits: 'Door → Control Deck (03)' },
  { id: 3, zone: 'datacenter', zoneLabel: 'DATA CENTER', x: 382, y: 48, desc: 'Multi-tiered operations deck with a central steel platform and wall monitors.', exits: 'Door → Office Wing (04)' },
  { id: 4, zone: 'bbcorp', zoneLabel: 'BB CORP', x: 542, y: 48, desc: 'Stepped corporate office wing leading down into a yellow-lit server bay.', exits: 'Door → Executive Floor (05)' },
  { id: 5, zone: 'bbcorp', zoneLabel: 'BB CORP', x: 702, y: 48, desc: 'Glass-walled corner office and mezzanine guarded by Mini Boss Kor.', exits: 'Door → BB Corp Street (06)' },
  { id: 6, zone: 'mainroad', zoneLabel: 'STREET HUB', x: 702, y: 196, isHub: true, desc: 'Central crossing outside BB Corp branching West toward Cafe & Supply and East toward Hospital & Bank.', exits: '◀ Left Street → Net Cafe St (07)  ·  ▶ Right Street → East Main Rd (10)' },
  { id: 7, zone: 'netcafe', zoneLabel: 'LEFT STREET', x: 492, y: 318, isHub: true, desc: 'West commercial block with Storefront Shutter into Corp Supply and Neon Entrance into Net Cafe.', exits: '▶ BB Corp St (06)  ·  ◀ Net Cafe (08)  ·  ◀ Corp Supply Shutter (15)' },
  { id: 8, zone: 'netcafe', zoneLabel: 'NET CAFE', x: 300, y: 230, desc: 'Multi-floor cyber cafe with Gamer Lobby, Arcade, and upper Staff Only loft.', exits: 'Exit ⇄ Left Street (07)  ·  Staff Only ⇄ Staff Room (09)' },
  { id: 9, zone: 'netcafe', zoneLabel: 'NET CAFE', x: 118, y: 230, desc: 'Restricted back server bay guarded by Final Boss King Crolue.', exits: 'Staff Only ⇄ Net Cafe Lobby (08)  ·  Exit/Security ↻ Loops to Next Cycle' },
  { id: 15, zone: 'supply', zoneLabel: 'CORP SUPPLY', x: 300, y: 406, desc: 'Warehouse loading bay, forklift lane, and upper racking leading to Security Management.', exits: 'Shutter ⇄ Left Street (07)  ·  Management ⇄ Supply Upper (16)' },
  { id: 16, zone: 'supply', zoneLabel: 'CORP SUPPLY', x: 118, y: 406, desc: 'Conveyor ramp, server bay pit, and Upper Security catwalk guarded by Final Boss King Crolue.', exits: 'Management ⇄ Corp Supply (15)  ·  Exit ↻ Loops to Next Cycle' },
  { id: 10, zone: 'hospital', zoneLabel: 'RIGHT STREET', x: 912, y: 318, isHub: true, desc: 'East main boulevard featuring Hospital sliding doors and the fortified Bank facade.', exits: '◀ BB Corp St (06)  ·  ▶ Hospital Wing (11)  ·  ▶ Bank (13)' },
  { id: 11, zone: 'hospital', zoneLabel: 'HOSPITAL', x: 1104, y: 230, desc: 'Emergency/Triage entrance lobby, Radiology/X-Ray, Pharmacy, and Utility.', exits: 'Sliding Door ⇄ Right Street (10)  ·  Exit Door ⇄ Upper Floors (12)' },
  { id: 12, zone: 'hospital', zoneLabel: 'HOSPITAL', x: 1286, y: 230, desc: 'Top-level Surgery & ICU wards guarded by Final Boss King Crolue.', exits: 'Staff Only ⇄ Hospital Wing (11)  ·  Exit ↻ Loops to Next Cycle' },
  { id: 13, zone: 'bank', zoneLabel: 'BANK', x: 1104, y: 406, desc: 'Three-tier secure vault facility with Vault Chamber, ATM Lobby, and Management Wing.', exits: 'Bank Door ⇄ Right Street (10)  ·  Management ⇄ Upper Floors (14)' },
  { id: 14, zone: 'bank', zoneLabel: 'BANK', x: 1286, y: 406, desc: 'Top-level Bank Management & Vault Wing guarded by Final Boss King Crolue.', exits: 'Management ⇄ Bank (13)  ·  Exit ↻ Loops to Next Cycle' },
]

const WORLD_MAP_EDGES = [
  { from: 1, to: 2, dir: 'right', label: 'Door' },
  { from: 2, to: 3, dir: 'right', label: 'Door' },
  { from: 3, to: 4, dir: 'right', label: 'Door' },
  { from: 4, to: 5, dir: 'right', label: 'Door' },
  { from: 5, to: 6, dir: 'down', label: 'Street Exit' },
  { from: 6, to: 7, dir: 'left', branch: true, label: 'Left Street' },
  { from: 7, to: 8, dir: 'left', branch: true, bidirectional: true, label: 'Cafe Door' },
  { from: 8, to: 9, dir: 'left', bidirectional: true, label: 'Staff Door' },
  { from: 7, to: 15, dir: 'left', branch: true, bidirectional: true, label: 'Supply Shutter' },
  { from: 15, to: 16, dir: 'left', bidirectional: true, label: 'Management' },
  { from: 6, to: 10, dir: 'right', branch: true, bidirectional: true, label: 'Right Street' },
  { from: 10, to: 11, dir: 'right', branch: true, bidirectional: true, label: 'Sliding Door' },
  { from: 11, to: 12, dir: 'right', bidirectional: true, label: 'Staff / Exit' },
  { from: 10, to: 13, dir: 'right', branch: true, bidirectional: true, label: 'Bank Door' },
  { from: 13, to: 14, dir: 'right', bidirectional: true, label: 'Management' },
]

const WORLD_MAP_NODE_BY_ID = Object.fromEntries(WORLD_MAP_NODES.map((n) => [n.id, n]))
const WORLD_MAP_PARENT_BY_ID = Object.fromEntries(WORLD_MAP_EDGES.map((e) => [e.to, e.from]))

function pointAlongPolyline(pts, t) {
  if (!pts?.length) return { x: 0, y: 0 }
  if (pts.length === 1) return pts[0]
  let total = 0
  const lens = []
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    lens.push(seg)
    total += seg
  }
  if (!total) return pts[0]
  let dist = Math.max(0, Math.min(1, t)) * total
  for (let i = 0; i < lens.length; i++) {
    const seg = lens[i]
    if (dist <= seg || i === lens.length - 1) {
      const f = seg ? dist / seg : 0
      return {
        x: pts[i].x + (pts[i + 1].x - pts[i].x) * f,
        y: pts[i].y + (pts[i + 1].y - pts[i].y) * f,
      }
    }
    dist -= seg
  }
  return pts[pts.length - 1]
}

function stopWorldMapParticles() {
  if (worldMapParticleRaf) {
    cancelAnimationFrame(worldMapParticleRaf)
    worldMapParticleRaf = 0
  }
}

function startWorldMapParticles(viewport) {
  stopWorldMapParticles()
  const canvasEl = document.getElementById('worldMapParticles')
  if (!canvasEl || !viewport) return
  const ctx = canvasEl.getContext('2d')
  if (!ctx) return
  const w = Math.max(320, viewport.clientWidth || 720)
  const h = Math.max(240, viewport.clientHeight || 420)
  canvasEl.width = w
  canvasEl.height = h
  const colors = ['#f2bb61', '#9e7ee6', '#d9954c', '#5fc29a', '#7fb8cc']
  if (!worldMapAmbientParticles.length) {
    worldMapAmbientParticles = Array.from({ length: 42 }, (_, idx) => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.34,
      vy: -0.14 - Math.random() * 0.32,
      size: 2 + (idx % 3),
      alpha: 0.22 + Math.random() * 0.45,
      color: colors[idx % colors.length],
    }))
  }
  let pathPhase = 0
  const step = () => {
    if (!worldMapOpen || !canvasEl.isConnected) {
      worldMapParticleRaf = 0
      return
    }
    if (canvasEl.width !== viewport.clientWidth || canvasEl.height !== viewport.clientHeight) {
      canvasEl.width = Math.max(320, viewport.clientWidth)
      canvasEl.height = Math.max(240, viewport.clientHeight)
    }
    const cw = canvasEl.width
    const ch = canvasEl.height
    ctx.clearRect(0, 0, cw, ch)
    for (const p of worldMapAmbientParticles) {
      p.x += p.vx
      p.y += p.vy
      if (p.y < -6) { p.y = ch + 6; p.x = Math.random() * cw }
      if (p.x < -6) p.x = cw + 6
      if (p.x > cw + 6) p.x = -6
      ctx.globalAlpha = p.alpha
      ctx.fillStyle = p.color
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size)
    }
    ctx.globalAlpha = 1

    const fxCanvas = document.getElementById('worldMapStageFx')
    const fxCtx = fxCanvas?.getContext('2d')
    if (fxCtx && fxCanvas) {
      fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height)
      pathPhase = (pathPhase + 0.0085) % 1
      for (let i = 0; i < worldMapActiveEdgePolylines.length; i++) {
        const edge = worldMapActiveEdgePolylines[i]
        const sparkColor = edge.completed ? '#7ef0a2' : edge.branch ? '#ffd27a' : '#96dcf2'
        for (let copy = 0; copy < 2; copy++) {
          const t = (pathPhase + copy * 0.5 + i * 0.13) % 1
          const pt = pointAlongPolyline(edge.pts, t)
          fxCtx.fillStyle = sparkColor
          fxCtx.globalAlpha = 0.85
          fxCtx.fillRect(Math.round(pt.x - 2), Math.round(pt.y - 2), 4, 4)
        }
      }
      fxCtx.globalAlpha = 1
    }
    worldMapParticleRaf = requestAnimationFrame(step)
  }
  worldMapParticleRaf = requestAnimationFrame(step)
}

function isMapNodeCleared(nodeId) {
  const cycleOffset = Math.floor((level - 1) / ROOM_COUNT) * ROOM_COUNT
  if (clearedRooms.has(nodeId) || clearedRooms.has(cycleOffset + nodeId)) return true
  const currentBase = ((level - 1) % ROOM_COUNT) + 1
  return currentBase === nodeId && enemies.length > 0 && enemies.every((e) => !e.alive)
}

function isMapNodeUnlocked(nodeId) {
  if (nodeId === 1) return true
  const currentBase = ((level - 1) % ROOM_COUNT) + 1
  if (nodeId === currentBase || isMapNodeCleared(nodeId) || visitedRooms.has(nodeId)) return true
  const parentId = WORLD_MAP_PARENT_BY_ID[nodeId]
  return Boolean(parentId && isMapNodeCleared(parentId))
}

function getMapUnlockRequirement(nodeId) {
  if (nodeId === 1) return 'Starting Map · Always Unlocked'
  const parentId = WORLD_MAP_PARENT_BY_ID[nodeId]
  const parentName = LEVELS[parentId]?.name || 'Previous Room'
  return `Requires clearing Room #${String(parentId || 1).padStart(2, '0')} · ${parentName}`
}

function getWorldMapNodeDetails(nodeId) {
  const node = WORLD_MAP_NODE_BY_ID[nodeId] || WORLD_MAP_NODES[0]
  const base = LEVELS[node.id] || {}
  const cycleOffset = Math.floor((level - 1) / ROOM_COUNT) * ROOM_COUNT
  const cfg = levelConfig(cycleOffset + node.id)
  const currentBase = ((level - 1) % ROOM_COUNT) + 1
  const isCurrent = node.id === currentBase
  const isCleared = isMapNodeCleared(node.id)
  const isUnlocked = isMapNodeUnlocked(node.id)
  const statusKey = isCurrent
    ? 'current'
    : isCleared
      ? 'completed'
      : isUnlocked
        ? 'unlocked'
        : 'locked'
  const statusLabel = isCurrent
    ? 'CURRENT'
    : isCleared
      ? 'COMPLETED'
      : isUnlocked
        ? 'UNLOCKED'
        : 'LOCKED'

  const difficulty = node.id <= 3
    ? 'Tier I · Entry Bay'
    : node.id <= 5
      ? 'Tier II · Core Security'
      : node.id === 6 || node.id === 7 || node.id === 10
        ? 'Tier III · Street District'
        : (node.id === 9 || node.id === 12 || node.id === 14 || node.id === 16)
          ? 'Tier V · Boss Sanctum'
          : 'Tier IV · Interior Wing'

  let enemySummary
  const isBossNode = Boolean(cfg.boss)
  const isFinalBoss = Boolean(cfg.final)
  if (cfg.final) {
    enemySummary = 'Final Boss · King Crolue'
  } else if (cfg.korBoss) {
    enemySummary = 'Mini Boss · Kor'
  } else if (cfg.grenuBoss) {
    enemySummary = 'Mini Boss · Grenu'
  } else {
    const placements = Array.isArray(base.enemyPlacements) ? base.enemyPlacements : []
    const specials = []
    if (placements.some((p) => p.nyrmed)) specials.push('Nyrmed')
    if (placements.some((p) => p.grenu)) specials.push('Grenu')
    const baseCount = base.pigs || placements.length || 0
    enemySummary = specials.length
      ? `${baseCount} Viruses (${specials.join(' + ')})`
      : `${baseCount} Viruses`
  }

  return {
    node,
    base,
    cfg,
    name: base.name || `Room ${node.id}`,
    thumbnail: base.bg || '',
    difficulty,
    enemySummary,
    isCurrent,
    isCleared,
    isUnlocked,
    isBossNode,
    isFinalBoss,
    statusKey,
    statusLabel,
    unlockReq: getMapUnlockRequirement(node.id),
  }
}

function hideWorldMapHoverPreview() {
  hoveredWorldMapRoom = null
  const preview = document.getElementById('worldMapHoverPreview')
  if (preview) {
    preview.classList.remove('is-visible')
    preview.setAttribute('aria-hidden', 'true')
  }
  document.querySelectorAll('#worldMapStage .world-map-edge.is-hover-highlight').forEach((edgeEl) => {
    edgeEl.classList.remove('is-hover-highlight')
  })
}

function showWorldMapHoverPreview(nodeId, cardEl) {
  const viewport = document.getElementById('worldMapViewport')
  const preview = document.getElementById('worldMapHoverPreview')
  if (!viewport || !preview || !cardEl || !worldMapOpen) return
  const d = getWorldMapNodeDetails(nodeId)
  hoveredWorldMapRoom = nodeId

  document.querySelectorAll('#worldMapStage .world-map-edge').forEach((edgeEl) => {
    const match = edgeEl.dataset.edgeFrom === String(nodeId) || edgeEl.dataset.edgeTo === String(nodeId)
    edgeEl.classList.toggle('is-hover-highlight', match)
  })

  const footerLine = d.isUnlocked
    ? (d.isCurrent ? 'Current room · Click card to inspect or resume' : 'Click to select · Double-click or click Enter Map')
    : `Locked · ${d.unlockReq}`

  preview.innerHTML = `
    <div class="wmp-thumb-wrap">
      ${d.thumbnail ? `<img class="wmp-thumb" src="${esc(d.thumbnail)}" alt="${esc(d.name)} preview" />` : ''}
      <span class="wmp-status-badge is-${d.statusKey}">${d.statusLabel}</span>
    </div>
    <div class="wmp-head">
      <strong>${esc(d.name)}</strong>
      <span>MAP #${String(nodeId).padStart(2, '0')}</span>
    </div>
    <div class="wmp-tags">
      <span class="wmp-tag">${esc(d.node.zoneLabel)}</span>
      <span class="wmp-tag">${esc(d.difficulty)}</span>
      <span class="wmp-tag${d.isBossNode ? ' is-boss' : ''}">${esc(d.enemySummary)}</span>
    </div>
    <p class="wmp-desc">${esc(d.node.desc)}</p>
    <div class="wmp-footer">${esc(footerLine)}</div>
  `

  const vr = viewport.getBoundingClientRect()
  const cr = cardEl.getBoundingClientRect()
  const prevW = preview.offsetWidth || 288
  const prevH = preview.offsetHeight || 250
  const vw = viewport.clientWidth || vr.width || 960
  const vh = viewport.clientHeight || vr.height || 520

  let left = cr.right - vr.left + 14
  if (left + prevW > vw - 12) {
    left = cr.left - vr.left - prevW - 14
  }
  left = Math.max(12, Math.min(vw - prevW - 12, left))

  let top = cr.top - vr.top - 10
  top = Math.max(12, Math.min(vh - prevH - 12, top))

  preview.style.left = `${Math.round(left)}px`
  preview.style.top = `${Math.round(top)}px`
  preview.setAttribute('aria-hidden', 'false')
  preview.classList.add('is-visible')
}

function travelToWorldMapRoom(roomId) {
  const id = Number(roomId)
  const d = getWorldMapNodeDetails(id)
  if (!d.isUnlocked) {
    selectedWorldMapRoom = id
    updateWorldMapInspector(WORLD_MAP_NODE_BY_ID, ((level - 1) % ROOM_COUNT) + 1)
    return false
  }
  const cycleOffset = Math.floor((level - 1) / ROOM_COUNT) * ROOM_COUNT
  const destLevel = cycleOffset + id
  closeWorldMap()
  if (destLevel !== level) {
    loadLevel(destLevel)
  }
  gsap.to(overlay, { opacity: 0, duration: 0.25 })
  return true
}

function updateWorldMapInspector(nodeMap, currentBase) {
  const inspector = document.getElementById('worldMapInspector')
  if (!inspector) return
  const selNode = nodeMap[selectedWorldMapRoom] || nodeMap[currentBase]
  const d = getWorldMapNodeDetails(selNode.id)
  const actionBtn = d.isUnlocked
    ? `<button type="button" class="world-map-enter-btn" id="worldMapEnterButton" data-map-enter="${selNode.id}">${d.isCurrent ? 'Resume Current Map' : d.isCleared ? 'Replay Map →' : 'Enter Map →'}</button>`
    : `<button type="button" class="world-map-enter-btn is-locked" id="worldMapEnterButton" data-map-enter="${selNode.id}" disabled>🔒 ${esc(d.unlockReq)}</button>`
  inspector.innerHTML = `
    <div class="world-map-inspector-main">
      <strong>ROOM ${String(selNode.id).padStart(2, '0')} · ${esc(d.name)} (${d.statusLabel}) · ${esc(d.enemySummary)}</strong>
      <span>${esc(selNode.desc)}</span>
    </div>
    <div class="world-map-inspector-side">
      <div class="world-map-inspector-links">${esc(selNode.exits)}</div>
      ${actionBtn}
    </div>
  `
}

function bindWorldMapViewportControls(viewport, stage, centerFocusNode) {
  const zoomStatus = document.getElementById('worldMapZoomStatus')
  const vw = Math.max(320, viewport.clientWidth || 720)
  const vh = Math.max(240, viewport.clientHeight || 420)
  const fitScale = Math.min(1, Math.min((vw - 32) / WORLD_MAP_WIDTH, (vh - 28) / WORLD_MAP_HEIGHT))
  const defaultScale = Math.max(WORLD_MAP_MIN_ZOOM, Math.min(1, Number(fitScale.toFixed(2))))

  if (!worldMapPan || !viewport.clientWidth || !viewport.clientHeight) {
    const focus = centerFocusNode || WORLD_MAP_NODES[5]
    const focusCx = focus.x + 68
    const focusCy = focus.y + (focus.isHub ? 48 : 46)
    worldMapPan = {
      x: vw / 2 - focusCx * defaultScale,
      y: vh / 2 - focusCy * defaultScale,
      scale: defaultScale,
    }
  }
  worldMapPan.scale = Math.max(WORLD_MAP_MIN_ZOOM, Math.min(WORLD_MAP_MAX_ZOOM, worldMapPan.scale || defaultScale))

  const updateZoomStatus = () => {
    if (zoomStatus) zoomStatus.textContent = `Zoom ${Math.round(worldMapPan.scale * 100)}% · Drag to pan, scroll to zoom`
  }
  const clampPan = () => {
    const scaledW = WORLD_MAP_WIDTH * worldMapPan.scale
    const scaledH = WORLD_MAP_HEIGHT * worldMapPan.scale
    const cw = viewport.clientWidth || vw
    const ch = viewport.clientHeight || vh
    worldMapPan.x = scaledW <= cw
      ? (cw - scaledW) / 2
      : Math.min(36, Math.max(cw - scaledW - 36, worldMapPan.x))
    worldMapPan.y = scaledH <= ch
      ? (ch - scaledH) / 2
      : Math.min(28, Math.max(ch - scaledH - 28, worldMapPan.y))
    stage.style.transform = `translate(${worldMapPan.x}px, ${worldMapPan.y}px) scale(${worldMapPan.scale})`
  }
  clampPan()
  updateZoomStatus()

  if (viewport.dataset.boundPan === '1') return
  viewport.dataset.boundPan = '1'
  let drag = null

  viewport.addEventListener('wheel', (event) => {
    if (!worldMapOpen || event.deltaY === 0) return
    event.preventDefault()
    hideWorldMapHoverPreview()
    const rect = viewport.getBoundingClientRect()
    const anchorX = event.clientX - rect.left
    const anchorY = event.clientY - rect.top
    const nextScale = Math.max(
      WORLD_MAP_MIN_ZOOM,
      Math.min(WORLD_MAP_MAX_ZOOM, worldMapPan.scale * Math.exp(-event.deltaY * 0.001))
    )
    if (nextScale === worldMapPan.scale) return
    const mapX = (anchorX - worldMapPan.x) / worldMapPan.scale
    const mapY = (anchorY - worldMapPan.y) / worldMapPan.scale
    worldMapPan.scale = nextScale
    worldMapPan.x = anchorX - mapX * nextScale
    worldMapPan.y = anchorY - mapY * nextScale
    clampPan()
    updateZoomStatus()
  }, { passive: false })

  viewport.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.target.closest('button')) return
    hideWorldMapHoverPreview()
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX: worldMapPan.x, panY: worldMapPan.y, moved: false }
    viewport.setPointerCapture(event.pointerId)
  })
  viewport.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (!drag.moved && Math.hypot(dx, dy) > 4) drag.moved = true
    worldMapPan.x = drag.panX + dx
    worldMapPan.y = drag.panY + dy
    viewport.classList.add('is-panning')
    clampPan()
  })
  const finishDrag = (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return
    if (drag.moved) {
      worldMapWasDragging = true
      window.setTimeout(() => { worldMapWasDragging = false }, 50)
    }
    drag = null
    viewport.classList.remove('is-panning')
  }
  viewport.addEventListener('pointerup', finishDrag)
  viewport.addEventListener('pointercancel', finishDrag)

  stage.addEventListener('pointerover', (event) => {
    if (drag) return
    const card = event.target.closest('[data-map-room]')
    if (card) showWorldMapHoverPreview(Number(card.dataset.mapRoom), card)
  })
  stage.addEventListener('pointerout', (event) => {
    const card = event.target.closest('[data-map-room]')
    if (!card) return
    const related = event.relatedTarget?.closest?.('[data-map-room]')
    if (!related) hideWorldMapHoverPreview()
  })
  stage.addEventListener('mouseleave', hideWorldMapHoverPreview)
}

function renderWorldMap() {
  const viewport = document.getElementById('worldMapViewport')
  const stage = document.getElementById('worldMapStage')
  if (!stage || !viewport) return

  const currentBase = ((level - 1) % ROOM_COUNT) + 1
  if (!selectedWorldMapRoom) selectedWorldMapRoom = currentBase
  const nodeMap = WORLD_MAP_NODE_BY_ID
  const NODE_W = 136
  worldMapActiveEdgePolylines = []

  const edgePaths = WORLD_MAP_EDGES.map((edge) => {
    const a = nodeMap[edge.from]
    const b = nodeMap[edge.to]
    const ah = a.isHub ? 96 : 92
    const bh = b.isHub ? 96 : 92
    let pts
    if (edge.dir === 'down') {
      const cx1 = a.x + NODE_W / 2
      const cy1 = a.y + ah
      const cx2 = b.x + NODE_W / 2
      const cy2 = b.y
      const my = Math.round((cy1 + cy2) / 2)
      pts = [{ x: cx1, y: cy1 }, { x: cx1, y: my }, { x: cx2, y: my }, { x: cx2, y: cy2 }]
    } else if (edge.dir === 'left') {
      const x1 = a.x
      const y1 = a.y + ah / 2
      const x2 = b.x + NODE_W
      const y2 = b.y + bh / 2
      const mx = Math.round((x1 + x2) / 2)
      pts = [{ x: x1, y: y1 }, { x: mx, y: y1 }, { x: mx, y: y2 }, { x: x2, y: y2 }]
    } else {
      const x1 = a.x + NODE_W
      const y1 = a.y + ah / 2
      const x2 = b.x
      const y2 = b.y + bh / 2
      const mx = Math.round((x1 + x2) / 2)
      pts = [{ x: x1, y: y1 }, { x: mx, y: y1 }, { x: mx, y: y2 }, { x: x2, y: y2 }]
    }
    const d = `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y} L ${pts[2].x} ${pts[2].y} L ${pts[3].x} ${pts[3].y}`

    const bCleared = isMapNodeCleared(b.id)
    const aCleared = isMapNodeCleared(a.id)
    const bUnlocked = isMapNodeUnlocked(b.id)
    const isCompleted = aCleared && (bCleared || visitedRooms.has(b.id) || b.id === currentBase)
    const isAvailable = !isCompleted && (aCleared || bUnlocked || a.id === currentBase)
    if (isCompleted || isAvailable) {
      worldMapActiveEdgePolylines.push({ pts, completed: isCompleted, branch: Boolean(edge.branch) })
    }
    const cls = [
      'world-map-edge',
      edge.branch ? 'is-branch' : '',
      isCompleted ? 'is-completed is-active' : isAvailable ? 'is-available is-active' : 'is-locked',
    ].filter(Boolean).join(' ')
    return `<path class="${cls}" data-edge-from="${a.id}" data-edge-to="${b.id}" d="${d}" />`
  }).join('')

  const cardsHtml = WORLD_MAP_NODES.map((node, idx) => {
    const d = getWorldMapNodeDetails(node.id)
    const isSelected = node.id === selectedWorldMapRoom
    const stateCls = d.isCurrent
      ? 'is-current'
      : d.isCleared
        ? 'is-cleared'
        : d.isUnlocked
          ? 'is-visited is-unlocked'
          : 'is-unexplored is-locked'
    const pillText = d.isCurrent
      ? 'YOU ARE HERE'
      : d.isCleared
        ? 'COMPLETED'
        : d.isUnlocked
          ? 'UNLOCKED'
          : 'LOCKED'
    const foesText = d.isCurrent
      ? `${enemies.filter((e) => e.alive).length}/${enemies.length} FOES`
      : d.isFinalBoss
        ? 'KING CROLUE'
        : d.isBossNode
          ? 'MINI BOSS'
          : `${d.base?.pigs || 0} FOES`
    const bossClasses = [
      d.isBossNode ? 'is-boss-node' : '',
      d.isFinalBoss ? 'is-final-boss' : '',
    ].filter(Boolean).join(' ')
    const thumbTag = d.isBossNode
      ? `<span class="biome-node-boss-tag">${d.isFinalBoss ? '★ BOSS' : '◆ ELITE'}</span>`
      : ''
    return `<button type="button" class="biome-node zone-${node.zone} ${stateCls} ${bossClasses}${isSelected ? ' is-selected' : ''}" style="left:${node.x}px;top:${node.y}px;animation-delay:${idx * 18}ms" data-map-room="${node.id}" aria-pressed="${isSelected}">
      <div class="biome-node-thumb" style="background-image:url('${esc(d.thumbnail)}')">${thumbTag}</div>
      <div class="biome-node-top">
        <span>${node.zoneLabel}</span>
        <span>#${String(node.id).padStart(2, '0')}</span>
      </div>
      <div class="biome-node-name">${esc(d.name)}</div>
      <div class="biome-node-meta">
        <span>${foesText}</span>
        <span class="biome-node-pill">${pillText}</span>
      </div>
    </button>`
  }).join('')

  stage.innerHTML = `
    <svg class="world-map-lines" width="${WORLD_MAP_WIDTH}" height="${WORLD_MAP_HEIGHT}" viewBox="0 0 ${WORLD_MAP_WIDTH} ${WORLD_MAP_HEIGHT}" aria-hidden="true">${edgePaths}</svg>
    <canvas class="world-map-stage-fx" id="worldMapStageFx" width="${WORLD_MAP_WIDTH}" height="${WORLD_MAP_HEIGHT}" aria-hidden="true"></canvas>
    <div class="world-map-track-tag is-cafe" style="left:118px;top:194px;">LEFT STREET · NET CAFE & CORP SUPPLY</div>
    <div class="world-map-track-tag is-hub" style="left:664px;top:338px;">CENTRAL STREET JUNCTION</div>
    <div class="world-map-track-tag is-hosp" style="left:1104px;top:194px;">RIGHT STREET · HOSPITAL & BANK</div>
    ${cardsHtml}
  `

  updateWorldMapInspector(nodeMap, currentBase)
  bindWorldMapViewportControls(viewport, stage, nodeMap[currentBase])
  hideWorldMapHoverPreview()
  startWorldMapParticles(viewport)
}

function openWorldMap() {
  if (worldMapOpen || document.getElementById('app').hidden) return
  if (typeof hideUiHoverBubble === 'function') hideUiHoverBubble()
  if (skillTreeOpen) closeSkillTree()
  keys.a.pressed = false
  keys.d.pressed = false
  worldMapOpen = true
  worldMapPan = null
  worldMapReturnFocus = document.activeElement
  selectedWorldMapRoom = ((level - 1) % ROOM_COUNT) + 1
  const modal = document.getElementById('worldMapOverlay')
  modal.hidden = false
  modal.setAttribute('aria-hidden', 'false')
  renderWorldMap()
  document.getElementById('closeWorldMap')?.focus()
  syncAnimationLoop()
  window.ByteboundTutorial?.onWorldMapState?.(true)
}

function closeWorldMap() {
  if (!worldMapOpen) return
  worldMapOpen = false
  stopWorldMapParticles()
  hideWorldMapHoverPreview()
  const modal = document.getElementById('worldMapOverlay')
  modal.hidden = true
  modal.setAttribute('aria-hidden', 'true')
  const focusTarget = worldMapReturnFocus?.isConnected ? worldMapReturnFocus : document.querySelector('canvas')
  if (focusTarget?.isConnected) focusTarget.focus()
  worldMapReturnFocus = null
  syncAnimationLoop()
  window.ByteboundTutorial?.onWorldMapState?.(false)
}

document.getElementById('worldMapOverlay')?.addEventListener('click', (event) => {
  if (event.target.id === 'worldMapOverlay' || event.target.closest('#closeWorldMap')) {
    closeWorldMap()
    return
  }
  if (event.target.closest('#resetWorldMapView')) {
    worldMapWasDragging = false
    worldMapPan = null
    renderWorldMap()
    return
  }
  const enterBtn = event.target.closest('[data-map-enter]')
  if (enterBtn) {
    travelToWorldMapRoom(Number(enterBtn.dataset.mapEnter))
    return
  }
  const card = event.target.closest('[data-map-room]')
  if (card) {
    worldMapWasDragging = false
    const roomId = Number(card.dataset.mapRoom)
    selectedWorldMapRoom = roomId
    document.querySelectorAll('#worldMapStage .biome-node').forEach((node) => {
      const sel = node === card
      node.classList.toggle('is-selected', sel)
      node.setAttribute('aria-pressed', String(sel))
    })
    updateWorldMapInspector(WORLD_MAP_NODE_BY_ID, ((level - 1) % ROOM_COUNT) + 1)
    if (!isMapNodeUnlocked(roomId)) {
      card.classList.remove('is-locked-shake')
      void card.offsetWidth
      card.classList.add('is-locked-shake')
    }
  }
})

document.getElementById('worldMapOverlay')?.addEventListener('dblclick', (event) => {
  const card = event.target.closest('[data-map-room]')
  if (!card) return
  const roomId = Number(card.dataset.mapRoom)
  if (!isMapNodeUnlocked(roomId)) {
    card.classList.remove('is-locked-shake')
    void card.offsetWidth
    card.classList.add('is-locked-shake')
    return
  }
  travelToWorldMapRoom(roomId)
})

let lastPlayerHpPercent = null
let lastPlayerManaPercent = null
let lastEnemyHpPercent = null
let lastHudPlayerHp = null
let lastHudPlayerMana = null
let lastHudEnemyHp = null
let lastHudEnemyRef = null
let lastHudInCombat = false
const hudDeltaTimers = {
  playPlayerHpDelta: 0,
  playPlayerManaDelta: 0,
  playEnemyHpDelta: 0,
}
const hudDeltaState = {
  playPlayerHpDelta: { val: 0, ts: 0 },
  playPlayerManaDelta: { val: 0, ts: 0 },
  playEnemyHpDelta: { val: 0, ts: 0 },
}

function clearHudDeltaBadge(badgeId) {
  if (hudDeltaTimers[badgeId]) {
    window.clearTimeout(hudDeltaTimers[badgeId])
    hudDeltaTimers[badgeId] = 0
  }
  hudDeltaState[badgeId] = { val: 0, ts: 0 }
  const el = document.getElementById(badgeId)
  if (!el) return
  el.hidden = true
  el.textContent = ''
  el.classList.remove('is-positive', 'is-negative', 'is-damage', 'is-pop')
}

function clearAllHudDeltaBadges() {
  clearHudDeltaBadge('playPlayerHpDelta')
  clearHudDeltaBadge('playPlayerManaDelta')
  clearHudDeltaBadge('playEnemyHpDelta')
}

function showHudDeltaBadge(badgeId, delta, unit = 'HP', { isEnemy = false } = {}) {
  if (!delta || !Number.isFinite(delta)) return
  const el = document.getElementById(badgeId)
  if (!el) return

  const now = performance.now()
  const prev = hudDeltaState[badgeId]
  // Coalesce rapid same-sign changes within 160ms so multi-hit or burst recovery never flickers or duplicates
  let displayVal = Math.round(delta)
  if (prev && now - prev.ts < 160 && Math.sign(prev.val) === Math.sign(displayVal)) {
    displayVal = prev.val + displayVal
  }
  hudDeltaState[badgeId] = { val: displayVal, ts: now }

  const sign = displayVal > 0 ? '+' : ''
  el.textContent = `${sign}${displayVal} ${unit}`
  el.classList.remove('is-positive', 'is-negative', 'is-damage', 'is-pop')
  if (displayVal > 0) {
    el.classList.add('is-positive')
  } else if (isEnemy) {
    el.classList.add('is-damage', 'is-negative')
  } else {
    el.classList.add('is-negative')
  }
  el.hidden = false
  void el.offsetWidth
  el.classList.add('is-pop')

  if (hudDeltaTimers[badgeId]) {
    window.clearTimeout(hudDeltaTimers[badgeId])
  }
  hudDeltaTimers[badgeId] = window.setTimeout(() => {
    clearHudDeltaBadge(badgeId)
  }, 1500)
}

function animateMeterWithGhost(fillId, ghostId, percent, prevPercent, { instant = false } = {}) {
  const fill = document.getElementById(fillId)
  const ghost = document.getElementById(ghostId)
  if (!fill) return
  const meter = fill.parentElement
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0))
  const width = `${clamped}%`
  const reduced = document.body.classList.contains('reduce-motion') ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  if (instant || prevPercent === null || reduced) {
    fill.style.transition = 'none'
    if (ghost) ghost.style.transition = 'none'
    if (meter) meter.classList.remove('is-healing', 'is-damaging')
    fill.style.width = width
    if (ghost) ghost.style.width = width
    void fill.offsetWidth
    fill.style.removeProperty('transition')
    if (ghost) ghost.style.removeProperty('transition')
    return clamped
  }

  if (clamped !== prevPercent) {
    const increasing = clamped > prevPercent
    if (meter) {
      meter.classList.remove('is-healing', 'is-damaging')
    }
    if (ghost) {
      // Cancel any in-progress ghost animation and retarget immediately from the prior authoritative percent
      ghost.style.transition = 'none'
      ghost.style.width = `${increasing ? clamped : prevPercent}%`
      void ghost.offsetWidth
      ghost.style.removeProperty('transition')
    }
    if (meter) {
      meter.classList.add(increasing ? 'is-healing' : 'is-damaging')
    }
    fill.style.width = width
  } else {
    fill.style.width = width
  }
  return clamped
}

function updatePlayerHpMeter(percent, options = {}) {
  lastPlayerHpPercent = animateMeterWithGhost('playPlayerHpFill', 'playPlayerHpGhost', percent, lastPlayerHpPercent, options)
}

function updatePlayerManaMeter(percent, options = {}) {
  lastPlayerManaPercent = animateMeterWithGhost('playPlayerManaFill', 'playPlayerManaGhost', percent, lastPlayerManaPercent, options)
}

function updateEnemyHpMeter(percent, options = {}) {
  lastEnemyHpPercent = animateMeterWithGhost('playEnemyHpFill', 'playEnemyHpGhost', percent, lastEnemyHpPercent, options)
}

function renderDashboard() {
  refreshAchievements({ silent: true })
  const $ = (id) => document.getElementById(id)
  const room = currentRoom
  const totalPigs = room.pigs
  const defeated = Math.min(stats.roomKills || 0, totalPigs)
  const remaining = Math.max(0, totalPigs - defeated)
  const status = {
    menu: 'QUEST HUB',
    explore: 'EXPLORING',
    intro: 'BATTLE STARTING',
    battle: 'IN BATTLE',
    end: 'QUEST COMPLETE',
  }[mode] || 'QUEST HUB'

  $('app').classList.toggle('is-playing', playViewActive)
  $('app').classList.toggle('is-exploring', Boolean(playViewActive && mode === 'explore'))
  $('app').classList.toggle('is-subview', dashboardView !== 'quest' && !playViewActive)
  $('app').classList.toggle('is-tracker', dashboardView === 'tracker' && !playViewActive)
  $('app').classList.toggle('is-topic-tracker', dashboardView === 'tracker' && !playViewActive)
  $('app').classList.toggle('is-quest', dashboardView === 'quest' && !playViewActive)
  document.body.classList.toggle('play-session', playViewActive)
  const ctaLabel = mode === 'menu' ? 'Start game' : mode === 'end' ? 'Play again' : 'Resume game'
  $('startGameButton').textContent = ctaLabel
  $('exitPlayButton').textContent = practiceRunActive ? 'Exit Practice' : 'Menu'
  $('exitPlayButton').setAttribute(
    'aria-label',
    practiceRunActive ? 'Exit practice and return to the Quest Hub' : 'Pause and return to the menu'
  )
  $('exitPlayButton').title = practiceRunActive ? 'Exit Practice (Esc)' : 'Pause (Esc)'
  $('app').classList.toggle('has-run', mode !== 'menu')
  const isMp = typeof multiplayerMatchActive !== 'undefined' && multiplayerMatchActive
  $('playHint').textContent = isMp
    ? '1v1 Arena: Press 1-4 to pick card & answer · Enter next round · Esc exit'
    : ({
      explore: 'A / D move  ·  W jump / door  ·  Space jump  ·  Up door  ·  M map  ·  U skills  ·  Esc menu',
      battle: 'Press 1-4 to choose  ·  Enter to continue  ·  U skills  ·  Esc menu',
      end: 'Esc for the menu',
    }[mode] || '')
  document.querySelector('canvas').setAttribute(
    'aria-label',
    playViewActive ? 'Gameplay arena' : 'Game scene preview'
  )
  updateNavigation()
  $('playerBadge').textContent = activePlayerName || 'KNIGHT'
  $('playPlayerName').textContent = activePlayerName || 'KNIGHT'
  $('welcomeEyebrow').textContent = 'Quest Hub'
  $('welcomeTitle').textContent = `Welcome, ${activePlayerName || 'Knight'}`
  $('welcomeSubtitle').textContent = 'Choose a mode or continue a saved campaign run.'
  $('roomTxt').textContent = isMp ? (mpState.arenaName || '1v1 Arena') : room.name
  $('roomTag').textContent = `ROOM ${String(level).padStart(2, '0')}`
  $('previewStatus').textContent = status
  $('previewHeading').textContent = 'Campaign Arena'
  $('previewDescription').textContent = '16 rooms across 6 IT biomes.'
  $('accuracyNote').textContent = stats.total ? `${stats.correct} of ${stats.total} correct` : 'No battles yet'
  $('playRoomTag').textContent = isMp ? '1V1 DUEL' : `ROOM ${String(level).padStart(2, '0')}`
  $('playRoomName').textContent = isMp ? `${mpState.arenaName || 'Cyber Arena'} (${mpState.roomCode || 'LIVE'})` : room.name
  $('playModeStatus').textContent = isMp ? 'ONLINE DUEL' : status
  const spBadge = document.getElementById('skillPointHudBadge')
  const spText = document.getElementById('skillPointHudText')
  if (spBadge && spText) {
    const spTotal = isMp ? 0 : SKILL_TREE_KEYS.reduce((total, key) => total + skillPointsAvailable(key), 0)
    spBadge.hidden = spTotal <= 0
    if (spTotal > 0) {
      spText.textContent = `${spTotal} SP · [U]`
    }
  }
  const activeEnemy = (mode === 'battle' || mode === 'intro') ? battle.enemy : null
  const inCombatNow = Boolean(playViewActive && activeEnemy && (mode === 'battle' || mode === 'intro'))
  const enemyChanged = activeEnemy !== lastHudEnemyRef || !inCombatNow !== !lastHudInCombat
  const statusGridEl = document.querySelector('#playHud .play-status-grid')
  if (statusGridEl) {
    statusGridEl.hidden = inCombatNow || (playViewActive && mode === 'explore')
  }

  if (!inCombatNow) {
    if (lastHudInCombat) {
      clearAllHudDeltaBadges()
    }
    resetHeadBarState('hero', hero, hero.hp, hero.maxHp, hero.mana, hero.maxMana)
    resetHeadBarState('enemy', null, 0, 100)
    lastHudInCombat = false
    lastHudEnemyRef = null
    lastHudPlayerHp = hero.hp
    lastHudPlayerMana = hero.mana
    lastHudEnemyHp = null
  } else {
    if (enemyChanged) {
      // New encounter or enemy switched: reset enemy delta & snap enemy bar without carrying over previous enemy animation
      clearHudDeltaBadge('playEnemyHpDelta')
      resetHeadBarState('enemy', activeEnemy, activeEnemy.hp, activeEnemy.maxHp, activeEnemy.mana, activeEnemy.maxMana)
      if (!lastHudInCombat) {
        clearHudDeltaBadge('playPlayerHpDelta')
        clearHudDeltaBadge('playPlayerManaDelta')
        resetHeadBarState('hero', hero, hero.hp, hero.maxHp, hero.mana, hero.maxMana)
        lastHudPlayerHp = hero.hp
        lastHudPlayerMana = hero.mana
      }
      lastHudEnemyRef = activeEnemy
      lastHudEnemyHp = activeEnemy.hp
    } else {
      syncHeadBarTarget('hero', hero, hero.hp, hero.maxHp, hero.mana, hero.maxMana)
      syncHeadBarTarget('enemy', activeEnemy, activeEnemy.hp, activeEnemy.maxHp, activeEnemy.mana, activeEnemy.maxMana)
      if (lastHudPlayerHp !== null && hero.hp !== lastHudPlayerHp) {
        showHudDeltaBadge('playPlayerHpDelta', hero.hp - lastHudPlayerHp, 'HP', { isEnemy: false })
      }
      if (lastHudPlayerMana !== null && hero.mana !== lastHudPlayerMana) {
        showHudDeltaBadge('playPlayerManaDelta', hero.mana - lastHudPlayerMana, 'MP', { isEnemy: false })
      }
      if (lastHudEnemyHp !== null && activeEnemy.hp !== lastHudEnemyHp) {
        showHudDeltaBadge('playEnemyHpDelta', activeEnemy.hp - lastHudEnemyHp, 'HP', { isEnemy: true })
      }
      lastHudPlayerHp = hero.hp
      lastHudPlayerMana = hero.mana
      lastHudEnemyHp = activeEnemy.hp
    }
    lastHudInCombat = true
  }

  $('playPlayerHpText').textContent = `${hero.hp} / ${hero.maxHp}`
  updatePlayerHpMeter(Math.max(0, Math.min(100, (100 * hero.hp) / (hero.maxHp || 100))), { instant: !inCombatNow })
  $('playPlayerHpFill')?.parentElement?.classList.toggle('is-def-buffed', hasHeroFullDefenseBuff())
  $('playPlayerManaText').textContent = `${hero.mana} / ${hero.maxMana}`
  updatePlayerManaMeter(Math.max(0, Math.min(100, (100 * hero.mana) / (hero.maxMana || 100))), { instant: !inCombatNow })
  $('playPlayerMeta').textContent = `ATK ${hero.attack} · DEF ${hero.defense}`
  const enemyStatusCard = $('playEnemyStatusCard')
  if (enemyStatusCard) {
    enemyStatusCard.hidden = !inCombatNow
  }
  if (inCombatNow && activeEnemy && activeEnemy.isMultiplayerPlayer) {
    const oppMana = activeEnemy.mana ?? 100
    $('playEnemyName').textContent = activeEnemy.name.toUpperCase()
    $('playEnemyHpText').textContent = `ROUND ${(typeof mpState !== 'undefined' ? mpState.round : 0) + 1}`
    $('playEnemyLabel').textContent = 'Challenger health'
    $('playEnemyHpValue').textContent = `${activeEnemy.hp} / ${activeEnemy.maxHp}`
    updateEnemyHpMeter(Math.max(0, Math.min(100, (100 * activeEnemy.hp) / (activeEnemy.maxHp || 100))), { instant: enemyChanged })
    $('playEnemyMeta').textContent = `${oppMana} MP · ATK ${activeEnemy.attack} · DEF ${activeEnemy.defense}`
  } else if (inCombatNow && activeEnemy) {
    $('playEnemyName').textContent = activeEnemy.name.toUpperCase()
    $('playEnemyHpText').textContent = `${activeEnemy.turns} TURNS`
    $('playEnemyLabel').textContent = 'Enemy health'
    $('playEnemyHpValue').textContent = `${activeEnemy.hp} / ${activeEnemy.maxHp}`
    updateEnemyHpMeter(Math.max(0, Math.min(100, (100 * activeEnemy.hp) / (activeEnemy.maxHp || 100))), { instant: enemyChanged })
    $('playEnemyMeta').textContent = `${activeEnemy.attack} ATK · ${isHeavy(activeEnemy) ? 'HEAVY NEXT' : 'NORMAL NEXT'}`
  } else {
    clearHudDeltaBadge('playEnemyHpDelta')
    $('playEnemyName').textContent = ''
    $('playEnemyHpText').textContent = ''
    $('playEnemyLabel').textContent = ''
    $('playEnemyHpValue').textContent = ''
    $('playEnemyMeta').textContent = ''
    updateEnemyHpMeter(0, { instant: true })
    lastEnemyHpPercent = null
  }
  $('dashboardAside').innerHTML = renderDashboardView(dashboardView, room, totalPigs, defeated, remaining)
  syncAnimationLoop()
  window.ByteboundTutorial?.onDashboardRendered?.(dashboardView, playViewActive, mode)
}

function renderDashboardView(view, room, totalPigs, defeated, remaining) {
  const progress = totalPigs ? Math.round((100 * defeated) / totalPigs) : 0
  if (view === 'practice' && typeof renderPracticeView === 'function') return renderPracticeView()
  if (view === 'tracker') return renderTopicTracker()
  if (view === 'rewards') return renderAchievements()
  if (view === 'leaderboards') return renderLeaderboard()
  if (view === 'settings') {
    const syncText = !activeAuthProvider || userSyncState === 'unconfigured'
      ? 'Saved in this browser'
      : userSyncState === 'syncing'
        ? 'Syncing account…'
        : userSyncState === 'error'
          ? 'Saved locally (sync pending)'
          : activeAuthProvider === 'local'
            ? `Local Server (${esc(activePlayerName || 'Player')})`
            : `Synced (${esc(activePlayerName || 'Player')})`
    return `<span class="eyebrow">Settings</span>
      <h2>Game &amp; Profile Settings</h2>
      <div class="settings-grid">
        <section class="settings-card tone-gold" aria-label="Appearance settings">
          <header class="settings-card-head">
            <span class="eyebrow">Display</span>
            <h3>Appearance</h3>
          </header>
          <div class="settings-content">
            <label class="theme-toggle theme-toggle-setting">
              <span>Dark mode</span>
              <input type="checkbox" role="switch" aria-label="Dark mode" data-theme-toggle ${currentTheme === 'dark' ? 'checked' : ''} />
              <span class="theme-switch-track" aria-hidden="true"></span>
            </label>
            <label class="setting-row">
              <span>Reduce animation &amp; motion</span>
              <input id="reduceMotionToggle" type="checkbox" ${reduceMotion ? 'checked' : ''} />
            </label>
          </div>
        </section>

        <section class="settings-card tone-blue" aria-label="Sound settings">
          <header class="settings-card-head">
            <span class="eyebrow">Audio</span>
            <h3>Sound &amp; Volume</h3>
          </header>
          <div class="settings-content">
            <label class="setting-row">
              <span>Sound effects &amp; music</span>
              <input id="soundToggle" type="checkbox" ${Sound.enabled ? 'checked' : ''} />
            </label>
            <div class="volume-control">
              <div class="volume-control-heading">
                <label for="musicVolumeSlider">Music volume</label>
                <output id="musicVolumeValue" for="musicVolumeSlider">${Math.round(Sound.musicVolume * 100)}%</output>
              </div>
              <input id="musicVolumeSlider" type="range" min="0" max="100" step="1" value="${Math.round(Sound.musicVolume * 100)}" />
            </div>
            <div class="volume-control">
              <div class="volume-control-heading">
                <label for="soundEffectVolumeSlider">Sound effects volume</label>
                <output id="soundEffectVolumeValue" for="soundEffectVolumeSlider">${Math.round(Sound.soundEffectVolume * 100)}%</output>
              </div>
              <input id="soundEffectVolumeSlider" type="range" min="0" max="100" step="1" value="${Math.round(Sound.soundEffectVolume * 100)}" />
            </div>
          </div>
        </section>

        <section class="settings-card tone-green" aria-label="Controls guide">
          <header class="settings-card-head">
            <span class="eyebrow">Keybinds</span>
            <h3>Controls</h3>
          </header>
          <div class="settings-content">
            <div class="settings-keybind-list">
              <div class="settings-keybind-row"><span>Move left / right</span><span class="settings-keys"><kbd>A</kbd><kbd>D</kbd></span></div>
              <div class="settings-keybind-row"><span>Jump</span><span class="settings-keys"><kbd>W</kbd><kbd>Space</kbd></span></div>
              <div class="settings-keybind-row"><span>Enter door</span><span class="settings-keys"><kbd>Up</kbd><kbd>W</kbd></span></div>
              <div class="settings-keybind-row"><span>Biome Map / Skill Tree</span><span class="settings-keys"><kbd>M</kbd><kbd>U</kbd></span></div>
              <div class="settings-keybind-row"><span>Battle cards &amp; answers</span><span class="settings-keys"><kbd>1–4</kbd></span></div>
              <div class="settings-keybind-row"><span>Continue / Menu</span><span class="settings-keys"><kbd>Enter</kbd><kbd>Esc</kbd></span></div>
            </div>
          </div>
        </section>

        <section class="settings-card tone-red" aria-label="Player profile settings">
          <header class="settings-card-head">
            <span class="eyebrow">Account</span>
            <h3>Player Profile</h3>
          </header>
          <div class="settings-content">
            <div class="settings-profile-box">
              <div class="settings-profile-row"><span>Active player</span><strong>${esc(activePlayerName || 'Knight')}</strong></div>
              <div class="settings-profile-row"><span>Identification</span><strong>Password-Protected Account</strong></div>
              <div class="settings-profile-row"><span>Sync status</span><strong>${syncText}</strong></div>
            </div>
            <div class="settings-actions-row">
              <button class="leaderboard-action settings-profile-switch" id="switchProfileButton" type="button">Switch Player</button>
              <button class="leaderboard-action settings-reset" id="resetProfileDataButton" type="button">Reset Progress</button>
            </div>
          </div>
        </section>

        <section class="settings-card tone-gold settings-tutorials-card" aria-label="Tutorials and guides">
          <header class="settings-card-head">
            <span class="eyebrow">Guides &amp; Tours</span>
            <h3>Replay Full Tutorials</h3>
          </header>
          <div class="settings-content">
            <p class="settings-tutorials-note">Replaying starts from Step 1, can be skipped anytime, and does not change stats, rewards, or achievement progress.</p>
            <div class="settings-actions-row settings-replay-grid">
              <button class="leaderboard-action settings-replay-tour" id="replayFullTourButton" type="button" data-tutorial-sequence="tour">Replay Full Page Tour</button>
              <button class="leaderboard-action settings-replay-game" id="replayFullGameGuideButton" type="button" data-tutorial-sequence="game">Replay Full In-Game Guide</button>
              <button class="leaderboard-action settings-replay-battle" id="replayBattleTutorialButton" type="button" data-tutorial-sequence="battle">Replay Battle Tutorial</button>
            </div>
          </div>
        </section>
      </div>`
  }
  return renderWorldBeacon()
}

function openResetConfirmModal() {
  if (!activePlayerName) return
  const modal = document.getElementById('resetConfirmOverlay')
  const copyEl = document.getElementById('resetConfirmCopy')
  if (!modal) {
    executeCurrentProfileReset()
    return
  }
  if (copyEl) {
    copyEl.innerHTML = `Reset ALL saved data for <strong>${esc(activePlayerName)}</strong>? This permanently clears your Topic Tracker, Skill Tree, Achievements, current run, AND removes your records from both the Arcade and 1v1 Competitive leaderboards.`
  }
  modal.hidden = false
  modal.setAttribute('aria-hidden', 'false')
  document.getElementById('cancelResetProfileButton')?.focus()
}

function closeResetConfirmModal() {
  const modal = document.getElementById('resetConfirmOverlay')
  if (!modal) return
  modal.hidden = true
  modal.setAttribute('aria-hidden', 'true')
}

async function executeCurrentProfileReset() {
  closeResetConfirmModal()
  if (!activePlayerName) return
  const profileId = activePlayerName.toLowerCase()
  const profileKey = encodeURIComponent(profileId)
  const keysToReset = [
    `kings-pigs-skill-tree-v1:${profileKey}`,
    `kings-pigs-topic-tracker-v1:${profileKey}`,
    `kings-pigs-review-v1:${profileKey}`,
    `${ACHIEVEMENT_STORAGE_KEY}:${profileKey}`,
    `${RUN_SAVES_STORAGE_KEY}:${profileKey}`,
    `bytebound-drill-done-v1:${profileKey}`,
    `bytebound-avatar:${profileId}`,
  ]
  activeRunSaveId = null
  activeRunName = ''
  activeRunRoleFocus = ''

  try {
    window.clearTimeout(userSyncTimer)
    userSyncTimer = 0
    window.clearTimeout(leaderboardSyncTimer)
    leaderboardSyncTimer = 0
    for (const key of keysToReset) localStorage.removeItem(key)

    // Remove this player's 1v1 Competitive leaderboard record & submission history locally
    try {
      const pvpMap = readLocalPvpLeaderboardMap()
      if (pvpMap[profileId]) {
        delete pvpMap[profileId]
        localStorage.setItem(PVP_LEADERBOARD_STORAGE_KEY, JSON.stringify(pvpMap))
      }
      const seenRaw = localStorage.getItem(PVP_SUBMITTED_IDS_KEY)
      if (seenRaw) {
        const seen = JSON.parse(seenRaw)
        if (Array.isArray(seen)) {
          localStorage.setItem(
            PVP_SUBMITTED_IDS_KEY,
            JSON.stringify(seen.filter((id) => !String(id).endsWith(`:${profileId}`)))
          )
        }
      }
    } catch {}

    // Stamp reset watermark (covering clock skew with remote DB; cleared as soon as player submits a new run/match)
    try {
      let maxTs = Date.now() + 30000
      for (const e of leaderboardEntries) {
        if (String(e?.player_name || '').trim().toLowerCase() === profileId) {
          maxTs = Math.max(maxTs, Date.parse(e.submitted_at || 0) || 0)
        }
      }
      for (const e of pvpLeaderboardEntries) {
        if (String(e?.player_name || '').trim().toLowerCase() === profileId) {
          maxTs = Math.max(maxTs, Date.parse(e.updated_at || 0) || 0)
        }
      }
      localStorage.setItem(`bytebound-reset-at-v1:${profileKey}`, String(maxTs))
    } catch {}
    leaderboardEntries = leaderboardEntries.filter(
      (entry) => String(entry?.player_name || '').trim().toLowerCase() !== profileId
    )
    pvpLeaderboardEntries = pvpLeaderboardEntries.filter(
      (entry) => String(entry?.player_name || '').trim().toLowerCase() !== profileId
    )

    if (window.mpUI?.network?.localServerAvailable) {
      try {
        await fetch('/api/mp/pvp-reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerName: activePlayerName }),
        })
      } catch {}
    }

    activeSkillSpecialization = null
    exclusiveSkillTree = null
    window.ByteboundTutorial?.resetPlayerTutorials?.(profileId)
    selectSkillProfile(profileId)
    selectAchievementProfile(profileId)
    skillTreeStarted = false
    selectedSkillNode = null
    skillMapPan = null
    resetRun()
    leaderboardRunId = createLeaderboardRunId()
    leaderboardRunSubmitted = false
    leaderboardLastSubmittedSnapshot = ''
    leaderboardState = supabaseCredentials() ? 'idle' : 'unconfigured'
    leaderboardError = ''
    pvpLeaderboardState = 'idle'
    pvpLeaderboardError = ''
    mode = 'menu'
    playViewActive = false
    practiceRunActive = false
    practiceReturnState = null
    await resetUserProfileInSupabase(activePlayerName)
    renderDashboard()
    renderHud()
  } catch (error) {
    console.error('Unable to reset this player profile.', error)
  }
}

function resetCurrentProfileData() {
  openResetConfirmModal()
}

function getTopicBankCounts() {
  const counts = {}
  for (const [levelName, list] of Object.entries(QUESTION_BANK)) {
    for (const q of list) {
      counts[q.category] ||= { total: 0, easy: 0, medium: 0, hard: 0, topics: {} }
      counts[q.category].total++
      counts[q.category][levelName] = (counts[q.category][levelName] || 0) + 1
      counts[q.category].topics[q.topic] ||= { total: 0, easy: 0, medium: 0, hard: 0 }
      counts[q.category].topics[q.topic].total++
      counts[q.category].topics[q.topic][levelName] = (counts[q.category].topics[q.topic][levelName] || 0) + 1
    }
  }
  return counts
}

function buildCapabilityRadarSvg(disciplineMetrics) {
  const width = 380
  const height = 286
  const cx = width / 2
  const cy = height / 2
  const maxR = 72
  // 4 axes: Top (0), Right (1), Bottom (2), Left (3)
  const angles = [-Math.PI / 2, 0, Math.PI / 2, Math.PI]
  const shortLabels = ['COMP SYS', 'NET & SEC', 'PROGRAMMING', 'DATABASE']

  const pointAt = (axisIndex, ratio) => {
    const r = Math.max(0.08, Math.min(1, ratio)) * maxR
    const a = angles[axisIndex]
    return `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`
  }

  const rings = [0.25, 0.5, 0.75, 1].map((step) => {
    const pts = [0, 1, 2, 3].map((idx) => pointAt(idx, step)).join(' ')
    return `<polygon class="cap-radar-grid" points="${pts}" />`
  }).join('')

  const axes = [0, 1, 2, 3].map((idx) => {
    const end = pointAt(idx, 1)
    const [ex, ey] = end.split(',')
    return `<line class="cap-radar-axis" x1="${cx}" y1="${cy}" x2="${ex}" y2="${ey}" />`
  }).join('')

  const currentPoints = [0, 1, 2, 3].map((idx) => {
    const metric = disciplineMetrics[idx]
    const ratio = metric ? (metric.accuracyPct / 100) : 0.08
    return pointAt(idx, ratio)
  }).join(' ')

  const dots = [0, 1, 2, 3].map((idx) => {
    const metric = disciplineMetrics[idx]
    const ratio = metric ? (metric.accuracyPct / 100) : 0.08
    const [px, py] = pointAt(idx, ratio).split(',')
    return `<rect class="cap-radar-vertex" x="${(Number(px) - 4).toFixed(1)}" y="${(Number(py) - 4).toFixed(1)}" width="8" height="8" />`
  }).join('')

  const labelCoords = [
    { x: cx, y: 26, anchor: 'middle' },
    { x: cx + maxR + 14, y: cy - 4, anchor: 'start' },
    { x: cx, y: height - 28, anchor: 'middle' },
    { x: cx - maxR - 14, y: cy - 4, anchor: 'end' },
  ]
  const labels = [0, 1, 2, 3].map((idx) => {
    const metric = disciplineMetrics[idx]
    const coord = labelCoords[idx]
    const score = metric ? `${metric.accuracyPct}%` : '0%'
    return `<text class="cap-radar-label" x="${coord.x}" y="${coord.y}" text-anchor="${coord.anchor}"><tspan x="${coord.x}" dy="0">${esc(shortLabels[idx])}</tspan><tspan class="cap-radar-score" x="${coord.x}" dy="16">${score}</tspan></text>`
  }).join('')

  return `<svg class="cap-radar-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Four-discipline capability radar chart">
    ${rings}
    ${axes}
    <polygon class="cap-radar-area" points="${currentPoints}" />
    ${dots}
    ${labels}
  </svg>`
}

function formatBaselineComparison(correct, attempted, baselineCorrect, baselineAttempted) {
  const currPct = attempted ? Math.round((100 * correct) / attempted) : 0
  if (!baselineAttempted) {
    return {
      hasBaseline: false,
      hasPost: false,
      basePct: null,
      currPct,
      postPct: null,
      postCorrect: 0,
      postAttempted: 0,
      delta: null,
      deltaLabel: '',
      deltaTone: 'flat',
    }
  }
  const basePct = Math.round((100 * baselineCorrect) / baselineAttempted)
  const postCorrect = Math.max(0, correct - baselineCorrect)
  const postAttempted = Math.max(0, attempted - baselineAttempted)
  const hasPost = postAttempted > 0
  const postPct = hasPost ? Math.round((100 * postCorrect) / postAttempted) : currPct
  const comparePct = hasPost ? postPct : currPct
  const delta = comparePct - basePct
  const deltaLabel = delta > 0 ? `+${delta}%` : delta < 0 ? `${delta}%` : '0%'
  const deltaTone = delta > 0 ? 'gain' : delta < 0 ? 'drop' : 'flat'
  return {
    hasBaseline: true,
    hasPost,
    basePct,
    currPct,
    postPct,
    postCorrect,
    postAttempted,
    delta,
    deltaLabel,
    deltaTone,
  }
}

function csvEscapeCell(value) {
  const s = String(value ?? '')
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function buildTopicTrackerCsv() {
  const headers = [
    'Player',
    'Discipline',
    'Topic',
    'Adaptive Tier',
    'Mastery State',
    'Baseline Correct',
    'Baseline Attempted',
    'Baseline %',
    'Post-Baseline Correct',
    'Post-Baseline Attempted',
    'Post-Baseline %',
    'Total Correct',
    'Total Attempted',
    'Overall %',
    'Delta vs Baseline %',
  ]
  const rows = [headers.map(csvEscapeCell).join(',')]
  const playerLabel = activePlayerName || 'Player'
  let sumBaseC = 0
  let sumBaseA = 0
  let sumTotC = 0
  let sumTotA = 0

  for (const [category, topics] of Object.entries(topicProgress)) {
    const tier = adaptive.categoryDifficultyName(category).toUpperCase()
    for (const [topicName, r] of Object.entries(topics)) {
      const cVal = r?.correct || 0
      const aVal = r?.attempted || 0
      const bC = r?.baselineCorrect || 0
      const bA = r?.baselineAttempted || 0
      sumBaseC += bC
      sumBaseA += bA
      sumTotC += cVal
      sumTotA += aVal
      const diag = formatBaselineComparison(cVal, aVal, bC, bA)
      const cap = getTopicCapabilityMeta(r)
      rows.push([
        playerLabel,
        category,
        topicName,
        tier,
        cap.label,
        bC,
        bA,
        diag.hasBaseline ? diag.basePct : '',
        diag.postCorrect,
        diag.postAttempted,
        diag.hasPost ? diag.postPct : '',
        cVal,
        aVal,
        aVal ? diag.currPct : '',
        diag.hasBaseline ? diag.delta : '',
      ].map(csvEscapeCell).join(','))
    }
  }
  const sumDiag = formatBaselineComparison(sumTotC, sumTotA, sumBaseC, sumBaseA)
  rows.push([
    playerLabel,
    'ALL DISCIPLINES',
    'OVERALL SUMMARY',
    adaptive.name.toUpperCase(),
    '',
    sumBaseC,
    sumBaseA,
    sumDiag.hasBaseline ? sumDiag.basePct : '',
    sumDiag.postCorrect,
    sumDiag.postAttempted,
    sumDiag.hasPost ? sumDiag.postPct : '',
    sumTotC,
    sumTotA,
    sumTotA ? sumDiag.currPct : '',
    sumDiag.hasBaseline ? sumDiag.delta : '',
  ].map(csvEscapeCell).join(','))

  return rows.join('\n')
}

function exportTopicTrackerCsv() {
  const csv = buildTopicTrackerCsv()
  window.__lastExportedTrackerCsv = csv
  const slug = String(activePlayerName || 'knight').toLowerCase().replace(/[^a-z0-9_-]+/g, '_') || 'knight'
  const filename = `bytebound-learning-report-${slug}.csv`
  try {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (error) {
    console.warn('Unable to trigger CSV download.', error)
  }
}

function renderTopicTracker() {
  const categories = Object.entries(topicProgress).map(([category, topics]) => ({
    category,
    topics: Object.entries(topics),
  }))

  const totals = categories.reduce((summary, group) => {
    for (const [, result] of group.topics) {
      summary.correct += result.correct || 0
      summary.attempted += result.attempted || 0
      summary.baselineCorrect += result.baselineCorrect || 0
      summary.baselineAttempted += result.baselineAttempted || 0
      summary.totalTopics += 1
      const state = getTopicMasteryState(result)
      if (state === 'mastered') summary.masteredTopics += 1
      if (result.baselineAttempted > 0 && result.attempted > result.baselineAttempted) {
        const b = Math.round((100 * result.baselineCorrect) / result.baselineAttempted)
        const c = Math.round((100 * result.correct) / result.attempted)
        if (c > b) summary.improvedTopics += 1
      }
    }
    return summary
  }, {
    correct: 0,
    attempted: 0,
    baselineCorrect: 0,
    baselineAttempted: 0,
    totalTopics: 0,
    masteredTopics: 0,
    improvedTopics: 0,
  })

  const overallAccuracy = totals.attempted ? Math.round((100 * totals.correct) / totals.attempted) : 0
  const overallDiag = formatBaselineComparison(
    totals.correct,
    totals.attempted,
    totals.baselineCorrect,
    totals.baselineAttempted
  )
  const totalKills = Math.max(stats.kills || 0, achievementProgress.kills || 0)

  const disciplineColors = {
    'Computer Systems': 'gold',
    'Networking & Security': 'blue',
    Programming: 'green',
    Database: 'red',
  }

  const disciplineMetrics = categories.map(({ category, topics }) => {
    const agg = topics.reduce((acc, [, result]) => {
      acc.correct += result.correct || 0
      acc.attempted += result.attempted || 0
      acc.baselineCorrect += result.baselineCorrect || 0
      acc.baselineAttempted += result.baselineAttempted || 0
      const state = getTopicMasteryState(result)
      if (state === 'mastered') acc.mastered += 1
      return acc
    }, { correct: 0, attempted: 0, baselineCorrect: 0, baselineAttempted: 0, mastered: 0 })

    const accuracyPct = agg.attempted ? Math.round((100 * agg.correct) / agg.attempted) : 0
    const diag = formatBaselineComparison(agg.correct, agg.attempted, agg.baselineCorrect, agg.baselineAttempted)
    const adaptiveTier = adaptive.categoryDifficultyName(category).toUpperCase()

    return {
      category,
      topics,
      ...agg,
      accuracyPct,
      diag,
      adaptiveTier,
      color: disciplineColors[category] || 'gold',
    }
  })

  const disciplineCardsHtml = disciplineMetrics.map((d) => {
    const baseTxt = d.diag.hasBaseline
      ? `Baseline ${d.diag.basePct}% → ${d.accuracyPct}% (${d.diag.deltaLabel})`
      : `${d.correct} / ${d.attempted} correct`
    return `<article class="cap-discipline-card tone-${esc(d.color)}">
      <div class="cap-discipline-top">
        <div>
          <span class="cap-discipline-name">${esc(d.category)}</span>
          <small class="cap-discipline-sub">${d.mastered} / ${d.topics.length} mastered · ${esc(baseTxt)}</small>
        </div>
        <span class="cap-tier-pill tier-${esc(d.adaptiveTier.toLowerCase())}">${esc(d.adaptiveTier)}</span>
      </div>
      <div class="cap-meter-row">
        <div class="cap-score-bar" role="progressbar" aria-label="${esc(`${d.category} accuracy`)}" aria-valuenow="${d.accuracyPct}" aria-valuemin="0" aria-valuemax="100">
          <i style="width:${d.accuracyPct}%"></i>
        </div>
        <strong class="cap-score-val">${d.accuracyPct}%</strong>
      </div>
    </article>`
  }).join('')

  const categoryCards = disciplineMetrics.map((d) => {
    const topicRows = d.topics.map(([topic, result]) => {
      const percent = result.attempted
        ? Math.round((100 * result.correct) / result.attempted)
        : 0
      const capMeta = getTopicCapabilityMeta(result)
      const tDiag = formatBaselineComparison(
        result.correct || 0,
        result.attempted || 0,
        result.baselineCorrect || 0,
        result.baselineAttempted || 0
      )
      const diagBadge = tDiag.hasBaseline
        ? (tDiag.hasPost
          ? `<span class="tracker-topic-baseline is-${esc(tDiag.deltaTone)}" title="Diagnostic baseline (first 3 answers) vs. post-baseline accuracy">Base ${tDiag.basePct}% → Post ${tDiag.postPct}% (${esc(tDiag.deltaLabel)})</span>`
          : `<span class="tracker-topic-baseline is-flat" title="Collecting initial diagnostic baseline (first 3 answers)">Baseline ${tDiag.basePct}% (${result.baselineAttempted}/3)</span>`)
        : `<span class="tracker-topic-baseline is-pending">No baseline yet</span>`
      return `<div class="tracker-topic state-${esc(capMeta.tone)}">
        <div class="tracker-topic-title">
          <span class="tracker-topic-name">${esc(topic)}</span>
          <span class="tracker-cap-badge badge-${esc(capMeta.tone)}">${esc(capMeta.label)}</span>
          ${diagBadge}
        </div>
        <div class="tracker-bar state-${esc(capMeta.tone)}" role="progressbar" aria-label="${esc(`${topic} accuracy`)}" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"><i style="width:${percent}%"></i></div>
        <span class="tracker-topic-count">${result.correct} / ${result.attempted} correct</span>
        <strong class="tracker-topic-percent">${percent}%</strong>
      </div>`
    }).join('')
    return `<details class="tracker-category" open>
      <summary class="tracker-category-header">
        <div class="tracker-cat-heading">
          <h3>${esc(d.category)}</h3>
          <span class="cap-tier-pill tier-${esc(d.adaptiveTier.toLowerCase())}">${esc(d.adaptiveTier)}</span>
        </div>
        <span>${d.mastered}/${d.topics.length} mastered · ${d.diag.hasBaseline ? `Base ${d.diag.basePct}% → ${d.accuracyPct}% (${d.diag.deltaLabel})` : `${d.correct}/${d.attempted} (${d.accuracyPct}%)`}</span>
      </summary>
      ${topicRows}
    </details>`
  }).join('')

  const overallGainBadge = overallDiag.hasBaseline
    ? `<span class="tracker-delta is-${esc(overallDiag.deltaTone)}">${esc(overallDiag.deltaLabel)} vs baseline</span>`
    : ''
  const diagStripHtml = overallDiag.hasBaseline
    ? `<section class="tracker-diagnostic-strip" aria-label="Diagnostic baseline comparison">
        <div>
          <span class="eyebrow">Diagnostic Pre / Post Comparison</span>
          <strong>${overallDiag.hasPost
            ? `Baseline ${overallDiag.basePct}% (${totals.baselineCorrect}/${totals.baselineAttempted}) → Post-Baseline ${overallDiag.postPct}% (${overallDiag.postCorrect}/${overallDiag.postAttempted}) · Gain ${esc(overallDiag.deltaLabel)}`
            : `Diagnostic Baseline ${overallDiag.basePct}% (${totals.baselineCorrect}/${totals.baselineAttempted}) · Current ${overallAccuracy}%`}</strong>
          <small>First 3 attempts per topic capture initial baseline accuracy; post-baseline measures subsequent accuracy (${totals.improvedTopics} topic${totals.improvedTopics === 1 ? '' : 's'} above baseline).</small>
        </div>
        <div class="tracker-diagnostic-actions">
          <button type="button" class="leaderboard-action" data-export-tracker="csv">Export CSV</button>
          <button type="button" class="leaderboard-action" data-open-practice="1">Drill Topics</button>
        </div>
      </section>`
    : `<section class="tracker-diagnostic-strip" aria-label="Diagnostic baseline comparison">
        <div>
          <span class="eyebrow">Diagnostic Pre / Post Comparison</span>
          <strong>Awaiting Diagnostic Baseline (0 / 3 per topic)</strong>
          <small>Answer your first 3 questions in any topic during battle or Topic Drill to establish your Baseline vs. Current Accuracy comparison.</small>
        </div>
        <div class="tracker-diagnostic-actions">
          <button type="button" class="leaderboard-action" data-export-tracker="csv">Export CSV</button>
          <button type="button" class="leaderboard-action" data-open-practice="1">Start Topic Drill</button>
        </div>
      </section>`

  return `<span class="eyebrow">Learning Tracker</span>
    <h2>Your Topic Progress</h2>
    <p class="achievement-summary">Track your baseline diagnostic vs. current accuracy across all four disciplines.</p>
    <div class="tracker-summary" aria-label="Overall quiz results">
      <article class="tracker-stat">
        <span>Current Accuracy</span>
        <strong>${overallAccuracy}% ${overallGainBadge}</strong>
        <small>${overallDiag.hasBaseline ? `Baseline ${overallDiag.basePct}% · ${totals.correct}/${totals.attempted} correct` : `${totals.correct} of ${totals.attempted} correct answers`}</small>
      </article>
      <article class="tracker-stat">
        <span>Topics Mastered</span>
        <strong>${totals.masteredTopics} / ${totals.totalTopics}</strong>
        <small>80%+ accuracy with 4+ answers</small>
      </article>
      <article class="tracker-stat">
        <span>Viruses Defeated</span>
        <strong>${totalKills}</strong>
        <small>Across your adventures</small>
      </article>
    </div>

    ${diagStripHtml}

    <section class="cap-overview-grid" aria-label="Discipline capability overview">
      <div class="cap-radar-box">
        <div class="cap-panel-head">
          <span class="eyebrow">Discipline radar</span>
          <h3>Capability Shape</h3>
        </div>
        ${buildCapabilityRadarSvg(disciplineMetrics)}
      </div>
      <div class="cap-discipline-grid tracker-disciplines-overview" aria-label="Discipline overview">
        ${disciplineCardsHtml}
      </div>
    </section>

    <header class="tracker-heading">
      <h2>Topics by Discipline</h2>
    </header>
    <div class="tracker-categories">${categoryCards}</div>`
}

// One entry point for every Play / Resume button.
let navMenuOpen = false
const UI_HOVER_BUBBLE_EL = document.getElementById('uiHoverBubble')
let activeBubbleTarget = null

function hideUiHoverBubble() {
  activeBubbleTarget = null
  if (!UI_HOVER_BUBBLE_EL) return
  UI_HOVER_BUBBLE_EL.classList.remove('is-visible')
  UI_HOVER_BUBBLE_EL.setAttribute('aria-hidden', 'true')
}

function showUiHoverBubble(targetEl) {
  if (!UI_HOVER_BUBBLE_EL || !targetEl) return
  const desc = targetEl.dataset?.bubbleDesc
  if (!desc) return
  if (app.hidden || skillTreeOpen || worldMapOpen || window.mpUI?.isOpen) {
    hideUiHoverBubble()
    return
  }
  if (window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches) {
    hideUiHoverBubble()
    return
  }
  if (document.body.classList.contains('is-tutorial-active')) {
    hideUiHoverBubble()
    return
  }
  const isSidebarBtn = Boolean(targetEl.closest('#mainSidebar'))
  if (isSidebarBtn && !navMenuOpen) {
    hideUiHoverBubble()
    return
  }
  const rect = targetEl.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) {
    hideUiHoverBubble()
    return
  }

  activeBubbleTarget = targetEl
  const tagEl = document.getElementById('uiHoverBubbleTag')
  const titleEl = document.getElementById('uiHoverBubbleTitle')
  const descEl = document.getElementById('uiHoverBubbleDesc')
  if (tagEl) tagEl.textContent = targetEl.dataset.bubbleTag || 'INFO'
  if (titleEl) titleEl.textContent = targetEl.dataset.bubbleTitle || targetEl.textContent.trim()
  if (descEl) descEl.textContent = desc

  UI_HOVER_BUBBLE_EL.dataset.placement = 'bottom'
  UI_HOVER_BUBBLE_EL.style.left = '0px'
  UI_HOVER_BUBBLE_EL.style.top = '0px'
  UI_HOVER_BUBBLE_EL.setAttribute('aria-hidden', 'false')

  const vw = window.innerWidth
  const vh = window.innerHeight
  const bw = UI_HOVER_BUBBLE_EL.offsetWidth || 260
  const bh = UI_HOVER_BUBBLE_EL.offsetHeight || 96
  const gap = 12
  let placement = 'bottom'
  let left = rect.left + rect.width / 2 - bw / 2
  let top = rect.bottom + gap

  if (isSidebarBtn && rect.right + gap + bw <= vw - 10) {
    placement = 'right'
    left = rect.right + gap
    top = rect.top + rect.height / 2 - bh / 2
  } else if (top + bh > vh - 12 && rect.top - gap - bh >= 10) {
    placement = 'top'
    top = rect.top - gap - bh
  }

  left = Math.max(10, Math.min(vw - bw - 10, left))
  top = Math.max(10, Math.min(vh - bh - 10, top))

  const anchorCenterX = rect.left + rect.width / 2
  const anchorCenterY = rect.top + rect.height / 2
  const notchX = Math.max(18, Math.min(bw - 18, anchorCenterX - left))
  const notchY = Math.max(18, Math.min(bh - 18, anchorCenterY - top))
  UI_HOVER_BUBBLE_EL.style.setProperty('--bubble-notch-x', `${Math.round(notchX)}px`)
  UI_HOVER_BUBBLE_EL.style.setProperty('--bubble-notch-y', `${Math.round(notchY)}px`)
  UI_HOVER_BUBBLE_EL.dataset.placement = placement
  UI_HOVER_BUBBLE_EL.style.left = `${Math.round(left)}px`
  UI_HOVER_BUBBLE_EL.style.top = `${Math.round(top)}px`
  UI_HOVER_BUBBLE_EL.classList.add('is-visible')
}

function setNavMenuOpen(open) {
  navMenuOpen = Boolean(open)
  if (!navMenuOpen) hideUiHoverBubble()
  const appEl = document.getElementById('app')
  const toggleBtn = document.getElementById('navToggleButton')
  const sidebarEl = document.getElementById('mainSidebar')
  if (appEl) appEl.classList.toggle('is-nav-open', navMenuOpen)
  if (toggleBtn) toggleBtn.setAttribute('aria-expanded', String(navMenuOpen))
  if (sidebarEl) {
    sidebarEl.setAttribute('aria-hidden', String(!navMenuOpen))
    if ('inert' in sidebarEl) sidebarEl.inert = !navMenuOpen
    if (!navMenuOpen && sidebarEl.contains(document.activeElement) && !document.body.classList.contains('is-tutorial-active')) {
      toggleBtn?.focus?.({ preventScroll: true })
    }
  }
  window.ByteboundTutorial?.onSidebarState?.(navMenuOpen)
}
setNavMenuOpen(false)
function toggleNavMenu() {
  setNavMenuOpen(!navMenuOpen)
}

function enterPlay() {
  setNavMenuOpen(false)
  if (!practiceRunActive && activeRunSaveId) {
    saveCurrentRunSlot()
  }
  openRunSavesModal()
}

window.mpUI = (typeof MultiplayerUI === 'function' && document.getElementById('multiplayerOverlay'))
  ? new MultiplayerUI(document.getElementById('multiplayerOverlay'), {
      onBackToMenu: () => {
        syncAnimationLoop()
        renderDashboard()
      },
      onLaunchMatch: (matchConfig, role, clientId) => {
        if (typeof startMultiplayerMatch === 'function') {
          startMultiplayerMatch(matchConfig, role, clientId)
        }
        showPlayView()
      },
    })
  : null

if (window.mpUI?.matchmaking) {
  window.mpUI.matchmaking.onMatchMove((payload) => {
    if (typeof mpReceiveRemoteMove === 'function') mpReceiveRemoteMove(payload)
  })
  window.mpUI.matchmaking.onMatchForfeit((payload) => {
    if (typeof mpHandleForfeit === 'function') mpHandleForfeit(payload)
  })
}

document.getElementById('startGameButton').addEventListener('click', enterPlay)
const multiplayerMenuBtn = document.getElementById('multiplayerMenuButton')
if (multiplayerMenuBtn) {
  multiplayerMenuBtn.addEventListener('click', () => {
    setNavMenuOpen(false)
    window.mpUI?.open('browser')
    syncAnimationLoop()
  })
}
const exitGameBtn = document.getElementById('exitGameButton')
if (exitGameBtn) {
  exitGameBtn.addEventListener('click', () => {
    hideUiHoverBubble()
    setNavMenuOpen(false)
    switchPlayerProfile()
  })
}
document.getElementById('practiceModeButton').addEventListener('click', startPracticeAdventure)
document.getElementById('exitPlayButton').addEventListener('click', () => showDashboard())
const spHudBadgeEl = document.getElementById('skillPointHudBadge')
if (spHudBadgeEl) spHudBadgeEl.addEventListener('click', () => openSkillTree())
const worldMapHudBtnEl = document.getElementById('worldMapHudButton')
if (worldMapHudBtnEl) worldMapHudBtnEl.addEventListener('click', () => openWorldMap())
const spEarnedBannerEl = document.getElementById('spEarnedBanner')
if (spEarnedBannerEl) spEarnedBannerEl.addEventListener('click', () => {
  spEarnedBannerEl.hidden = true
  openSkillTree()
})
document.getElementById('dashboardAside').addEventListener('click', (event) => {
  if (typeof handlePracticeClick === 'function' && handlePracticeClick(event)) return
  if (event.target.closest('[data-export-tracker]')) {
    exportTopicTrackerCsv()
    return
  }
  if (event.target.closest('[data-open-practice]')) {
    playViewActive = false
    dashboardView = 'practice'
    if (typeof practice !== 'undefined') practice.mode = 'menu'
    renderDashboard()
    return
  }
  const focusBtn = event.target.closest('[data-adaptive-focus]')
  if (focusBtn) {
    const val = focusBtn.dataset.adaptiveFocus
    adaptive.setFocusCategory(val === 'all' ? null : val)
    renderHud()
    return
  }
  if (event.target.closest('#switchProfileButton')) {
    switchPlayerProfile()
  } else if (event.target.closest('#syncProfileNowButton')) {
    syncUserOnLogin(activePlayerName, activePlayerName.toLowerCase())
  } else if (event.target.closest('[data-leaderboard-tab]')) {
    const nextTab = event.target.closest('[data-leaderboard-tab]').dataset.leaderboardTab
    leaderboardTab = nextTab === 'pvp' ? 'pvp' : 'arcade'
    if (leaderboardTab === 'pvp') loadPvpLeaderboard()
    else loadLeaderboard()
  } else if (event.target.closest('[data-leaderboard-refresh]')) {
    if (leaderboardTab === 'pvp') loadPvpLeaderboard()
    else loadLeaderboard()
  } else if (event.target.closest('#resetProfileDataButton')) {
    resetCurrentProfileData()
  } else if (event.target.closest('#replayFullTourButton')) {
    window.ByteboundTutorial?.replayFullPageTour?.()
  } else if (event.target.closest('#replayFullGameGuideButton')) {
    window.ByteboundTutorial?.replayFullGameGuide?.()
  } else if (event.target.closest('#replayBattleTutorialButton')) {
    window.ByteboundTutorial?.replayBattleTutorial?.()
  }
})

// Real browser full screen (the play view already fills the window).
const fullscreenButton = document.getElementById('fullscreenButton')
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen()
  else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {})
}
if (!document.documentElement.requestFullscreen) fullscreenButton.hidden = true
fullscreenButton.addEventListener('click', toggleFullscreen)
document.addEventListener('fullscreenchange', () => {
  fullscreenButton.textContent = document.fullscreenElement ? 'Exit full' : 'Fullscreen'
})
const navToggleButton = document.getElementById('navToggleButton')
if (navToggleButton) {
  navToggleButton.addEventListener('click', (event) => {
    event.stopPropagation()
    toggleNavMenu()
  })
}
const navBackdropEl = document.getElementById('navBackdrop')
if (navBackdropEl) {
  navBackdropEl.addEventListener('click', () => {
    setNavMenuOpen(false)
  })
}

document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', () => {
    setNavMenuOpen(false)
    if (button.dataset.view === 'multiplayer') {
      window.mpUI?.open('browser')
      syncAnimationLoop()
      return
    }
    if (button.dataset.view === 'skilltree') {
      openSkillTree()
      return
    }
    if (!playViewActive && button.dataset.view === dashboardView) return
    if (skillTreeOpen) closeSkillTree()
    if (worldMapOpen) closeWorldMap()
    if (typeof multiplayerMatchActive !== 'undefined' && multiplayerMatchActive) {
      showDashboard(button.dataset.view)
      return
    }
    if (practiceRunActive) {
      restorePracticeReturnState()
    } else if (playViewActive) {
      if (!multiplayerMatchActive && activeRunSaveId) {
        saveCurrentRunSlot()
      }
      submitLeaderboardRun({ skipReload: true })
      pushUserProfileToSupabase()
      resetDeadRunToMenu()
    }
    playViewActive = false
    dashboardView = button.dataset.view
    renderDashboard()
    const mainEl = document.querySelector('#app main')
    if (mainEl) mainEl.scrollTop = 0
    if (typeof window.scrollTo === 'function') window.scrollTo(0, 0)
    const tabContent = document.getElementById('dashboardAside')
    tabContent.classList.remove('is-tab-entering')
    void tabContent.offsetWidth
    tabContent.classList.add('is-tab-entering')
    if (dashboardView === 'leaderboards') {
      if (leaderboardTab === 'pvp') loadPvpLeaderboard()
      else loadLeaderboard()
    }
  })
})
const flushRunSaveOnExit = () => {
  saveCurrentRunSlot()
  if (!practiceRunActive && hasRecordableGameplayRun()) {
    submitLeaderboardRun({ skipReload: true })
  }
}
window.addEventListener('pagehide', flushRunSaveOnExit)
window.addEventListener('beforeunload', () => {
  saveCurrentRunSlot()
})
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    saveCurrentRunSlot()
  }
})
document.getElementById('closeRunSavesButton')?.addEventListener('click', closeRunSavesModal)
document.getElementById('createNewRunButton')?.addEventListener('click', () => createAndStartNewRun())
document.getElementById('newRunNameInput')?.addEventListener('input', () => validateNewRunName({ showEmptyError: false }))
document.getElementById('newRunNameInput')?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault()
    createAndStartNewRun()
  }
})
document.getElementById('runSavesList')?.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-run-act]')
  if (!btn) return
  const { runAct, runId } = btn.dataset
  if (runAct === 'continue') continueSavedRun(runId)
  else if (runAct === 'delete') deleteSavedRun(runId)
})
document.getElementById('runSavesOverlay')?.addEventListener('click', (event) => {
  if (event.target.id === 'runSavesOverlay') closeRunSavesModal()
})
document.getElementById('cancelResetProfileButton')?.addEventListener('click', closeResetConfirmModal)
document.getElementById('confirmResetProfileButton')?.addEventListener('click', () => executeCurrentProfileReset())
document.getElementById('resetConfirmOverlay')?.addEventListener('click', (event) => {
  if (event.target.id === 'resetConfirmOverlay') closeResetConfirmModal()
})
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return
  if (typeof window.ByteboundTutorial?.interceptEscape === 'function') {
    if (window.ByteboundTutorial.interceptEscape(event)) return
  }
  const runModal = document.getElementById('runSavesOverlay')
  if (runModal && !runModal.hidden) {
    closeRunSavesModal()
    return
  }
  const resetModal = document.getElementById('resetConfirmOverlay')
  if (resetModal && !resetModal.hidden) {
    closeResetConfirmModal()
    return
  }
  if (window.mpUI?.isOpen) {
    window.mpUI.closeAndReturnToMenu()
    syncAnimationLoop()
    return
  }
  if (navMenuOpen) setNavMenuOpen(false)
  else if (worldMapOpen) closeWorldMap()
  else if (skillTreeOpen) closeSkillTree()
  else if (playViewActive) showDashboard()
})
document.addEventListener('change', (event) => {
  if (!(event.target instanceof HTMLInputElement) || !event.target.matches('[data-theme-toggle]')) return
  setTheme(event.target.checked ? 'dark' : 'light')
})
document.getElementById('dashboardAside').addEventListener('change', (event) => {
  if (event.target.id === 'soundToggle') {
    Sound.setEnabled(event.target.checked)
    resumeMusic()
  } else if (event.target.id === 'reduceMotionToggle') {
    reduceMotion = event.target.checked
    document.body.classList.toggle('reduce-motion', reduceMotion)
    try {
      localStorage.setItem(REDUCE_MOTION_STORAGE_KEY, String(reduceMotion))
    } catch (error) {
      console.error('Unable to save the reduced-motion preference.', error)
      window.alert('Your motion setting could not be saved in browser storage.')
    }
  }
})

document.getElementById('dashboardAside').addEventListener('input', (event) => {
  if (!(event.target instanceof HTMLInputElement)) return
  const volume = Number(event.target.value) / 100
  let output
  if (event.target.id === 'musicVolumeSlider') {
    Sound.setMusicVolume(volume)
    output = document.getElementById('musicVolumeValue')
  } else if (event.target.id === 'soundEffectVolumeSlider') {
    Sound.setSoundEffectVolume(volume)
    output = document.getElementById('soundEffectVolumeValue')
  } else {
    return
  }
  output.value = `${Math.round(volume * 100)}%`
  output.textContent = output.value
})

const SOUNDABLE_CONTROL_SELECTOR = 'button:not(:disabled):not([aria-disabled="true"]), a[href]:not([aria-disabled="true"]), [role="button"]:not([aria-disabled="true"]), summary, select, label.setting-row, label.theme-toggle-setting, #loginScreen .theme-toggle, #loginScreen .login-form input, #loginScreen .login-form label'
let lastHoverSoundAt = 0
function soundableControl(target) {
  return target instanceof Element ? target.closest(SOUNDABLE_CONTROL_SELECTOR) : null
}

document.addEventListener('pointerover', (event) => {
  if (event.pointerType === 'touch') return
  const bubbleTarget = event.target instanceof Element ? event.target.closest('[data-bubble-desc]') : null
  if (bubbleTarget && bubbleTarget !== activeBubbleTarget) {
    showUiHoverBubble(bubbleTarget)
  }
  if (!Sound.enabled || !Sound.ready) return
  const control = soundableControl(event.target)
  if (!control || (event.relatedTarget instanceof Node && control.contains(event.relatedTarget))) return
  const now = performance.now()
  if (now - lastHoverSoundAt < 90) return
  lastHoverSoundAt = now
  Sound.play('hover')
})
document.addEventListener('pointerout', (event) => {
  if (!activeBubbleTarget) return
  const leaving = event.target instanceof Element ? event.target.closest('[data-bubble-desc]') : null
  if (leaving === activeBubbleTarget && !(event.relatedTarget instanceof Node && activeBubbleTarget.contains(event.relatedTarget))) {
    hideUiHoverBubble()
  }
})
document.addEventListener('focusin', (event) => {
  const bubbleTarget = event.target instanceof Element ? event.target.closest('[data-bubble-desc]') : null
  if (bubbleTarget) showUiHoverBubble(bubbleTarget)
})
document.addEventListener('focusout', (event) => {
  if (activeBubbleTarget && event.target === activeBubbleTarget && !(event.relatedTarget instanceof Node && activeBubbleTarget.contains(event.relatedTarget))) {
    hideUiHoverBubble()
  }
})
document.addEventListener('click', (event) => {
  hideUiHoverBubble()
  if (soundableControl(event.target)) Sound.play('click')
}, true)
window.addEventListener('resize', hideUiHoverBubble)
document.querySelector('main')?.addEventListener('scroll', hideUiHoverBubble, { passive: true })

const loginScreen = document.getElementById('loginScreen')
const app = document.getElementById('app')
const usernameInput = document.getElementById('usernameInput')
const passwordInput = document.getElementById('passwordInput')
const passwordLabel = document.getElementById('passwordLabel')
const passwordToggleBtn = document.getElementById('passwordToggleBtn')
const confirmPasswordWrap = document.getElementById('confirmPasswordWrap')
const confirmPasswordInput = document.getElementById('confirmPasswordInput')
const confirmPasswordToggleBtn = document.getElementById('confirmPasswordToggleBtn')
const loginEyebrow = document.getElementById('loginEyebrow')
const loginTitle = document.getElementById('loginTitle')
const loginLead = document.getElementById('loginLead')
const loginNote = document.getElementById('loginNote')
const loginStatus = document.getElementById('loginStatus')
const loginError = document.getElementById('loginError')
const loginSubmitButton = document.getElementById('loginSubmitButton')
const authModeRegisterTab = document.getElementById('authModeRegisterTab')
const authModeLoginTab = document.getElementById('authModeLoginTab')

function readLocalProfiles() {
  const savedProfiles = localStorage.getItem(PROFILE_STORAGE_KEY)
  if (savedProfiles === null) return []
  const parsed = JSON.parse(savedProfiles)
  if (!Array.isArray(parsed)) throw new Error('Saved profiles have an invalid format.')
  // Strip any old client-side pinHash / password fields so secrets are never retained in browser storage
  let dirty = false
  const cleaned = parsed.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry
    if ('pinHash' in entry || 'password' in entry || 'passwordHash' in entry) {
      dirty = true
      const copy = { ...entry }
      delete copy.pinHash
      delete copy.password
      delete copy.passwordHash
      return copy
    }
    return entry
  })
  if (dirty) {
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(cleaned))
    } catch {}
  }
  return cleaned
}

let authMode = 'login'
let loginSubmitting = false

function setLoginStatus(message = '', tone = '') {
  if (!loginStatus) return
  loginStatus.textContent = message
  loginStatus.className = 'login-status' + (tone ? ` is-${tone}` : '')
}

function resetPasswordVisibility(inputEl, toggleBtn) {
  if (inputEl) inputEl.type = 'password'
  if (toggleBtn) {
    toggleBtn.textContent = 'Show'
    toggleBtn.setAttribute('aria-pressed', 'false')
    toggleBtn.setAttribute('aria-label', inputEl === confirmPasswordInput ? 'Show confirm password' : 'Show password')
  }
}

function clearPasswordInputs() {
  if (passwordInput) passwordInput.value = ''
  if (confirmPasswordInput) confirmPasswordInput.value = ''
  resetPasswordVisibility(passwordInput, passwordToggleBtn)
  resetPasswordVisibility(confirmPasswordInput, confirmPasswordToggleBtn)
}

function bindPasswordToggle(inputEl, toggleBtn, fieldLabel) {
  if (!inputEl || !toggleBtn) return
  toggleBtn.addEventListener('click', () => {
    const showing = inputEl.type === 'text'
    inputEl.type = showing ? 'password' : 'text'
    toggleBtn.textContent = showing ? 'Show' : 'Hide'
    toggleBtn.setAttribute('aria-pressed', String(!showing))
    toggleBtn.setAttribute('aria-label', `${showing ? 'Show' : 'Hide'} ${fieldLabel}`)
    inputEl.focus()
  })
}

bindPasswordToggle(passwordInput, passwordToggleBtn, 'password')
bindPasswordToggle(confirmPasswordInput, confirmPasswordToggleBtn, 'confirm password')

function setAuthMode(nextMode, options = {}) {
  authMode = nextMode === 'register' ? 'register' : 'login'
  const isLogin = authMode === 'login'
  const isRegister = authMode === 'register'

  if (authModeLoginTab) {
    authModeLoginTab.classList.toggle('is-active', isLogin)
    authModeLoginTab.setAttribute('aria-selected', String(isLogin))
  }
  if (authModeRegisterTab) {
    authModeRegisterTab.classList.toggle('is-active', isRegister)
    authModeRegisterTab.setAttribute('aria-selected', String(isRegister))
  }
  if (loginEyebrow) {
    loginEyebrow.textContent = isRegister ? 'New account' : 'Account access'
  }
  if (loginTitle) {
    loginTitle.innerHTML = isRegister ? 'Create your<br />account.' : 'Welcome back,<br />adventurer.'
  }
  if (loginLead) {
    loginLead.textContent = isRegister
      ? 'Choose a unique username and password to start saving your progress.'
      : 'Log in with your username and password to continue your progress.'
  }
  if (usernameInput) {
    usernameInput.placeholder = isRegister ? 'Choose a unique username' : 'Enter your username'
  }
  if (passwordLabel) {
    passwordLabel.textContent = 'Password'
  }
  if (passwordInput) {
    passwordInput.autocomplete = isLogin ? 'current-password' : 'new-password'
    passwordInput.placeholder = isLogin ? 'Enter your password' : 'Create a password (min. 6 characters)'
  }
  if (confirmPasswordWrap) {
    confirmPasswordWrap.hidden = isLogin
  }
  if (confirmPasswordInput) {
    confirmPasswordInput.required = !isLogin
  }
  if (loginNote) {
    loginNote.textContent = 'Usernames are unique and case-insensitive. Passwords are protected server-side.'
  }
  if (loginSubmitButton && !loginSubmitting) {
    loginSubmitButton.textContent = isRegister ? 'Sign Up' : 'Log In'
  }
  if (!options.keepPasswords) clearPasswordInputs()
  if (!options.keepError && loginError) loginError.textContent = ''
  if (!options.keepStatus) setLoginStatus('')
}

function enterAuthenticatedSession(user, sessionToken, provider) {
  const canonicalName = normalizeUsername(user?.display_name || '')
  const profileId = getUsernameKey(user?.username_key || canonicalName)
  if (!canonicalName || !profileId || !sessionToken || !provider) {
    throw new Error('Invalid authenticated profile payload.')
  }

  activeSessionToken = sessionToken
  activeAuthProvider = provider
  saveAuthSessionStorage(sessionToken, provider, canonicalName, profileId)

  let profiles = []
  try {
    profiles = readLocalProfiles()
  } catch {
    profiles = []
  }
  const existing = profiles.find((entry) => entry && String(entry.id || '').toLowerCase() === profileId)
  if (existing) {
    existing.name = canonicalName
    existing.authType = 'password'
    delete existing.pinHash
  } else {
    profiles.push({
      id: profileId,
      name: canonicalName,
      authType: 'password',
      createdAt: user?.created_at || new Date().toISOString(),
    })
  }
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profiles))
  } catch {}

  selectSkillProfile(profileId)
  selectAchievementProfile(profileId)
  const runStore = loadRunSaves(profileId)
  const activeSave = runStore.activeId ? runStore.saves.find((s) => s && s.id === runStore.activeId) : null
  if (activeSave) {
    activeRunSaveId = activeSave.id
    activeRunName = activeSave.name || ''
    activeRunRoleFocus = activeSave.roleFocus || ''
    if (typeof applyRunSkillSnapshot === 'function') {
      applyRunSkillSnapshot(
        activeSave.skillProgress,
        activeSave.activeSkillSpecialization || null,
        activeSave.exclusiveSkillTree || null,
        { skipSlotSave: true }
      )
    }
  } else {
    activeRunSaveId = null
    activeRunName = ''
    activeRunRoleFocus = ''
  }
  skillTreeStarted = false
  selectedSkillNode = null
  skillMapPan = null
  activePlayerName = canonicalName
  window.activePlayerName = activePlayerName
  leaderboardRunId = createLeaderboardRunId()
  leaderboardRunSubmitted = false
  leaderboardLastSubmittedSnapshot = ''
  mode = 'menu'
  dashboardView = 'quest'
  playViewActive = false
  resetRun()
  clearPasswordInputs()
  if (loginError) loginError.textContent = ''
  setLoginStatus('')
  loginScreen.hidden = true
  app.hidden = false
  renderDashboard()
  Sound.music('dashboard')
  syncUserOnLogin(canonicalName, profileId, user)
  window.mpUI?.initIdentity(canonicalName)
}

authModeLoginTab?.addEventListener('click', () => {
  setAuthMode('login')
  usernameInput?.focus()
})
authModeRegisterTab?.addEventListener('click', () => {
  setAuthMode('register')
  usernameInput?.focus()
})

const clearFormFeedbackOnInput = () => {
  if (loginError) loginError.textContent = ''
  setLoginStatus('')
}
usernameInput?.addEventListener('input', clearFormFeedbackOnInput)
passwordInput?.addEventListener('input', clearFormFeedbackOnInput)
confirmPasswordInput?.addEventListener('input', clearFormFeedbackOnInput)

// Sanitize any old client-side hashes on startup and default cleanly to Log In
try {
  readLocalProfiles()
} catch {}
setAuthMode('login')

async function restoreAuthSession() {
  const saved = readAuthSessionStorage()
  if (!saved) return
  try {
    const res = await callTrustedAuthService('session', {
      preferredProvider: saved.provider,
      sessionToken: saved.token,
    })
    if (res?.data?.user) {
      enterAuthenticatedSession(res.data.user, saved.token, res.provider)
      return
    }
    clearAuthSessionStorage()
  } catch {
    clearAuthSessionStorage()
  }
}

restoreAuthSession()

document.getElementById('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault()
  if (loginSubmitting) return

  const name = normalizeUsername(usernameInput?.value)
  const password = String(passwordInput?.value || '')
  const confirmPassword = String(confirmPasswordInput?.value || '')

  if (!name) {
    loginError.textContent = 'Enter a username to continue.'
    usernameInput?.focus()
    return
  }
  if (name.length > 24) {
    loginError.textContent = 'Username must be between 1 and 24 characters.'
    usernameInput?.focus()
    return
  }

  if (authMode === 'login') {
    if (!password) {
      loginError.textContent = 'Enter your password to log in.'
      passwordInput?.focus()
      return
    }
  } else {
    if (!password || !password.trim()) {
      loginError.textContent = 'Enter a password (at least 6 characters).'
      passwordInput?.focus()
      return
    }
    if (password.length < 6 || password.length > 72) {
      loginError.textContent = 'Password must be between 6 and 72 characters.'
      passwordInput?.focus()
      return
    }
    if (password !== confirmPassword) {
      loginError.textContent = 'Passwords do not match.'
      confirmPasswordInput?.focus()
      return
    }
  }

  loginSubmitting = true
  if (loginSubmitButton) {
    loginSubmitButton.disabled = true
    loginSubmitButton.textContent = authMode === 'register' ? 'Creating account...' : 'Logging in...'
  }
  loginError.textContent = ''
  setLoginStatus('')

  try {
    if (authMode === 'register') {
      const { provider, data } = await callTrustedAuthService('signup', {
        username: name,
        password,
      })
      enterAuthenticatedSession(data.user, data.session_token, provider)
      return
    }

    const { provider, data } = await callTrustedAuthService('login', {
      username: name,
      password,
    })
    enterAuthenticatedSession(data.user, data.session_token, provider)
  } catch (error) {
    if (authMode === 'login' && error?.code === 'INVALID_CREDENTIALS') {
      loginError.textContent = 'Invalid username or password.'
      passwordInput?.focus()
    } else if (error?.code === 'USERNAME_TAKEN') {
      loginError.textContent = 'That username is already taken. Please choose another name.'
      usernameInput?.focus()
    } else if (error?.message) {
      loginError.textContent = error.message
    } else {
      loginError.textContent = 'Unable to complete authentication. Please try again.'
    }
  } finally {
    // Always wipe password inputs immediately after submission completes
    if (passwordInput) passwordInput.value = ''
    if (confirmPasswordInput) confirmPasswordInput.value = ''
    resetPasswordVisibility(passwordInput, passwordToggleBtn)
    resetPasswordVisibility(confirmPasswordInput, confirmPasswordToggleBtn)
    loginSubmitting = false
    if (loginSubmitButton) {
      loginSubmitButton.disabled = false
      loginSubmitButton.textContent = authMode === 'register' ? 'Sign Up' : 'Log In'
    }
  }
})

function switchPlayerProfile() {
  window.ByteboundTutorial?.onProfileSwitch?.()
  if (typeof hideUiHoverBubble === 'function') hideUiHoverBubble()
  setNavMenuOpen(false)
  if (!practiceRunActive && hasRecordableGameplayRun() && activeAuthProvider === 'supabase') {
    submitLeaderboardRun({ skipReload: true })
  }
  const tokenToRevoke = activeSessionToken
  const providerToRevoke = activeAuthProvider
  const flushPromise = pushUserProfileToSupabase()
  if (tokenToRevoke && providerToRevoke) {
    Promise.resolve(flushPromise).finally(() => {
      callTrustedAuthService('logout', {
        preferredProvider: providerToRevoke,
        sessionToken: tokenToRevoke,
      }).catch(() => {})
    })
  }
  activeSessionToken = ''
  activeAuthProvider = ''
  clearAuthSessionStorage()
  activePlayerName = ''
  window.activePlayerName = ''
  if (skillTreeOpen) closeSkillTree()
  if (worldMapOpen) closeWorldMap()
  if (typeof practice !== 'undefined') practice.mode = 'menu'
  if (window.mpUI) {
    window.mpUI.closeOverlayOnly()
    window.mpUI.matchmaking?.leaveCurrentRoom()
  }
  if (typeof endMultiplayerMatchState === 'function') endMultiplayerMatchState()
  mode = 'menu'
  playViewActive = false
  keys.w.pressed = false
  keys.a.pressed = false
  keys.d.pressed = false
  if (usernameInput) usernameInput.value = ''
  clearPasswordInputs()
  loginError.textContent = ''
  setLoginStatus('')
  app.hidden = true
  loginScreen.hidden = false
  setAuthMode('login')
  usernameInput?.focus()
  syncAnimationLoop()
}

// Game logic and sprite animation run at a fixed 60 ticks per second, so
// 90 / 120 / 144 Hz screens no longer make the characters move faster.
const TICK_MS = 1000 / 60
const PREVIEW_FRAME_MS = 1000 / 30
let lastFrameTime = performance.now()
let lastPreviewFrameTime = 0
let tickBank = 0
let animationFrameId = null

function shouldAnimate() {
  return !app.hidden &&
    document.visibilityState === 'visible' &&
    !skillTreeOpen &&
    !worldMapOpen &&
    !window.mpUI?.isOpen &&
    (playViewActive || mode === 'menu')
}

function syncAnimationLoop() {
  if (!shouldAnimate()) {
    if (animationFrameId !== null) {
      window.cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    }
    tickBank = 0
    return
  }
  if (animationFrameId !== null) return

  lastFrameTime = performance.now()
  lastPreviewFrameTime = 0
  tickBank = 0
  animationFrameId = window.requestAnimationFrame(animate)
}

function tick() {
  syncTouchVisibility()
  if (mode === 'menu') {
    drawMenu()
  } else if (playViewActive && !skillTreeOpen && !worldMapOpen) {
    if (mode === 'intro') drawIntro()
    else if (mode === 'battle') drawBattle()
    else drawExplore()
  }

  c.save()
  c.globalAlpha = overlay.opacity
  c.fillStyle = 'black'
  c.fillRect(0, 0, canvas.width, canvas.height)
  c.restore()
}

function animate(now) {
  animationFrameId = null
  if (!shouldAnimate()) return
  animationFrameId = window.requestAnimationFrame(animate)

  if (!playViewActive && mode === 'menu') {
    if (now - lastPreviewFrameTime >= PREVIEW_FRAME_MS) {
      lastPreviewFrameTime = now
      tick()
    }
    return
  }

  tickBank += Math.min(now - lastFrameTime, 100)
  lastFrameTime = now
  for (let steps = 0; tickBank >= TICK_MS - 0.5 && steps < 3; steps++) {
    tickBank -= TICK_MS
    tick()
  }
  if (tickBank > TICK_MS) tickBank = 0
}

renderMenu()
document.addEventListener('visibilitychange', syncAnimationLoop)
let responsiveResizeTimer = 0
window.addEventListener('resize', () => {
  hideUiHoverBubble()
  window.clearTimeout(responsiveResizeTimer)
  responsiveResizeTimer = window.setTimeout(() => {
    if (worldMapOpen) {
      worldMapPan = null
      renderWorldMap()
    }
    if (skillTreeOpen) {
      skillMapPan = null
      renderSkillTree()
    }
  }, 160)
})
syncAnimationLoop()
