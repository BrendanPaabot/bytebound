param(
  [int]$Port = 8765,
  [switch]$NoBrowser,
  [string]$AuthStorePath = ''
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $PSScriptRoot).Path.TrimEnd('\')
$rootPrefix = $root + [IO.Path]::DirectorySeparatorChar
$prefix = "http://+:$Port/"
$mimeTypes = @{
  '.css' = 'text/css; charset=utf-8'
  '.gif' = 'image/gif'
  '.html' = 'text/html; charset=utf-8'
  '.ico' = 'image/x-icon'
  '.jpeg' = 'image/jpeg'
  '.jpg' = 'image/jpeg'
  '.js' = 'text/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.mp3' = 'audio/mpeg'
  '.png' = 'image/png'
  '.svg' = 'image/svg+xml'
  '.wav' = 'audio/wav'
  '.webp' = 'image/webp'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try {
  $listener.Start()
} catch {
  $listener = New-Object System.Net.HttpListener
  $prefix = "http://127.0.0.1:$Port/"
  $listener.Prefixes.Add($prefix)
  $listener.Prefixes.Add("http://localhost:$Port/")
  $listener.Start()
}
Write-Host "Serving $root at $prefix. Press Ctrl+C to stop."
if (-not $NoBrowser) {
  Start-Process "http://localhost:$Port/"
}

$script:mpPlayers = @{}
$script:mpRooms = @{}
$script:mpClosedRooms = @{}
$script:mpEvents = [System.Collections.ArrayList]::new()
$script:mpSeq = 0
$script:mpPvpLeaderboard = @{}
$script:serverStartedAt = [DateTime]::UtcNow
$script:adminSessions = @{}
$script:adminUsername = if (-not [string]::IsNullOrWhiteSpace($env:BYTEBOUND_ADMIN_USER)) { $env:BYTEBOUND_ADMIN_USER.Trim() } else { 'sysadmin' }
$script:adminPassword = if (-not [string]::IsNullOrWhiteSpace($env:BYTEBOUND_ADMIN_PASS)) { $env:BYTEBOUND_ADMIN_PASS } else { 'bytebound-admin' }

function Add-AdminAuditLog([string]$actor, [string]$action, [string]$target, [string]$detail = '') {
  $entry = @{
    id = 'aud-' + (New-RandomHex 6)
    timestamp = [DateTime]::UtcNow.ToString('o')
    actor = if ([string]::IsNullOrWhiteSpace($actor)) { 'system' } else { $actor }
    action = $action
    target = if ([string]::IsNullOrWhiteSpace($target)) { 'system' } else { $target }
    detail = $detail
  }
  if ($null -ne $script:authStore) {
    if (-not $script:authStore.ContainsKey('auditLogs') -or $null -eq $script:authStore.auditLogs) {
      $script:authStore.auditLogs = [System.Collections.ArrayList]::new()
    }
    $script:authStore.auditLogs.Insert(0, $entry)
    while ($script:authStore.auditLogs.Count -gt 300) {
      $script:authStore.auditLogs.RemoveAt($script:authStore.auditLogs.Count - 1)
    }
    Save-AuthStore
  }
  return $entry
}

function Resolve-AdminSession([string]$token) {
  if ([string]::IsNullOrWhiteSpace($token) -or $token.Trim().Length -lt 32) { return $null }
  $hash = Get-Sha256Hex ($token.Trim())
  if (-not $script:adminSessions.ContainsKey($hash)) { return $null }
  $sess = $script:adminSessions[$hash]
  if ([DateTime]::UtcNow -gt $sess.expiresAt) {
    $script:adminSessions.Remove($hash)
    return $null
  }
  return $sess
}

if ([string]::IsNullOrWhiteSpace($AuthStorePath)) {
  $localAppData = [Environment]::GetFolderPath('LocalApplicationData')
  if ([string]::IsNullOrWhiteSpace($localAppData)) { $localAppData = [IO.Path]::GetTempPath() }
  $script:authStoreFile = Join-Path (Join-Path $localAppData 'Bytebound') 'auth-accounts.json'
} else {
  $script:authStoreFile = [IO.Path]::GetFullPath($AuthStorePath)
}

function Normalize-AuthUsername([string]$raw) {
  if ($null -eq $raw) { return '' }
  return [regex]::Replace($raw.Trim(), '\s+', ' ')
}

function Get-AuthUsernameKey([string]$raw) {
  return (Normalize-AuthUsername $raw).ToLowerInvariant()
}

function Get-Sha256Hex([string]$text) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [Text.Encoding]::UTF8.GetBytes($text)
    $hash = $sha.ComputeHash($bytes)
    return ([BitConverter]::ToString($hash).Replace('-', '').ToLowerInvariant())
  } finally {
    $sha.Dispose()
  }
}

function New-RandomHex([int]$byteCount) {
  $bytes = New-Object byte[] $byteCount
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }
  return ([BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant())
}

function Compare-BytesConstantTime([byte[]]$a, [byte[]]$b) {
  if ($null -eq $a -or $null -eq $b) { return $false }
  $diff = $a.Length -bxor $b.Length
  $len = [Math]::Min($a.Length, $b.Length)
  for ($i = 0; $i -lt $len; $i++) {
    $diff = $diff -bor ($a[$i] -bxor $b[$i])
  }
  return ($diff -eq 0)
}

function New-PasswordHash([string]$password) {
  $iterations = 120000
  $salt = New-Object byte[] 16
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($salt)
  } finally {
    $rng.Dispose()
  }
  $pwBytes = [Text.Encoding]::UTF8.GetBytes($password)
  $kdf = New-Object System.Security.Cryptography.Rfc2898DeriveBytes(
    $pwBytes,
    $salt,
    $iterations,
    [System.Security.Cryptography.HashAlgorithmName]::SHA256
  )
  try {
    $derived = $kdf.GetBytes(32)
  } finally {
    $kdf.Dispose()
  }
  return ('pbkdf2_sha256${0}${1}${2}' -f $iterations, [Convert]::ToBase64String($salt), [Convert]::ToBase64String($derived))
}

$script:dummyPasswordHash = New-PasswordHash 'ByteboundDummyVerificationSecret!'

function Test-PasswordHash([string]$password, [string]$storedHash) {
  $targetHash = if ([string]::IsNullOrWhiteSpace($storedHash)) { $script:dummyPasswordHash } else { $storedHash }
  $parts = $targetHash.Split('$')
  if ($parts.Length -ne 4 -or $parts[0] -ne 'pbkdf2_sha256') {
    $parts = $script:dummyPasswordHash.Split('$')
    $storedHash = ''
  }
  $iterations = 120000
  if (-not [int]::TryParse($parts[1], [ref]$iterations) -or $iterations -lt 10000) { return $false }
  try {
    $salt = [Convert]::FromBase64String($parts[2])
    $expected = [Convert]::FromBase64String($parts[3])
  } catch {
    return $false
  }
  $pwBytes = [Text.Encoding]::UTF8.GetBytes($password)
  $kdf = New-Object System.Security.Cryptography.Rfc2898DeriveBytes(
    $pwBytes,
    $salt,
    $iterations,
    [System.Security.Cryptography.HashAlgorithmName]::SHA256
  )
  try {
    $computed = $kdf.GetBytes($expected.Length)
  } finally {
    $kdf.Dispose()
  }
  $matches = Compare-BytesConstantTime $computed $expected
  return (-not [string]::IsNullOrWhiteSpace($storedHash)) -and $matches
}

function Convert-PsObjToHashtableEarly($obj) {
  if ($null -eq $obj) { return $null }
  if ($obj -is [System.Collections.IDictionary]) {
    $ht = @{}
    foreach ($k in $obj.Keys) { $ht[$k] = Convert-PsObjToHashtableEarly $obj[$k] }
    return $ht
  }
  if ($obj -is [PSCustomObject]) {
    $ht = @{}
    foreach ($prop in $obj.PSObject.Properties) {
      $ht[$prop.Name] = Convert-PsObjToHashtableEarly $prop.Value
    }
    return $ht
  }
  if ($obj -is [System.Collections.IList]) {
    $arr = @()
    foreach ($item in $obj) { $arr += ,(Convert-PsObjToHashtableEarly $item) }
    return $arr
  }
  return $obj
}

function Load-AuthStore {
  $defaultStore = @{
    nextUserId = 1
    nextResetId = 1
    nextYearReqId = 1
    users = @{}
    sessions = @{}
    resetRequests = [System.Collections.ArrayList]::new()
    yearRequests = [System.Collections.ArrayList]::new()
    auditLogs = [System.Collections.ArrayList]::new()
    securityNotice = @{
      active = $false
      severity = 'info'
      title = ''
      message = ''
      updated_at = $null
      updated_by = ''
    }
  }
  if (-not (Test-Path -LiteralPath $script:authStoreFile -PathType Leaf)) {
    return $defaultStore
  }
  try {
    $raw = [IO.File]::ReadAllText($script:authStoreFile, [Text.Encoding]::UTF8)
    if ([string]::IsNullOrWhiteSpace($raw)) { return $defaultStore }
    $parsed = Convert-PsObjToHashtableEarly ($raw | ConvertFrom-Json)
    if ($null -eq $parsed -or -not ($parsed -is [System.Collections.IDictionary])) { return $defaultStore }
    if (-not $parsed.ContainsKey('users') -or -not ($parsed.users -is [System.Collections.IDictionary])) { $parsed.users = @{} }
    if (-not $parsed.ContainsKey('sessions') -or -not ($parsed.sessions -is [System.Collections.IDictionary])) { $parsed.sessions = @{} }
    if (-not $parsed.ContainsKey('nextUserId')) { $parsed.nextUserId = 1 }
    if (-not $parsed.ContainsKey('nextResetId')) { $parsed.nextResetId = 1 }
    if (-not $parsed.ContainsKey('nextYearReqId')) { $parsed.nextYearReqId = 1 }
    $reqs = [System.Collections.ArrayList]::new()
    if ($parsed.ContainsKey('resetRequests') -and $parsed.resetRequests -is [System.Collections.IEnumerable] -and -not ($parsed.resetRequests -is [string])) {
      foreach ($item in $parsed.resetRequests) {
        if ($null -ne $item) { [void]$reqs.Add($item) }
      }
    }
    $parsed.resetRequests = $reqs
    $yReqs = [System.Collections.ArrayList]::new()
    if ($parsed.ContainsKey('yearRequests') -and $parsed.yearRequests -is [System.Collections.IEnumerable] -and -not ($parsed.yearRequests -is [string])) {
      foreach ($item in $parsed.yearRequests) {
        if ($null -ne $item) { [void]$yReqs.Add($item) }
      }
    }
    $parsed.yearRequests = $yReqs
    $aLogs = [System.Collections.ArrayList]::new()
    if ($parsed.ContainsKey('auditLogs') -and $parsed.auditLogs -is [System.Collections.IEnumerable] -and -not ($parsed.auditLogs -is [string])) {
      foreach ($item in $parsed.auditLogs) {
        if ($null -ne $item) { [void]$aLogs.Add($item) }
      }
    }
    $parsed.auditLogs = $aLogs
    if (-not $parsed.ContainsKey('securityNotice') -or -not ($parsed.securityNotice -is [System.Collections.IDictionary])) {
      $parsed.securityNotice = @{ active = $false; severity = 'info'; title = ''; message = ''; updated_at = $null; updated_by = '' }
    }
    return $parsed
  } catch {
    Write-Warning "Failed to load local auth store: $($_.Exception.Message)"
    return $defaultStore
  }
}

function Save-AuthStore {
  $dir = [IO.Path]::GetDirectoryName($script:authStoreFile)
  if (-not [string]::IsNullOrWhiteSpace($dir) -and -not (Test-Path -LiteralPath $dir -PathType Container)) {
    [void][IO.Directory]::CreateDirectory($dir)
  }
  $json = $script:authStore | ConvertTo-Json -Depth 14
  $tmpPath = "$($script:authStoreFile).tmp"
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($tmpPath, $json, $utf8NoBom)
  [IO.File]::Copy($tmpPath, $script:authStoreFile, $true)
  [IO.File]::Delete($tmpPath)
}

function Get-SessionUserKey($sessObj) {
  if ($null -eq $sessObj) { return '' }
  if ($sessObj -is [System.Collections.IDictionary]) {
    if ($sessObj.ContainsKey('user_key') -and -not [string]::IsNullOrWhiteSpace([string]$sessObj.user_key)) {
      return [string]$sessObj.user_key
    }
    if ($sessObj.ContainsKey('username_key') -and -not [string]::IsNullOrWhiteSpace([string]$sessObj.username_key)) {
      return [string]$sessObj.username_key
    }
  }
  return ''
}

function Get-PendingYearRequestForUser([string]$usernameKey) {
  if ([string]::IsNullOrWhiteSpace($usernameKey) -or $null -eq $script:authStore -or -not $script:authStore.ContainsKey('yearRequests')) {
    return $null
  }
  foreach ($yrReq in $script:authStore.yearRequests) {
    if ($yrReq -and $yrReq.username_key -eq $usernameKey -and $yrReq.status -eq 'pending') {
      return @{
        id = [int64]$yrReq.id
        current_year = [int]$yrReq.current_year
        requested_year = [int]$yrReq.requested_year
        reason = [string]$yrReq.reason
        status = 'pending'
        created_at = [string]$yrReq.created_at
      }
    }
  }
  return $null
}

function Serialize-AuthUser($u) {
  $uKey = [string]$u.username_key
  return @{
    id = [int64]$u.id
    username_key = $uKey
    display_name = [string]$u.display_name
    best_score = if ($null -ne $u.best_score) { [int]$u.best_score } else { 0 }
    total_kills = if ($null -ne $u.total_kills) { [int]$u.total_kills } else { 0 }
    total_correct = if ($null -ne $u.total_correct) { [int]$u.total_correct } else { 0 }
    total_answers = if ($null -ne $u.total_answers) { [int]$u.total_answers } else { 0 }
    topic_progress = if ($null -ne $u.topic_progress) { $u.topic_progress } else { @{} }
    skill_progress = if ($null -ne $u.skill_progress) { $u.skill_progress } else { @{} }
    review_store = if ($null -ne $u.review_store) { $u.review_store } else { @{} }
    achievements = if ($null -ne $u.achievements) { $u.achievements } else { @{} }
    is_suspended = [bool]($u.ContainsKey('is_suspended') -and $u.is_suspended)
    must_change_password = [bool]($u.ContainsKey('must_change_password') -and $u.must_change_password)
    failed_login_count = if ($u.ContainsKey('failed_login_count') -and $null -ne $u.failed_login_count) { [int]$u.failed_login_count } else { 0 }
    last_failed_login_at = if ($u.ContainsKey('last_failed_login_at')) { $u.last_failed_login_at } else { $null }
    pending_year_request = (Get-PendingYearRequestForUser $uKey)
    source = if ($u.ContainsKey('source') -and -not [string]::IsNullOrWhiteSpace([string]$u.source)) { [string]$u.source } else { 'local' }
    created_at = [string]$u.created_at
    updated_at = [string]$u.updated_at
    last_login_at = [string]$u.last_login_at
  }
}

function New-AuthSessionForUser([string]$usernameKey) {
  $nowUtc = [DateTimeOffset]::UtcNow
  $staleKeys = @()
  foreach ($kv in $script:authStore.sessions.GetEnumerator()) {
    $exp = [DateTimeOffset]::MinValue
    if (-not [DateTimeOffset]::TryParse([string]$kv.Value.expires_at, [ref]$exp) -or $exp -le $nowUtc) {
      $staleKeys += $kv.Key
    }
  }
  foreach ($k in $staleKeys) { $script:authStore.sessions.Remove($k) }

  $rawToken = New-RandomHex 32
  $tokenHash = Get-Sha256Hex $rawToken
  $expiresAt = $nowUtc.AddDays(30).ToString('o')
  $script:authStore.sessions[$tokenHash] = @{
    user_key = $usernameKey
    created_at = $nowUtc.ToString('o')
    expires_at = $expiresAt
  }
  return @{
    session_token = $rawToken
    expires_at = $expiresAt
  }
}

function Resolve-AuthSession([string]$rawToken) {
  if ([string]::IsNullOrWhiteSpace($rawToken) -or $rawToken.Trim().Length -lt 32) { return $null }
  $tokenHash = Get-Sha256Hex ($rawToken.Trim())
  if (-not $script:authStore.sessions.ContainsKey($tokenHash)) { return $null }
  $sess = $script:authStore.sessions[$tokenHash]
  $exp = [DateTimeOffset]::MinValue
  if (-not [DateTimeOffset]::TryParse([string]$sess.expires_at, [ref]$exp) -or $exp -le [DateTimeOffset]::UtcNow) {
    $script:authStore.sessions.Remove($tokenHash)
    return $null
  }
  $uKey = Get-SessionUserKey $sess
  if (-not $uKey -or -not $script:authStore.users.ContainsKey($uKey)) { return $null }
  $uObj = $script:authStore.users[$uKey]
  if ($uObj.ContainsKey('is_suspended') -and [bool]$uObj.is_suspended) { return $null }
  return $uObj
}

$script:authStore = Load-AuthStore

function Get-NowMs {
  return [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
}

$script:rateLimitBuckets = @{}

function Get-ClientIpKey($request) {
  try {
    if ($null -ne $request -and $null -ne $request.RemoteEndPoint -and $null -ne $request.RemoteEndPoint.Address) {
      return [string]$request.RemoteEndPoint.Address.ToString()
    }
  } catch {}
  return 'unknown'
}

function Test-RateLimit([string]$bucketKey, [int]$maxHits, [int]$windowSeconds, [bool]$consume = $true) {
  $nowSec = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $cutoff = $nowSec - $windowSeconds
  $fresh = [System.Collections.Generic.List[int64]]::new()
  if ($script:rateLimitBuckets.ContainsKey($bucketKey)) {
    foreach ($ts in $script:rateLimitBuckets[$bucketKey]) {
      if ($ts -gt $cutoff) { [void]$fresh.Add([int64]$ts) }
    }
  }
  if ($fresh.Count -ge $maxHits) {
    $script:rateLimitBuckets[$bucketKey] = $fresh
    $oldest = [int64]$fresh[0]
    $retryAfter = [Math]::Max(1, [int](($oldest + $windowSeconds) - $nowSec))
    return @{ allowed = $false; retryAfter = $retryAfter; remaining = 0 }
  }
  if ($consume) {
    [void]$fresh.Add($nowSec)
  }
  $script:rateLimitBuckets[$bucketKey] = $fresh
  return @{ allowed = $true; retryAfter = 0; remaining = [Math]::Max(0, $maxHits - $fresh.Count) }
}

function Clear-RateLimit([string]$bucketKey) {
  if ($script:rateLimitBuckets.ContainsKey($bucketKey)) {
    [void]$script:rateLimitBuckets.Remove($bucketKey)
  }
}

function Add-SecurityHeaders($response) {
  if ($null -eq $response) { return }
  $response.Headers['X-Content-Type-Options'] = 'nosniff'
  $response.Headers['X-Frame-Options'] = 'DENY'
  $response.Headers['Referrer-Policy'] = 'no-referrer'
  $response.Headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
}

function Send-JsonResponse($response, [int]$statusCode, $data, [hashtable]$extraHeaders = $null) {
  $json = $data | ConvertTo-Json -Depth 12 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $response.StatusCode = $statusCode
  $response.ContentType = 'application/json; charset=utf-8'
  $response.Headers['Cache-Control'] = 'no-store'
  Add-SecurityHeaders $response
  if ($null -ne $extraHeaders) {
    foreach ($kv in $extraHeaders.GetEnumerator()) {
      $response.Headers[[string]$kv.Key] = [string]$kv.Value
    }
  }
  $response.ContentLength64 = $bytes.Length
  $response.OutputStream.Write($bytes, 0, $bytes.Length)
  $response.Close()
}

function Send-RateLimitResponse($response, [int]$retryAfter, [string]$message = '') {
  $safeRetry = [Math]::Max(1, $retryAfter)
  $msg = if ([string]::IsNullOrWhiteSpace($message)) {
    "Too many attempts. Please wait $safeRetry seconds and try again."
  } else {
    $message
  }
  Send-JsonResponse $response 429 @{
    ok = $false
    code = 'RATE_LIMITED'
    retry_after = $safeRetry
    error = $msg
  } @{ 'Retry-After' = [string]$safeRetry }
}

function Add-MpEvent([string]$type, [string]$roomCode, $targetClientId, $payload) {
  $script:mpSeq++
  $evt = @{
    seq = $script:mpSeq
    ts = (Get-NowMs)
    type = $type
    roomCode = $roomCode
    targetClientId = $targetClientId
    payload = $payload
  }
  [void]$script:mpEvents.Add($evt)
  while ($script:mpEvents.Count -gt 180) {
    $script:mpEvents.RemoveAt(0)
  }
}

function Close-MpRoom([string]$code, [string]$reason, [int64]$nowMs) {
  if ([string]::IsNullOrWhiteSpace($code) -or -not $script:mpRooms.ContainsKey($code)) { return }
  $room = $script:mpRooms[$code]
  $hostId = if ($room.host) { $room.host.clientId } else { $null }
  $guestId = if ($room.guest) { $room.guest.clientId } else { $null }
  $script:mpRooms.Remove($code)
  $script:mpClosedRooms[$code] = $nowMs
  if ($hostId -and $script:mpPlayers.ContainsKey($hostId)) {
    $script:mpPlayers[$hostId].roomCode = $null
    if ($script:mpPlayers[$hostId].status -eq 'In Lobby' -or $script:mpPlayers[$hostId].status -eq 'In Match') {
      $script:mpPlayers[$hostId].status = 'Available'
    }
  }
  if ($guestId -and $script:mpPlayers.ContainsKey($guestId)) {
    $script:mpPlayers[$guestId].roomCode = $null
    if ($script:mpPlayers[$guestId].status -eq 'In Lobby' -or $script:mpPlayers[$guestId].status -eq 'In Match') {
      $script:mpPlayers[$guestId].status = 'Available'
    }
  }
  Add-MpEvent 'room_closed' $code $null @{ code = $code; reason = $reason }
}

function Remove-PlayerFromMp([string]$cid, [string]$reason, [int64]$nowMs) {
  if ([string]::IsNullOrWhiteSpace($cid)) { return }
  $pName = if ($script:mpPlayers.ContainsKey($cid)) { $script:mpPlayers[$cid].username } else { 'Player' }
  if ($script:mpPlayers.ContainsKey($cid)) {
    $script:mpPlayers.Remove($cid)
  }
  $roomCodes = @($script:mpRooms.Keys)
  foreach ($code in $roomCodes) {
    if (-not $script:mpRooms.ContainsKey($code)) { continue }
    $room = $script:mpRooms[$code]
    if ($room.host -and $room.host.clientId -eq $cid) {
      $closeReason = if ($room.status -eq 'in_match') { "$pName disconnected from the match." } else { $reason }
      Close-MpRoom $code $closeReason $nowMs
    } elseif ($room.guest -and $room.guest.clientId -eq $cid) {
      $wasMatch = ($room.status -eq 'in_match')
      $room.guest = $null
      $room.host.ready = $false
      $room.status = 'waiting'
      $room.updatedAtMs = $nowMs
      if ($wasMatch) {
        Add-MpEvent 'match_forfeit' $code $null @{ winnerClientId = $room.host.clientId; reason = "$pName disconnected." }
        Close-MpRoom $code "$pName disconnected." $nowMs
      } else {
        Add-MpEvent 'room_state' $code $null @{ room = $room; notice = "$pName disconnected." }
      }
    }
  }
}

function Prune-MpState([int64]$nowMs) {
  $stalePlayerIds = @()
  foreach ($entry in $script:mpPlayers.GetEnumerator()) {
    if (($nowMs - [int64]$entry.Value.lastSeenMs) -gt 45000) {
      $stalePlayerIds += $entry.Key
    }
  }
  foreach ($cid in $stalePlayerIds) {
    Remove-PlayerFromMp $cid 'Host disconnected.' $nowMs
  }
  $staleClosed = @()
  foreach ($entry in $script:mpClosedRooms.GetEnumerator()) {
    if (($nowMs - [int64]$entry.Value) -gt 600000) {
      $staleClosed += $entry.Key
    }
  }
  foreach ($code in $staleClosed) {
    $script:mpClosedRooms.Remove($code)
  }
}

function Convert-PsObjToHashtable($obj) {
  if ($null -eq $obj) { return $null }
  if ($obj -is [System.Collections.IDictionary]) {
    $ht = @{}
    foreach ($k in $obj.Keys) { $ht[$k] = Convert-PsObjToHashtable $obj[$k] }
    return $ht
  }
  if ($obj -is [PSCustomObject]) {
    $ht = @{}
    foreach ($prop in $obj.PSObject.Properties) {
      $ht[$prop.Name] = Convert-PsObjToHashtable $prop.Value
    }
    return $ht
  }
  if ($obj -is [System.Collections.IList]) {
    $arr = @()
    foreach ($item in $obj) { $arr += ,(Convert-PsObjToHashtable $item) }
    return $arr
  }
  return $obj
}

try {
  while ($listener.IsListening) {
    try {
      $context = $listener.GetContext()
    } catch {
      break
    }

    try {
      $relativePath = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart('/'))

      if ($relativePath -eq 'api/auth/health' -and $context.Request.HttpMethod -eq 'GET') {
        Send-JsonResponse $context.Response 200 @{ ok = $true; provider = 'local'; rateLimiting = $true }
        continue
      }

      if ($relativePath -eq 'api/security/notice' -and $context.Request.HttpMethod -eq 'GET') {
        Send-JsonResponse $context.Response 200 @{ ok = $true; notice = $script:authStore.securityNotice }
        continue
      }

      if ($relativePath -like 'api/auth/*' -and $context.Request.HttpMethod -eq 'POST') {
        $clientIp = Get-ClientIpKey $context.Request
        $reader = New-Object IO.StreamReader($context.Request.InputStream, [Text.Encoding]::UTF8)
        $rawBody = $reader.ReadToEnd()
        $reader.Close()
        $body = @{}
        if (-not [string]::IsNullOrWhiteSpace($rawBody)) {
          try {
            $body = Convert-PsObjToHashtable ($rawBody | ConvertFrom-Json)
          } catch {
            Send-JsonResponse $context.Response 400 @{ ok = $false; code = 'INVALID_JSON'; error = 'Invalid request payload.' }
            continue
          }
        }
        $nowIso = [DateTimeOffset]::UtcNow.ToString('o')

        if ($relativePath -eq 'api/auth/signup') {
          $rlSignup = Test-RateLimit "signup:${clientIp}" 10 600 $true
          if (-not $rlSignup.allowed) {
            Send-RateLimitResponse $context.Response $rlSignup.retryAfter "Too many account signups from this connection. Please wait $($rlSignup.retryAfter) seconds and try again."
            continue
          }
          $displayName = Normalize-AuthUsername ([string]$body.username)
          $usernameKey = $displayName.ToLowerInvariant()
          $password = if ($null -ne $body.password) { [string]$body.password } else { '' }
          if ($displayName.Length -lt 1 -or $displayName.Length -gt 24) {
            Send-JsonResponse $context.Response 400 @{ ok = $false; code = 'INVALID_USERNAME'; error = 'Username must be between 1 and 24 characters.' }
            continue
          }
          if ($password.Length -lt 6 -or $password.Length -gt 72 -or [string]::IsNullOrWhiteSpace($password)) {
            Send-JsonResponse $context.Response 400 @{ ok = $false; code = 'INVALID_PASSWORD'; error = 'Password must be between 6 and 72 characters.' }
            continue
          }
          if ($script:authStore.users.ContainsKey($usernameKey)) {
            Send-JsonResponse $context.Response 409 @{ ok = $false; code = 'USERNAME_TAKEN'; error = 'That username is already taken. Please choose another name.' }
            continue
          }
          $pwHash = New-PasswordHash $password
          $uid = [int64]$script:authStore.nextUserId
          $script:authStore.nextUserId = $uid + 1
          $yr = 4
          if ($body.ContainsKey('academicYear') -and $null -ne $body.academicYear) {
            [void][int]::TryParse([string]$body.academicYear, [ref]$yr)
            if ($yr -lt 1 -or $yr -gt 4) { $yr = 4 }
          }
          $newUser = @{
            id = $uid
            username_key = $usernameKey
            display_name = $displayName
            password_hash = $pwHash
            best_score = 0
            total_kills = 0
            total_correct = 0
            total_answers = 0
            topic_progress = @{}
            skill_progress = @{}
            review_store = @{ academicYear = $yr }
            achievements = @{}
            is_suspended = $false
            source = 'local'
            created_at = $nowIso
            updated_at = $nowIso
            last_login_at = $nowIso
          }
          $script:authStore.users[$usernameKey] = $newUser
          $sess = New-AuthSessionForUser $usernameKey
          Save-AuthStore
          Add-AdminAuditLog $displayName 'PLAYER_SIGNUP' $displayName "Signed up (Year $yr account)" | Out-Null
          Send-JsonResponse $context.Response 200 @{
            ok = $true
            session_token = $sess.session_token
            expires_at = $sess.expires_at
            user = (Serialize-AuthUser $newUser)
          }
          continue
        }

        if ($relativePath -eq 'api/auth/login') {
          $displayName = Normalize-AuthUsername ([string]$body.username)
          $usernameKey = $displayName.ToLowerInvariant()
          $loginBucket = "login:${clientIp}:$(if ($usernameKey) { $usernameKey } else { 'blank' })"
          $rlLogin = Test-RateLimit $loginBucket 5 900 $false
          if (-not $rlLogin.allowed) {
            Send-RateLimitResponse $context.Response $rlLogin.retryAfter "Too many failed login attempts for `"$displayName`". Please wait $($rlLogin.retryAfter) seconds and try again."
            continue
          }
          $password = if ($null -ne $body.password) { [string]$body.password } else { '' }
          $userObj = if ($usernameKey -and $script:authStore.users.ContainsKey($usernameKey)) { $script:authStore.users[$usernameKey] } else { $null }
          $storedHash = if ($null -ne $userObj -and $userObj.ContainsKey('password_hash')) { [string]$userObj.password_hash } else { '' }
          $validPw = ($displayName.Length -ge 1 -and $displayName.Length -le 24 -and $password.Length -ge 1 -and $password.Length -le 72)
          $verified = if ($validPw) { Test-PasswordHash $password $storedHash } else { $false }
          if ($null -eq $userObj -or -not $verified) {
            [void](Test-RateLimit $loginBucket 5 900 $true)
            if ($null -ne $userObj) {
              $prevFailCount = if ($userObj.ContainsKey('failed_login_count') -and $null -ne $userObj.failed_login_count) { [int]$userObj.failed_login_count } else { 0 }
              $userObj.failed_login_count = $prevFailCount + 1
              $userObj.last_failed_login_at = $nowIso
              Save-AuthStore
            }
            Send-JsonResponse $context.Response 401 @{ ok = $false; code = 'INVALID_CREDENTIALS'; error = 'Invalid username or password.' }
            continue
          }
          if ($userObj.ContainsKey('is_suspended') -and [bool]$userObj.is_suspended) {
            Send-JsonResponse $context.Response 403 @{ ok = $false; code = 'ACCOUNT_SUSPENDED'; error = 'This account has been locked by an administrator.' }
            continue
          }
          Clear-RateLimit $loginBucket
          $recentFailedCount = if ($userObj.ContainsKey('failed_login_count') -and $null -ne $userObj.failed_login_count) { [int]$userObj.failed_login_count } else { 0 }
          $lastFailedAt = if ($userObj.ContainsKey('last_failed_login_at')) { $userObj.last_failed_login_at } else { $null }
          $mustChangePw = [bool]($userObj.ContainsKey('must_change_password') -and $userObj.must_change_password)
          $userObj.failed_login_count = 0
          $userObj.last_failed_login_at = $null
          $userObj.last_login_at = $nowIso
          $sess = New-AuthSessionForUser $usernameKey
          Save-AuthStore
          Send-JsonResponse $context.Response 200 @{
            ok = $true
            session_token = $sess.session_token
            expires_at = $sess.expires_at
            recent_failed_logins = $recentFailedCount
            last_failed_login_at = $lastFailedAt
            must_change_password = $mustChangePw
            user = (Serialize-AuthUser $userObj)
          }
          continue
        }

        if ($relativePath -eq 'api/auth/session') {
          $token = [string]$body.sessionToken
          $userObj = Resolve-AuthSession $token
          if ($null -eq $userObj) {
            Send-JsonResponse $context.Response 401 @{ ok = $false; code = 'SESSION_INVALID'; error = 'Your session has expired. Please log in again.' }
            continue
          }
          Send-JsonResponse $context.Response 200 @{
            ok = $true
            user = (Serialize-AuthUser $userObj)
          }
          continue
        }

        if ($relativePath -eq 'api/auth/logout') {
          $token = ([string]$body.sessionToken).Trim()
          if ($token.Length -ge 32) {
            $tokenHash = Get-Sha256Hex $token
            if ($script:authStore.sessions.ContainsKey($tokenHash)) {
              $script:authStore.sessions.Remove($tokenHash)
              Save-AuthStore
            }
          }
          Send-JsonResponse $context.Response 200 @{ ok = $true }
          continue
        }

        if ($relativePath -eq 'api/auth/profile') {
          $token = [string]$body.sessionToken
          $userObj = Resolve-AuthSession $token
          if ($null -eq $userObj) {
            Send-JsonResponse $context.Response 401 @{ ok = $false; code = 'SESSION_INVALID'; error = 'Please log in again to save your progress.' }
            continue
          }
          if ($body.ContainsKey('topicProgress') -and $null -ne $body.topicProgress) { $userObj.topic_progress = $body.topicProgress }
          if ($body.ContainsKey('skillProgress') -and $null -ne $body.skillProgress) { $userObj.skill_progress = $body.skillProgress }
          if ($body.ContainsKey('reviewStore') -and $null -ne $body.reviewStore) {
            # Enforce locked Academic Year on server: preserve existing server academicYear (1..4)
            $lockedYear = 0
            if ($userObj.review_store -is [System.Collections.IDictionary] -and $userObj.review_store.ContainsKey('academicYear')) {
              [void][int]::TryParse([string]$userObj.review_store.academicYear, [ref]$lockedYear)
            }
            $nextReview = $body.reviewStore
            if ($lockedYear -ge 1 -and $lockedYear -le 4 -and $nextReview -is [System.Collections.IDictionary]) {
              $nextReview['academicYear'] = $lockedYear
            }
            $userObj.review_store = $nextReview
          }
          if ($body.ContainsKey('achievements') -and $null -ne $body.achievements) { $userObj.achievements = $body.achievements }
          $userObj.updated_at = $nowIso
          $userObj.last_login_at = $nowIso
          Save-AuthStore
          Send-JsonResponse $context.Response 200 @{ ok = $true; user = (Serialize-AuthUser $userObj) }
          continue
        }

        if ($relativePath -eq 'api/auth/reset') {
          $token = [string]$body.sessionToken
          $userObj = Resolve-AuthSession $token
          if ($null -eq $userObj) {
            Send-JsonResponse $context.Response 401 @{ ok = $false; code = 'SESSION_INVALID'; error = 'Please log in again to reset your profile.' }
            continue
          }
          $userObj.best_score = 0
          $userObj.total_kills = 0
          $userObj.total_correct = 0
          $userObj.total_answers = 0
          $userObj.topic_progress = @{}
          $userObj.skill_progress = @{}
          $userObj.review_store = @{}
          $userObj.achievements = @{}
          $userObj.updated_at = $nowIso
          $uKey = [string]$userObj.username_key
          if ($uKey -and $script:mpPvpLeaderboard.ContainsKey($uKey)) {
            $script:mpPvpLeaderboard.Remove($uKey)
          }
          Save-AuthStore
          Send-JsonResponse $context.Response 200 @{ ok = $true }
          continue
        }

        if ($relativePath -eq 'api/auth/forgot-password') {
          $rlForgotIp = Test-RateLimit "forgot-ip:${clientIp}" 10 600 $true
          if (-not $rlForgotIp.allowed) {
            Send-RateLimitResponse $context.Response $rlForgotIp.retryAfter "Too many password reset requests from this connection. Please wait $($rlForgotIp.retryAfter) seconds and try again."
            continue
          }
          $displayName = Normalize-AuthUsername ([string]$body.username)
          $usernameKey = $displayName.ToLowerInvariant()
          $note = if ($null -ne $body.note) { ([string]$body.note).Trim() } else { '' }
          if ($note.Length -gt 180) { $note = $note.Substring(0, 180) }
          if ($displayName.Length -lt 1 -or $displayName.Length -gt 24) {
            Send-JsonResponse $context.Response 400 @{ ok = $false; code = 'INVALID_USERNAME'; error = 'Enter your username (1 to 24 characters).' }
            continue
          }
          if (-not $script:authStore.users.ContainsKey($usernameKey)) {
            Send-JsonResponse $context.Response 404 @{ ok = $false; code = 'ACCOUNT_NOT_FOUND'; error = "No account found with username `"$displayName`". Please check the spelling or sign up first." }
            continue
          }
          $rlForgotUser = Test-RateLimit "forgot:${usernameKey}" 3 600 $true
          if (-not $rlForgotUser.allowed) {
            Send-RateLimitResponse $context.Response $rlForgotUser.retryAfter "Too many password reset requests for `"$displayName`". Please wait $($rlForgotUser.retryAfter) seconds and try again."
            continue
          }
          $resolvedDisplay = [string]$script:authStore.users[$usernameKey].display_name
          $existingReq = $null
          foreach ($r in $script:authStore.resetRequests) {
            if ($r -and $r.username_key -eq $usernameKey -and $r.status -eq 'pending') {
              $existingReq = $r
              break
            }
          }
          if ($null -ne $existingReq) {
            if (-not [string]::IsNullOrWhiteSpace($note)) { $existingReq.note = $note }
            $existingReq.created_at = $nowIso
            $existingReq.account_found = $true
          } else {
            $rid = [int64]$script:authStore.nextResetId
            $script:authStore.nextResetId = $rid + 1
            [void]$script:authStore.resetRequests.Add(@{
              id = $rid
              username_key = $usernameKey
              display_name = $resolvedDisplay
              note = $note
              status = 'pending'
              account_found = $true
              created_at = $nowIso
              resolved_at = $null
              resolved_by = $null
            })
          }
          Save-AuthStore
          $reqDetail = if ($note) { "Requested password reset: $note" } else { 'Submitted Forgot Password request' }
          Add-AdminAuditLog $resolvedDisplay 'FORGOT_PASSWORD_REQUEST' $resolvedDisplay $reqDetail | Out-Null
          Send-JsonResponse $context.Response 200 @{
            ok = $true
            message = 'Password reset request sent to the administrator. Ask your admin for your temporary password once approved.'
          }
          continue
        }

        if ($relativePath -eq 'api/auth/change-password') {
          $token = ([string]$body.sessionToken).Trim()
          $userObj = Resolve-AuthSession $token
          if ($null -eq $userObj) {
            Send-JsonResponse $context.Response 401 @{ ok = $false; code = 'SESSION_INVALID'; error = 'Your session has expired. Please log in again.' }
            continue
          }
          $rlChPw = Test-RateLimit "chpw:$($userObj.username_key)" 5 600 $true
          if (-not $rlChPw.allowed) {
            Send-RateLimitResponse $context.Response $rlChPw.retryAfter "Too many password change attempts. Please wait $($rlChPw.retryAfter) seconds and try again."
            continue
          }
          $curPw = if ($null -ne $body.currentPassword) { [string]$body.currentPassword } else { '' }
          $newPw = if ($null -ne $body.newPassword) { [string]$body.newPassword } else { '' }
          if ($newPw.Length -lt 6 -or $newPw.Length -gt 72 -or [string]::IsNullOrWhiteSpace($newPw)) {
            Send-JsonResponse $context.Response 400 @{ ok = $false; code = 'INVALID_PASSWORD'; error = 'New password must be between 6 and 72 characters.' }
            continue
          }
          $storedHash = if ($userObj.ContainsKey('password_hash')) { [string]$userObj.password_hash } else { '' }
          if (-not (Test-PasswordHash $curPw $storedHash)) {
            Send-JsonResponse $context.Response 401 @{ ok = $false; code = 'INVALID_CREDENTIALS'; error = 'Current password is incorrect.' }
            continue
          }
          $userObj.password_hash = New-PasswordHash $newPw
          $userObj.must_change_password = $false
          $userObj.updated_at = $nowIso
          $curTokHash = Get-Sha256Hex $token
          $uk = [string]$userObj.username_key
          foreach ($sKey in @($script:authStore.sessions.Keys)) {
            if ($sKey -ne $curTokHash -and (Get-SessionUserKey $script:authStore.sessions[$sKey]) -eq $uk) {
              $script:authStore.sessions.Remove($sKey)
            }
          }
          Save-AuthStore
          Add-AdminAuditLog ([string]$userObj.display_name) 'PLAYER_CHANGE_PASSWORD' ([string]$userObj.display_name) 'Updated own password in Settings' | Out-Null
          Send-JsonResponse $context.Response 200 @{ ok = $true }
          continue
        }

        if ($relativePath -eq 'api/auth/request-year-change') {
          $token = if ($null -ne $body.sessionToken) { ([string]$body.sessionToken).Trim() } else { '' }
          $userObj = Resolve-AuthSession $token
          if ($null -eq $userObj -and $body.ContainsKey('username')) {
            $uDisplay = Normalize-AuthUsername ([string]$body.username)
            $uKey = $uDisplay.ToLowerInvariant()
            if ($uKey -and $script:authStore.users.ContainsKey($uKey)) {
              $userObj = $script:authStore.users[$uKey]
            } elseif ($uKey -and $body.provider -eq 'supabase' -and $uDisplay.Length -ge 1 -and $uDisplay.Length -le 24) {
              $curInit = 4
              if ($body.ContainsKey('currentYear') -and $null -ne $body.currentYear) {
                [void][int]::TryParse([string]$body.currentYear, [ref]$curInit)
                if ($curInit -lt 1 -or $curInit -gt 4) { $curInit = 4 }
              }
              $uid = [int64]$script:authStore.nextUserId
              $script:authStore.nextUserId = $uid + 1
              $userObj = @{
                id = $uid
                username_key = $uKey
                display_name = $uDisplay
                password_hash = ''
                best_score = 0
                total_kills = 0
                total_correct = 0
                total_answers = 0
                topic_progress = @{}
                skill_progress = @{}
                review_store = @{ academicYear = $curInit }
                achievements = @{}
                is_suspended = $false
                source = 'supabase'
                created_at = $nowIso
                updated_at = $nowIso
                last_login_at = $nowIso
              }
              $script:authStore.users[$uKey] = $userObj
            }
          }
          if ($null -eq $userObj) {
            Send-JsonResponse $context.Response 401 @{ ok = $false; code = 'SESSION_INVALID'; error = 'Your session has expired. Please log in again.' }
            continue
          }
          $reqYr = 0
          [void][int]::TryParse([string]$body.requestedYear, [ref]$reqYr)
          if ($reqYr -lt 1 -or $reqYr -gt 4) {
            Send-JsonResponse $context.Response 400 @{ ok = $false; error = 'Choose a valid academic year between 1st and 4th Year.' }
            continue
          }
          $curYr = 4
          if ($userObj.review_store -is [System.Collections.IDictionary] -and $userObj.review_store.ContainsKey('academicYear')) {
            [void][int]::TryParse([string]$userObj.review_store.academicYear, [ref]$curYr)
            if ($curYr -lt 1 -or $curYr -gt 4) { $curYr = 4 }
          }
          if ($reqYr -eq $curYr) {
            Send-JsonResponse $context.Response 400 @{ ok = $false; error = 'You are already set to that Year Level.' }
            continue
          }
          $reason = if ($null -ne $body.reason) { ([string]$body.reason).Trim() } else { '' }
          if ($reason.Length -gt 180) { $reason = $reason.Substring(0, 180) }
          $uk = [string]$userObj.username_key
          $rlYrChg = Test-RateLimit "yearchg:${uk}" 3 600 $true
          if (-not $rlYrChg.allowed) {
            Send-RateLimitResponse $context.Response $rlYrChg.retryAfter "Too many year change requests. Please wait $($rlYrChg.retryAfter) seconds and try again."
            continue
          }
          $existingYrReq = $null
          foreach ($item in $script:authStore.yearRequests) {
            if ($item -and $item.username_key -eq $uk -and $item.status -eq 'pending') {
              $existingYrReq = $item
              break
            }
          }
          if ($null -ne $existingYrReq) {
            $existingYrReq.current_year = $curYr
            $existingYrReq.requested_year = $reqYr
            $existingYrReq.reason = $reason
            $existingYrReq.created_at = $nowIso
            $savedReq = $existingYrReq
          } else {
            $yId = [int64]$script:authStore.nextYearReqId
            $script:authStore.nextYearReqId = $yId + 1
            $savedReq = @{
              id = $yId
              username_key = $uk
              display_name = [string]$userObj.display_name
              current_year = $curYr
              requested_year = $reqYr
              reason = $reason
              status = 'pending'
              created_at = $nowIso
              resolved_at = $null
              resolved_by = $null
            }
            [void]$script:authStore.yearRequests.Add($savedReq)
          }
          Save-AuthStore
          $yrDetail = "Requested Year $curYr -> Year $reqYr" + $(if ($reason) { " ($reason)" } else { '' })
          Add-AdminAuditLog ([string]$userObj.display_name) 'YEAR_CHANGE_REQUEST' ([string]$userObj.display_name) $yrDetail | Out-Null
          Send-JsonResponse $context.Response 200 @{
            ok = $true
            request = $savedReq
            message = "Year change request sent! Waiting for admin approval to switch to Year $reqYr."
          }
          continue
        }

        if ($relativePath -eq 'api/auth/mirror-account') {
          $uPayload = if ($body.ContainsKey('user') -and $body.user -is [System.Collections.IDictionary]) { $body.user } else { $null }
          if ($null -eq $uPayload) {
            Send-JsonResponse $context.Response 400 @{ ok = $false; error = 'Missing user payload.' }
            continue
          }
          $displayName = Normalize-AuthUsername ([string]$uPayload.display_name)
          $usernameKey = Get-AuthUsernameKey ([string]$uPayload.username_key)
          if (-not $usernameKey) { $usernameKey = $displayName.ToLowerInvariant() }
          if (-not $usernameKey) {
            Send-JsonResponse $context.Response 400 @{ ok = $false; error = 'Missing username.' }
            continue
          }
          $yr = 4
          if ($body.ContainsKey('academicYear') -and $null -ne $body.academicYear) {
            [void][int]::TryParse([string]$body.academicYear, [ref]$yr)
            if ($yr -lt 1 -or $yr -gt 4) { $yr = 4 }
          } elseif ($uPayload.ContainsKey('review_store') -and $uPayload.review_store -is [System.Collections.IDictionary] -and $uPayload.review_store.ContainsKey('academicYear')) {
            [void][int]::TryParse([string]$uPayload.review_store.academicYear, [ref]$yr)
            if ($yr -lt 1 -or $yr -gt 4) { $yr = 4 }
          }
          $src = if ($body.ContainsKey('source') -and -not [string]::IsNullOrWhiteSpace([string]$body.source)) { [string]$body.source } else { 'supabase' }

          if ($script:authStore.users.ContainsKey($usernameKey)) {
            $existing = $script:authStore.users[$usernameKey]
            if ($displayName) { $existing.display_name = $displayName }
            if ($uPayload.ContainsKey('best_score')) { $existing.best_score = [Math]::Max([int]($existing.best_score), [int]($uPayload.best_score)) }
            if ($uPayload.ContainsKey('total_kills')) { $existing.total_kills = [Math]::Max([int]($existing.total_kills), [int]($uPayload.total_kills)) }
            if ($uPayload.ContainsKey('total_correct')) { $existing.total_correct = [Math]::Max([int]($existing.total_correct), [int]($uPayload.total_correct)) }
            if ($uPayload.ContainsKey('total_answers')) { $existing.total_answers = [Math]::Max([int]($existing.total_answers), [int]($uPayload.total_answers)) }
            if ($uPayload.ContainsKey('topic_progress') -and $null -ne $uPayload.topic_progress) { $existing.topic_progress = $uPayload.topic_progress }
            if ($uPayload.ContainsKey('skill_progress') -and $null -ne $uPayload.skill_progress) { $existing.skill_progress = $uPayload.skill_progress }
            if ($uPayload.ContainsKey('review_store') -and $null -ne $uPayload.review_store) {
              $existing.review_store = $uPayload.review_store
            }
            if (-not ($existing.review_store -is [System.Collections.IDictionary])) { $existing.review_store = @{} }
            $lockedMirrorYear = 0
            if ($existing.review_store.ContainsKey('academicYear')) {
              [void][int]::TryParse([string]$existing.review_store.academicYear, [ref]$lockedMirrorYear)
            }
            if ($lockedMirrorYear -lt 1 -or $lockedMirrorYear -gt 4) {
              $existing.review_store['academicYear'] = $yr
            }
            if ($uPayload.ContainsKey('achievements') -and $null -ne $uPayload.achievements) { $existing.achievements = $uPayload.achievements }
            $existing.last_login_at = $nowIso
            $existing.updated_at = $nowIso
            if (-not $existing.ContainsKey('password_hash') -or [string]::IsNullOrWhiteSpace([string]$existing.password_hash)) {
              $existing.source = $src
            }
          } else {
            $uid = [int64]$script:authStore.nextUserId
            $script:authStore.nextUserId = $uid + 1
            $rs = if ($uPayload.ContainsKey('review_store') -and $uPayload.review_store -is [System.Collections.IDictionary]) { $uPayload.review_store } else { @{} }
            $rs['academicYear'] = $yr
            $script:authStore.users[$usernameKey] = @{
              id = $uid
              username_key = $usernameKey
              display_name = if ($displayName) { $displayName } else { $usernameKey }
              password_hash = ''
              best_score = if ($uPayload.ContainsKey('best_score')) { [int]$uPayload.best_score } else { 0 }
              total_kills = if ($uPayload.ContainsKey('total_kills')) { [int]$uPayload.total_kills } else { 0 }
              total_correct = if ($uPayload.ContainsKey('total_correct')) { [int]$uPayload.total_correct } else { 0 }
              total_answers = if ($uPayload.ContainsKey('total_answers')) { [int]$uPayload.total_answers } else { 0 }
              topic_progress = if ($uPayload.ContainsKey('topic_progress') -and $null -ne $uPayload.topic_progress) { $uPayload.topic_progress } else { @{} }
              skill_progress = if ($uPayload.ContainsKey('skill_progress') -and $null -ne $uPayload.skill_progress) { $uPayload.skill_progress } else { @{} }
              review_store = $rs
              achievements = if ($uPayload.ContainsKey('achievements') -and $null -ne $uPayload.achievements) { $uPayload.achievements } else { @{} }
              is_suspended = $false
              source = $src
              created_at = if ($uPayload.ContainsKey('created_at') -and $uPayload.created_at) { [string]$uPayload.created_at } else { $nowIso }
              updated_at = $nowIso
              last_login_at = $nowIso
            }
          }
          Save-AuthStore
          Send-JsonResponse $context.Response 200 @{ ok = $true }
          continue
        }

        Send-JsonResponse $context.Response 404 @{ ok = $false; error = 'Unknown auth endpoint.' }
        continue
      }

      if ($relativePath.StartsWith('api/admin/') -and $context.Request.HttpMethod -eq 'POST') {
        $reader = New-Object IO.StreamReader($context.Request.InputStream, [Text.Encoding]::UTF8)
        $rawBody = $reader.ReadToEnd()
        $reader.Close()
        $body = @{}
        if (-not [string]::IsNullOrWhiteSpace($rawBody)) {
          try {
            $parsed = Convert-PsObjToHashtable ($rawBody | ConvertFrom-Json)
            if ($parsed -is [hashtable]) { $body = $parsed }
          } catch {
            Send-JsonResponse $context.Response 400 @{ ok = $false; error = 'Invalid JSON request body.' }
            continue
          }
        }
        $nowIso = [DateTime]::UtcNow.ToString('o')

        if ($relativePath -eq 'api/admin/login') {
          $clientIp = Get-ClientIpKey $context.Request
          $rlAdmin = Test-RateLimit "admin-login:${clientIp}" 5 900 $false
          if (-not $rlAdmin.allowed) {
            Send-RateLimitResponse $context.Response $rlAdmin.retryAfter "Too many failed admin login attempts. Please wait $($rlAdmin.retryAfter) seconds and try again."
            continue
          }
          $u = if ($null -ne $body.username) { ([string]$body.username).Trim() } else { '' }
          $p = if ($null -ne $body.password) { [string]$body.password } else { '' }
          if ($u.ToLowerInvariant() -ne $script:adminUsername.ToLowerInvariant() -or $p -ne $script:adminPassword) {
            [void](Test-RateLimit "admin-login:${clientIp}" 5 900 $true)
            Add-AdminAuditLog $u 'ADMIN_LOGIN_FAILED' 'system' 'Invalid credentials' | Out-Null
            Send-JsonResponse $context.Response 401 @{ ok = $false; code = 'INVALID_ADMIN_CREDENTIALS'; error = 'Invalid administrator credentials.' }
            continue
          }
          Clear-RateLimit "admin-login:${clientIp}"
          $tok = New-RandomHex 32
          $tokHash = Get-Sha256Hex $tok
          $exp = [DateTime]::UtcNow.AddHours(12)
          $script:adminSessions[$tokHash] = @{
            username = $script:adminUsername
            role = 'superadmin'
            createdAt = [DateTime]::UtcNow
            expiresAt = $exp
          }
          Add-AdminAuditLog $script:adminUsername 'ADMIN_LOGIN' 'console' 'Authenticated via local server' | Out-Null
          Send-JsonResponse $context.Response 200 @{
            ok = $true
            admin_token = $tok
            expires_at = $exp.ToString('o')
            admin = @{ username = $script:adminUsername; role = 'superadmin' }
          }
          continue
        }

        if ($relativePath -eq 'api/admin/logout') {
          $tok = ([string]$body.adminToken).Trim()
          if ($tok.Length -ge 32) {
            $tokHash = Get-Sha256Hex $tok
            if ($script:adminSessions.ContainsKey($tokHash)) {
              $actor = $script:adminSessions[$tokHash].username
              $script:adminSessions.Remove($tokHash)
              Add-AdminAuditLog $actor 'ADMIN_LOGOUT' 'console' 'Session terminated' | Out-Null
            }
          }
          Send-JsonResponse $context.Response 200 @{ ok = $true }
          continue
        }

        $adminSess = Resolve-AdminSession ([string]$body.adminToken)
        if ($null -eq $adminSess) {
          Send-JsonResponse $context.Response 401 @{ ok = $false; code = 'ADMIN_UNAUTHORIZED'; error = 'Admin session expired or unauthorized.' }
          continue
        }

        if ($relativePath -eq 'api/admin/overview') {
          $nowMs = Get-NowMs
          Prune-MpState $nowMs
          $sessionCountByUser = @{}
          $activeSessionsTotal = 0
          foreach ($sEntry in @($script:authStore.sessions.Values)) {
            $expDate = [DateTime]::MinValue
            if ($sEntry -and [DateTime]::TryParse([string]$sEntry.expires_at, [ref]$expDate) -and $expDate.ToUniversalTime() -gt [DateTime]::UtcNow) {
              $activeSessionsTotal++
              $uk = Get-SessionUserKey $sEntry
              if ($uk) {
                $sessionCountByUser[$uk] = if ($sessionCountByUser.ContainsKey($uk)) { [int]$sessionCountByUser[$uk] + 1 } else { 1 }
              }
            }
          }
          $usersList = [System.Collections.ArrayList]::new()
          foreach ($uObj in $script:authStore.users.Values) {
            $uk = [string]$uObj.username_key
            $ser = Serialize-AuthUser $uObj
            $ser.active_sessions = if ($sessionCountByUser.ContainsKey($uk)) { $sessionCountByUser[$uk] } else { 0 }
            [void]$usersList.Add($ser)
          }
          $roomsList = [System.Collections.ArrayList]::new()
          foreach ($r in $script:mpRooms.Values) { [void]$roomsList.Add($r) }
          $playersList = [System.Collections.ArrayList]::new()
          foreach ($p in $script:mpPlayers.Values) {
            [void]$playersList.Add(@{
              clientId = $p.clientId
              username = $p.username
              avatar = $p.avatar
              status = $p.status
              roomCode = $p.roomCode
              ageMs = [Math]::Max(0, $nowMs - [int64]$p.lastSeenMs)
            })
          }
          $uptimeSec = [int][Math]::Floor(([DateTime]::UtcNow - $script:serverStartedAt).TotalSeconds)
          Send-JsonResponse $context.Response 200 @{
            ok = $true
            server = @{
              provider = 'local'
              rateLimiting = $true
              uptimeSeconds = $uptimeSec
              startedAt = $script:serverStartedAt.ToString('o')
              authStoreFile = $script:authStoreFile
              activeSessions = $activeSessionsTotal
              adminSessions = $script:adminSessions.Count
            }
            users = $usersList
            resetRequests = @($script:authStore.resetRequests)
            yearRequests = @($script:authStore.yearRequests)
            pvpLeaderboard = @($script:mpPvpLeaderboard.Values)
            mpPlayers = $playersList
            mpRooms = $roomsList
            auditLogs = @($script:authStore.auditLogs)
            securityNotice = $script:authStore.securityNotice
          }
          continue
        }

        if ($relativePath -eq 'api/admin/set-security-notice') {
          $isActive = [bool]$body.active
          $rawSev = if ($null -ne $body.severity) { ([string]$body.severity).Trim().ToLowerInvariant() } else { 'info' }
          $sev = if ($rawSev -in @('info', 'warning', 'critical')) { $rawSev } else { 'info' }
          $noticeTitle = if ($null -ne $body.title) { ([string]$body.title).Trim() } else { '' }
          if ($noticeTitle.Length -gt 120) { $noticeTitle = $noticeTitle.Substring(0, 120) }
          $noticeMsg = if ($null -ne $body.message) { ([string]$body.message).Trim() } else { '' }
          if ($noticeMsg.Length -gt 400) { $noticeMsg = $noticeMsg.Substring(0, 400) }
          $effectiveActive = $isActive -and (-not [string]::IsNullOrWhiteSpace($noticeTitle) -or -not [string]::IsNullOrWhiteSpace($noticeMsg))
          $script:authStore.securityNotice = @{
            active = $effectiveActive
            severity = $sev
            title = $noticeTitle
            message = $noticeMsg
            updated_at = $nowIso
            updated_by = $adminSess.username
          }
          Save-AuthStore
          $detailTxt = if ($effectiveActive) {
            "Published $($sev.ToUpperInvariant()) notice: $(if ($noticeTitle) { $noticeTitle } else { $noticeMsg })"
          } else {
            'Cleared active security notice'
          }
          Add-AdminAuditLog $adminSess.username 'SECURITY_NOTICE_UPDATED' 'System Banner' $detailTxt | Out-Null
          Send-JsonResponse $context.Response 200 @{ ok = $true; notice = $script:authStore.securityNotice }
          continue
        }

        if ($relativePath -eq 'api/admin/log-activity') {
          $actName = if ($null -ne $body.action) { ([string]$body.action).Trim() } else { '' }
          $tgt = if ($null -ne $body.target) { ([string]$body.target).Trim() } else { 'system' }
          $det = if ($null -ne $body.detail) { ([string]$body.detail).Trim() } else { '' }
          if (-not $actName) {
            Send-JsonResponse $context.Response 400 @{ ok = $false; error = 'Missing activity action.' }
            continue
          }
          $entry = Add-AdminAuditLog $adminSess.username $actName $tgt $det
          Send-JsonResponse $context.Response 200 @{ ok = $true; entry = $entry }
          continue
        }

        if ($relativePath -eq 'api/admin/create-user') {
          $displayName = Normalize-AuthUsername ([string]$body.username)
          $usernameKey = $displayName.ToLowerInvariant()
          $password = if ($null -ne $body.password) { [string]$body.password } else { '' }
          $yr = 4
          if ($body.ContainsKey('academicYear') -and $null -ne $body.academicYear) {
            [void][int]::TryParse([string]$body.academicYear, [ref]$yr)
            if ($yr -lt 1 -or $yr -gt 4) { $yr = 4 }
          }
          if ($displayName.Length -lt 1 -or $displayName.Length -gt 24) {
            Send-JsonResponse $context.Response 400 @{ ok = $false; error = 'Username must be between 1 and 24 characters.' }
            continue
          }
          if ($password.Length -lt 6 -or $password.Length -gt 72 -or [string]::IsNullOrWhiteSpace($password)) {
            Send-JsonResponse $context.Response 400 @{ ok = $false; error = 'Password must be between 6 and 72 characters.' }
            continue
          }
          if ($script:authStore.users.ContainsKey($usernameKey)) {
            Send-JsonResponse $context.Response 409 @{ ok = $false; error = 'That username already exists.' }
            continue
          }
          $uid = [int64]$script:authStore.nextUserId
          $script:authStore.nextUserId = $uid + 1
          $newUser = @{
            id = $uid
            username_key = $usernameKey
            display_name = $displayName
            password_hash = (New-PasswordHash $password)
            best_score = 0
            total_kills = 0
            total_correct = 0
            total_answers = 0
            topic_progress = @{}
            skill_progress = @{}
            review_store = @{ academicYear = $yr }
            achievements = @{}
            is_suspended = $false
            source = 'local'
            created_at = $nowIso
            updated_at = $nowIso
            last_login_at = $nowIso
          }
          $script:authStore.users[$usernameKey] = $newUser
          Save-AuthStore
          Add-AdminAuditLog $adminSess.username 'CREATE_ACCOUNT' $displayName "Created new Year $yr player account" | Out-Null
          Send-JsonResponse $context.Response 200 @{ ok = $true; user = (Serialize-AuthUser $newUser) }
          continue
        }

        if ($relativePath -eq 'api/admin/reset-password') {
          $uk = Get-AuthUsernameKey ([string]$body.usernameKey)
          if (-not $uk -or -not $script:authStore.users.ContainsKey($uk)) {
            Send-JsonResponse $context.Response 404 @{ ok = $false; error = 'User account not found.' }
            continue
          }
          $newPass = if (-not [string]::IsNullOrWhiteSpace([string]$body.newPassword)) { [string]$body.newPassword } else { 'BB-' + (New-RandomHex 4).ToUpperInvariant() }
          if ($newPass.Length -lt 6 -or $newPass.Length -gt 72) {
            Send-JsonResponse $context.Response 400 @{ ok = $false; error = 'New password must be 6-72 characters.' }
            continue
          }
          $uObj = $script:authStore.users[$uk]
          $uObj.password_hash = New-PasswordHash $newPass
          $uObj.must_change_password = $true
          $uObj.updated_at = $nowIso
          $revoked = 0
          foreach ($sKey in @($script:authStore.sessions.Keys)) {
            if ((Get-SessionUserKey $script:authStore.sessions[$sKey]) -eq $uk) {
              $script:authStore.sessions.Remove($sKey)
              $revoked++
            }
          }
          foreach ($r in $script:authStore.resetRequests) {
            if ($r -and $r.username_key -eq $uk -and $r.status -eq 'pending') {
              $r.status = 'resolved'
              $r.resolved_at = $nowIso
              $r.resolved_by = $adminSess.username
            }
          }
          Save-AuthStore
          Add-AdminAuditLog $adminSess.username 'CHANGE_PASSWORD' $uObj.display_name "Set new password & signed out $revoked active login(s)" | Out-Null
          Send-JsonResponse $context.Response 200 @{ ok = $true; temporaryPassword = $newPass; revokedSessions = $revoked }
          continue
        }

        if ($relativePath -eq 'api/admin/dismiss-reset-request') {
          $reqId = 0L
          [void][int64]::TryParse([string]$body.requestId, [ref]$reqId)
          foreach ($r in $script:authStore.resetRequests) {
            if ($r -and [int64]$r.id -eq $reqId -and $r.status -eq 'pending') {
              $r.status = 'dismissed'
              $r.resolved_at = $nowIso
              $r.resolved_by = $adminSess.username
              break
            }
          }
          Save-AuthStore
          Add-AdminAuditLog $adminSess.username 'DISMISS_RESET_REQ' "Request #$reqId" 'Dismissed forgot-password request' | Out-Null
          Send-JsonResponse $context.Response 200 @{ ok = $true }
          continue
        }

        if ($relativePath -eq 'api/admin/set-user-year') {
          $uk = Get-AuthUsernameKey ([string]$body.usernameKey)
          if (-not $uk -or -not $script:authStore.users.ContainsKey($uk)) {
            Send-JsonResponse $context.Response 404 @{ ok = $false; error = 'User account not found.' }
            continue
          }
          $yr = 4
          [void][int]::TryParse([string]$body.academicYear, [ref]$yr)
          if ($yr -lt 1 -or $yr -gt 4) { $yr = 4 }
          $uObj = $script:authStore.users[$uk]
          if (-not ($uObj.review_store -is [System.Collections.IDictionary])) { $uObj.review_store = @{} }
          $uObj.review_store['academicYear'] = $yr
          $uObj.updated_at = $nowIso
          foreach ($yReq in $script:authStore.yearRequests) {
            if ($yReq -and $yReq.username_key -eq $uk -and $yReq.status -eq 'pending') {
              $yReq.status = 'approved'
              $yReq.resolved_at = $nowIso
              $yReq.resolved_by = $adminSess.username
            }
          }
          Save-AuthStore
          Add-AdminAuditLog $adminSess.username 'CHANGE_YEAR_LEVEL' $uObj.display_name "Changed academic year level to Year $yr" | Out-Null
          Send-JsonResponse $context.Response 200 @{ ok = $true; academicYear = $yr }
          continue
        }

        if ($relativePath -eq 'api/admin/approve-year-request') {
          $reqId = 0L
          [void][int64]::TryParse([string]$body.requestId, [ref]$reqId)
          $targetReq = $null
          foreach ($yReq in $script:authStore.yearRequests) {
            if ($yReq -and [int64]$yReq.id -eq $reqId) { $targetReq = $yReq; break }
          }
          if ($null -eq $targetReq) {
            Send-JsonResponse $context.Response 404 @{ ok = $false; error = 'Year change request not found.' }
            continue
          }
          $uk = [string]$targetReq.username_key
          if (-not $uk -or -not $script:authStore.users.ContainsKey($uk)) {
            Send-JsonResponse $context.Response 404 @{ ok = $false; error = 'Player account no longer exists.' }
            continue
          }
          $newYr = [int]$targetReq.requested_year
          $uObj = $script:authStore.users[$uk]
          if (-not ($uObj.review_store -is [System.Collections.IDictionary])) { $uObj.review_store = @{} }
          $uObj.review_store['academicYear'] = $newYr
          $uObj.updated_at = $nowIso
          $targetReq.status = 'approved'
          $targetReq.resolved_at = $nowIso
          $targetReq.resolved_by = $adminSess.username
          Save-AuthStore
          Add-AdminAuditLog $adminSess.username 'APPROVE_YEAR_REQ' $uObj.display_name "Approved Year $($targetReq.current_year) -> Year $newYr" | Out-Null
          Send-JsonResponse $context.Response 200 @{ ok = $true; academicYear = $newYr }
          continue
        }

        if ($relativePath -eq 'api/admin/dismiss-year-request') {
          $reqId = 0L
          [void][int64]::TryParse([string]$body.requestId, [ref]$reqId)
          foreach ($yReq in $script:authStore.yearRequests) {
            if ($yReq -and [int64]$yReq.id -eq $reqId -and $yReq.status -eq 'pending') {
              $yReq.status = 'dismissed'
              $yReq.resolved_at = $nowIso
              $yReq.resolved_by = $adminSess.username
              break
            }
          }
          Save-AuthStore
          Add-AdminAuditLog $adminSess.username 'DISMISS_YEAR_REQ' "Request #$reqId" 'Dismissed year change request' | Out-Null
          Send-JsonResponse $context.Response 200 @{ ok = $true }
          continue
        }

        if ($relativePath -eq 'api/admin/toggle-suspend') {
          $uk = Get-AuthUsernameKey ([string]$body.usernameKey)
          if (-not $uk -or -not $script:authStore.users.ContainsKey($uk)) {
            Send-JsonResponse $context.Response 404 @{ ok = $false; error = 'User account not found.' }
            continue
          }
          $suspended = [bool]$body.suspended
          $uObj = $script:authStore.users[$uk]
          $uObj.is_suspended = $suspended
          $uObj.updated_at = $nowIso
          $revoked = 0
          if ($suspended) {
            foreach ($sKey in @($script:authStore.sessions.Keys)) {
              if ((Get-SessionUserKey $script:authStore.sessions[$sKey]) -eq $uk) {
                $script:authStore.sessions.Remove($sKey)
                $revoked++
              }
            }
          }
          Save-AuthStore
          $actName = if ($suspended) { 'LOCK_ACCOUNT' } else { 'UNLOCK_ACCOUNT' }
          $actDetail = if ($suspended) { "Locked account & ended $revoked active login(s)" } else { 'Unlocked account access' }
          Add-AdminAuditLog $adminSess.username $actName $uObj.display_name $actDetail | Out-Null
          Send-JsonResponse $context.Response 200 @{ ok = $true; is_suspended = $suspended }
          continue
        }

        if ($relativePath -eq 'api/admin/revoke-sessions') {
          $uk = Get-AuthUsernameKey ([string]$body.usernameKey)
          $allFlag = [bool]$body.all
          $revoked = 0
          foreach ($sKey in @($script:authStore.sessions.Keys)) {
            if ($allFlag -or ($uk -and (Get-SessionUserKey $script:authStore.sessions[$sKey]) -eq $uk)) {
              $script:authStore.sessions.Remove($sKey)
              $revoked++
            }
          }
          Save-AuthStore
          $tgt = if ($allFlag) { 'All Players' } else { $uk }
          Add-AdminAuditLog $adminSess.username 'FORCE_LOGOUT' $tgt "Signed out $revoked active login(s)" | Out-Null
          Send-JsonResponse $context.Response 200 @{ ok = $true; revokedSessions = $revoked }
          continue
        }

        if ($relativePath -eq 'api/admin/reset-progress') {
          $uk = Get-AuthUsernameKey ([string]$body.usernameKey)
          if (-not $uk -or -not $script:authStore.users.ContainsKey($uk)) {
            Send-JsonResponse $context.Response 404 @{ ok = $false; error = 'User account not found.' }
            continue
          }
          $uObj = $script:authStore.users[$uk]
          $yrKeep = 4
          if ($uObj.review_store -is [System.Collections.IDictionary] -and $uObj.review_store.ContainsKey('academicYear')) {
            [void][int]::TryParse([string]$uObj.review_store.academicYear, [ref]$yrKeep)
            if ($yrKeep -lt 1 -or $yrKeep -gt 4) { $yrKeep = 4 }
          }
          $uObj.best_score = 0
          $uObj.total_kills = 0
          $uObj.total_correct = 0
          $uObj.total_answers = 0
          $uObj.topic_progress = @{}
          $uObj.skill_progress = @{}
          $uObj.review_store = @{ academicYear = $yrKeep }
          $uObj.achievements = @{}
          $uObj.updated_at = $nowIso
          if ($script:mpPvpLeaderboard.ContainsKey($uk)) { $script:mpPvpLeaderboard.Remove($uk) }
          Save-AuthStore
          Add-AdminAuditLog $adminSess.username 'RESET_PROGRESS' $uObj.display_name 'Cleared game stats, tracker, and scores' | Out-Null
          Send-JsonResponse $context.Response 200 @{ ok = $true }
          continue
        }

        if ($relativePath -eq 'api/admin/delete-user') {
          $uk = Get-AuthUsernameKey ([string]$body.usernameKey)
          if (-not $uk -or -not $script:authStore.users.ContainsKey($uk)) {
            Send-JsonResponse $context.Response 404 @{ ok = $false; error = 'User account not found.' }
            continue
          }
          $display = [string]$script:authStore.users[$uk].display_name
          $script:authStore.users.Remove($uk)
          foreach ($sKey in @($script:authStore.sessions.Keys)) {
            if ((Get-SessionUserKey $script:authStore.sessions[$sKey]) -eq $uk) { $script:authStore.sessions.Remove($sKey) }
          }
          if ($script:mpPvpLeaderboard.ContainsKey($uk)) { $script:mpPvpLeaderboard.Remove($uk) }
          Save-AuthStore
          Add-AdminAuditLog $adminSess.username 'DELETE_ACCOUNT' $display 'Permanently deleted account and records' | Out-Null
          Send-JsonResponse $context.Response 200 @{ ok = $true }
          continue
        }

        if ($relativePath -eq 'api/admin/close-room') {
          $rCode = ([string]$body.roomCode).Trim().ToUpperInvariant()
          if (-not $rCode -or -not $script:mpRooms.ContainsKey($rCode)) {
            Send-JsonResponse $context.Response 404 @{ ok = $false; error = 'Multiplayer room not found.' }
            continue
          }
          Close-MpRoom $rCode 'Room closed by system administrator.' (Get-NowMs)
          Add-AdminAuditLog $adminSess.username 'FORCE_CLOSE_ROOM' $rCode 'Terminated active multiplayer lobby' | Out-Null
          Send-JsonResponse $context.Response 200 @{ ok = $true }
          continue
        }

        if ($relativePath -eq 'api/admin/delete-pvp-entry') {
          $pKey = ([string]$body.playerName).Trim().ToLowerInvariant()
          if ($pKey -and $script:mpPvpLeaderboard.ContainsKey($pKey)) {
            $script:mpPvpLeaderboard.Remove($pKey)
            Add-AdminAuditLog $adminSess.username 'PURGE_PVP_ENTRY' $pKey 'Removed 1v1 leaderboard entry' | Out-Null
          }
          Send-JsonResponse $context.Response 200 @{ ok = $true }
          continue
        }

        Send-JsonResponse $context.Response 404 @{ ok = $false; error = 'Unknown admin endpoint.' }
        continue
      }

      if ($relativePath -eq 'api/mp/state' -and $context.Request.HttpMethod -eq 'GET') {
        $nowMs = Get-NowMs
        Prune-MpState $nowMs
        $sinceSeq = 0
        [void][int]::TryParse($context.Request.QueryString['since'], [ref]$sinceSeq)
        $playersOut = [System.Collections.ArrayList]::new()
        foreach ($p in $script:mpPlayers.Values) {
          [void]$playersOut.Add(@{
            clientId = $p.clientId
            username = $p.username
            avatar = $p.avatar
            status = $p.status
            roomCode = $p.roomCode
            ageMs = [Math]::Max(0, $nowMs - [int64]$p.lastSeenMs)
          })
        }
        $publicRoomsOut = [System.Collections.ArrayList]::new()
        $allRoomsOut = @{}
        foreach ($r in $script:mpRooms.Values) {
          $allRoomsOut[$r.code] = $r
          if ($r.visibility -eq 'public' -and $r.status -eq 'waiting' -and $null -eq $r.guest -and $r.host.connected) {
            [void]$publicRoomsOut.Add(@{
              code = $r.code
              hostClientId = $r.host.clientId
              hostName = $r.host.username
              hostAvatar = $r.host.avatar
              arenaId = $r.arenaId
              arenaName = $r.arenaName
              category = $r.category
              yearLevel = if ($r.ContainsKey('yearLevel') -and $r.yearLevel) { [int]$r.yearLevel } else { 4 }
              status = $r.status
              playerCount = 1
              maxPlayers = 2
              createdAt = $r.createdAtMs
            })
          }
        }
        $eventsOut = [System.Collections.ArrayList]::new()
        foreach ($ev in $script:mpEvents) {
          if ($ev.seq -gt $sinceSeq) { [void]$eventsOut.Add($ev) }
        }
        Send-JsonResponse $context.Response 200 @{
          ok = $true
          seq = $script:mpSeq
          serverTime = $nowMs
          players = $playersOut
          publicRooms = $publicRoomsOut
          rooms = $allRoomsOut
          closedCodes = @($script:mpClosedRooms.Keys)
          events = $eventsOut
        }
        continue
      }

      if ($relativePath -eq 'api/mp/pvp-leaderboard' -and $context.Request.HttpMethod -eq 'GET') {
        $entriesOut = @($script:mpPvpLeaderboard.Values)
        Send-JsonResponse $context.Response 200 @{ ok = $true; entries = $entriesOut }
        continue
      }

      if ($relativePath -eq 'api/mp/pvp-reset' -and $context.Request.HttpMethod -eq 'POST') {
        $reader = New-Object IO.StreamReader($context.Request.InputStream, [Text.Encoding]::UTF8)
        $rawBody = $reader.ReadToEnd()
        $reader.Close()
        if (-not [string]::IsNullOrWhiteSpace($rawBody)) {
          $b = Convert-PsObjToHashtable ($rawBody | ConvertFrom-Json)
          $pKey = ([string]$b.playerName).Trim().ToLowerInvariant()
          if ($pKey -and $script:mpPvpLeaderboard.ContainsKey($pKey)) {
            $script:mpPvpLeaderboard.Remove($pKey)
          }
        }
        Send-JsonResponse $context.Response 200 @{ ok = $true }
        continue
      }

      if ($relativePath -eq 'api/mp/pvp-result' -and $context.Request.HttpMethod -eq 'POST') {
        $reader = New-Object IO.StreamReader($context.Request.InputStream, [Text.Encoding]::UTF8)
        $rawBody = $reader.ReadToEnd()
        $reader.Close()
        if ([string]::IsNullOrWhiteSpace($rawBody)) {
          Send-JsonResponse $context.Response 400 @{ ok = $false; error = 'Empty request body.' }
          continue
        }
        $b = Convert-PsObjToHashtable ($rawBody | ConvertFrom-Json)
        $pName = ([string]$b.playerName).Trim()
        $pKey = $pName.ToLowerInvariant()
        $mId = ([string]$b.matchId).Trim()
        $outcome = ([string]$b.outcome).Trim().ToLowerInvariant()
        if ([string]::IsNullOrWhiteSpace($pKey) -or [string]::IsNullOrWhiteSpace($mId) -or @('won', 'lost', 'draw') -notcontains $outcome) {
          Send-JsonResponse $context.Response 400 @{ ok = $false; error = 'Invalid 1v1 result payload.' }
          continue
        }
        if (-not $script:mpPvpLeaderboard.ContainsKey($pKey)) {
          $script:mpPvpLeaderboard[$pKey] = @{
            player_name = $pName
            rating = 1000
            wins = 0
            losses = 0
            draws = 0
            matches_played = 0
            damage_dealt = 0
            correct_answers = 0
            total_answers = 0
            accuracy = 0
            win_rate = 0
            last_match_id = ''
            updated_at = [DateTime]::UtcNow.ToString('o')
          }
        }
        $rec = $script:mpPvpLeaderboard[$pKey]
        if ($rec.last_match_id -ne $mId) {
          $delta = if ($outcome -eq 'won') { 25 } elseif ($outcome -eq 'draw') { 5 } else { -15 }
          $rec.player_name = $pName
          $rec.rating = [Math]::Max(100, [int]$rec.rating + $delta)
          if ($outcome -eq 'won') { $rec.wins++ }
          elseif ($outcome -eq 'draw') { $rec.draws++ }
          else { $rec.losses++ }
          $rec.matches_played = [int]$rec.wins + [int]$rec.losses + [int]$rec.draws
          $rec.damage_dealt = [int]$rec.damage_dealt + [Math]::Max(0, [int]$b.damageDealt)
          $rec.correct_answers = [int]$rec.correct_answers + [Math]::Max(0, [int]$b.correctAnswers)
          $rec.total_answers = [int]$rec.total_answers + [Math]::Max(0, [int]$b.totalAnswers)
          $rec.accuracy = if ($rec.total_answers -gt 0) { [int][Math]::Floor(100.0 * $rec.correct_answers / $rec.total_answers) } else { 0 }
          $rec.win_rate = if ($rec.matches_played -gt 0) { [int][Math]::Floor(100.0 * $rec.wins / $rec.matches_played) } else { 0 }
          $rec.last_match_id = $mId
          $rec.updated_at = [DateTime]::UtcNow.ToString('o')
        }
        Send-JsonResponse $context.Response 200 @{ ok = $true; entry = $rec }
        continue
      }

      if ($relativePath -eq 'api/mp/event' -and $context.Request.HttpMethod -eq 'POST') {
        $nowMs = Get-NowMs
        Prune-MpState $nowMs
        $reader = New-Object IO.StreamReader($context.Request.InputStream, [Text.Encoding]::UTF8)
        $rawBody = $reader.ReadToEnd()
        $reader.Close()
        if ([string]::IsNullOrWhiteSpace($rawBody)) {
          Send-JsonResponse $context.Response 400 @{ ok = $false; error = 'Empty request body.' }
          continue
        }
        $body = Convert-PsObjToHashtable ($rawBody | ConvertFrom-Json)
        $type = [string]$body.type
        $cid = [string]$body.clientId
        $code = ([string]$body.roomCode).Trim().ToUpperInvariant()
        $payload = if ($body.ContainsKey('payload') -and $null -ne $body.payload) { $body.payload } else { @{} }

        if ($cid -and $script:mpPlayers.ContainsKey($cid) -and $type -ne 'leave_mp') {
          $script:mpPlayers[$cid].lastSeenMs = $nowMs
        }

        if ($type -eq 'presence') {
          $script:mpPlayers[$cid] = @{
            clientId = $cid
            username = [string]$payload.username
            avatar = [string]$payload.avatar
            status = [string]$payload.status
            roomCode = $payload.roomCode
            lastSeenMs = $nowMs
          }
          Send-JsonResponse $context.Response 200 @{ ok = $true; seq = $script:mpSeq }
          continue
        }

        if ($type -eq 'leave_mp') {
          Remove-PlayerFromMp $cid 'Host closed the room.' $nowMs
          Send-JsonResponse $context.Response 200 @{ ok = $true; seq = $script:mpSeq }
          continue
        }

        if ($type -eq 'invite_player') {
          $targetClientId = if ($payload.ContainsKey('targetClientId') -and -not [string]::IsNullOrWhiteSpace([string]$payload.targetClientId)) { [string]$payload.targetClientId } else { $null }
          Add-MpEvent 'room_invite' $code $targetClientId $payload
          Send-JsonResponse $context.Response 200 @{ ok = $true; seq = $script:mpSeq }
          continue
        }

        if ($type -eq 'create_room') {
          if ($script:mpRooms.ContainsKey($code)) {
            Send-JsonResponse $context.Response 409 @{ ok = $false; code = 'CODE_EXISTS'; error = 'Invitation code already in use.' }
            continue
          }
          if ($script:mpClosedRooms.ContainsKey($code)) { $script:mpClosedRooms.Remove($code) }
          $newRoom = @{
            code = $code
            visibility = [string]$payload.visibility
            status = 'waiting'
            arenaId = [string]$payload.arenaId
            arenaName = [string]$payload.arenaName
            category = [string]$payload.category
            yearLevel = if ($payload.ContainsKey('yearLevel') -and $payload.yearLevel) { [int]$payload.yearLevel } else { 4 }
            maxPlayers = 2
            host = @{
              clientId = $cid
              username = [string]$payload.username
              avatar = [string]$payload.avatar
              ready = $false
              connected = $true
            }
            guest = $null
            createdAtMs = $nowMs
            updatedAtMs = $nowMs
          }
          $script:mpRooms[$code] = $newRoom
          if ($script:mpPlayers.ContainsKey($cid)) {
            $script:mpPlayers[$cid].status = 'In Lobby'
            $script:mpPlayers[$cid].roomCode = $code
            $script:mpPlayers[$cid].lastSeenMs = $nowMs
          }
          Add-MpEvent 'room_state' $code $null @{ room = $newRoom }
          Send-JsonResponse $context.Response 200 @{ ok = $true; seq = $script:mpSeq; room = $newRoom }
          continue
        }

        if ($type -eq 'join_room') {
          if ([string]::IsNullOrWhiteSpace($code) -or $code -notmatch '^[A-Z0-9]{4,8}$') {
            Send-JsonResponse $context.Response 400 @{ ok = $false; code = 'INVALID_FORMAT'; error = 'Enter a valid invitation code (e.g. K9M4X2).' }
            continue
          }
          if (-not $script:mpRooms.ContainsKey($code)) {
            if ($script:mpClosedRooms.ContainsKey($code)) {
              Send-JsonResponse $context.Response 410 @{ ok = $false; code = 'ROOM_CLOSED'; error = 'This room has expired or been closed by the host.' }
            } else {
              Send-JsonResponse $context.Response 404 @{ ok = $false; code = 'NOT_FOUND'; error = 'Invalid invitation code. No active room found.' }
            }
            continue
          }
          $room = $script:mpRooms[$code]
          $hostCid = $room.host.clientId
          if (-not $room.host.connected -or -not $script:mpPlayers.ContainsKey($hostCid)) {
            Close-MpRoom $code 'Cannot join: the host has disconnected.' $nowMs
            Send-JsonResponse $context.Response 410 @{ ok = $false; code = 'HOST_DISCONNECTED'; error = 'Cannot join: the host has disconnected.' }
            continue
          }
          if ($hostCid -eq $cid) {
            Send-JsonResponse $context.Response 400 @{ ok = $false; code = 'SELF_JOIN'; error = 'You are already hosting this room.' }
            continue
          }
          if ($room.status -eq 'in_match') {
            Send-JsonResponse $context.Response 409 @{ ok = $false; code = 'MATCH_STARTED'; error = 'Cannot join: this match has already started.' }
            continue
          }
          if ($null -ne $room.guest -and $room.guest.clientId -ne $cid) {
            Send-JsonResponse $context.Response 409 @{ ok = $false; code = 'ROOM_FULL'; error = 'Room is full (2/2 players).' }
            continue
          }
          $room.guest = @{
            clientId = $cid
            username = [string]$payload.username
            avatar = [string]$payload.avatar
            ready = $false
            connected = $true
          }
          $room.status = 'full'
          $room.updatedAtMs = $nowMs
          if ($script:mpPlayers.ContainsKey($cid)) {
            $script:mpPlayers[$cid].status = 'In Lobby'
            $script:mpPlayers[$cid].roomCode = $code
            $script:mpPlayers[$cid].lastSeenMs = $nowMs
          }
          Add-MpEvent 'room_state' $code $null @{ room = $room; notice = "$($payload.username) joined the room." }
          Send-JsonResponse $context.Response 200 @{ ok = $true; seq = $script:mpSeq; room = $room }
          continue
        }

        if ($type -eq 'leave_room') {
          if (-not $script:mpRooms.ContainsKey($code)) {
            Send-JsonResponse $context.Response 200 @{ ok = $true; seq = $script:mpSeq }
            continue
          }
          $room = $script:mpRooms[$code]
          if ($room.host.clientId -eq $cid) {
            $closeMsg = if ($payload.reason) { [string]$payload.reason } else { "$($room.host.username) closed the room." }
            Close-MpRoom $code $closeMsg $nowMs
            Send-JsonResponse $context.Response 200 @{ ok = $true; seq = $script:mpSeq }
            continue
          }
          if ($null -ne $room.guest -and $room.guest.clientId -eq $cid) {
            $guestName = $room.guest.username
            $wasMatch = ($room.status -eq 'in_match')
            $room.guest = $null
            $room.host.ready = $false
            $room.status = 'waiting'
            $room.updatedAtMs = $nowMs
            if ($script:mpPlayers.ContainsKey($cid)) {
              $script:mpPlayers[$cid].roomCode = $null
              $script:mpPlayers[$cid].status = 'Available'
            }
            if ($wasMatch) {
              Add-MpEvent 'match_forfeit' $code $null @{ winnerClientId = $room.host.clientId; reason = "$guestName left the match." }
            }
            Add-MpEvent 'room_state' $code $null @{ room = $room; notice = "$guestName left the room." }
          }
          Send-JsonResponse $context.Response 200 @{ ok = $true; seq = $script:mpSeq; room = $room }
          continue
        }

        if ($type -eq 'set_ready') {
          if (-not $script:mpRooms.ContainsKey($code)) {
            Send-JsonResponse $context.Response 404 @{ ok = $false; error = 'Room not found.' }
            continue
          }
          $room = $script:mpRooms[$code]
          $readyVal = [bool]$payload.ready
          if ($room.host.clientId -eq $cid) {
            $room.host.ready = $readyVal
          } elseif ($null -ne $room.guest -and $room.guest.clientId -eq $cid) {
            $room.guest.ready = $readyVal
          }
          $room.updatedAtMs = $nowMs
          Add-MpEvent 'room_state' $code $null @{ room = $room }
          Send-JsonResponse $context.Response 200 @{ ok = $true; seq = $script:mpSeq; room = $room }
          continue
        }

        if ($type -eq 'update_settings') {
          if (-not $script:mpRooms.ContainsKey($code)) {
            Send-JsonResponse $context.Response 404 @{ ok = $false; error = 'Room not found.' }
            continue
          }
          $room = $script:mpRooms[$code]
          if ($room.host.clientId -eq $cid) {
            if ($payload.arenaId) { $room.arenaId = [string]$payload.arenaId }
            if ($payload.arenaName) { $room.arenaName = [string]$payload.arenaName }
            if ($payload.category) { $room.category = [string]$payload.category }
            if ($payload.ContainsKey('yearLevel') -and $payload.yearLevel) { $room.yearLevel = [int]$payload.yearLevel }
            $room.host.ready = $false
            if ($null -ne $room.guest) { $room.guest.ready = $false }
            $room.updatedAtMs = $nowMs
            Add-MpEvent 'room_state' $code $null @{ room = $room }
          }
          Send-JsonResponse $context.Response 200 @{ ok = $true; seq = $script:mpSeq; room = $room }
          continue
        }

        if ($type -eq 'start_match') {
          if (-not $script:mpRooms.ContainsKey($code)) {
            Send-JsonResponse $context.Response 404 @{ ok = $false; error = 'Room not found.' }
            continue
          }
          $room = $script:mpRooms[$code]
          if ($room.host.clientId -ne $cid) {
            Send-JsonResponse $context.Response 403 @{ ok = $false; error = 'Only the host can start the match.' }
            continue
          }
          if ($null -eq $room.guest -or -not $room.guest.connected -or -not $room.host.connected) {
            Send-JsonResponse $context.Response 409 @{ ok = $false; error = 'Cannot start: both players must be connected.' }
            continue
          }
          if (-not $room.host.ready -or -not $room.guest.ready) {
            Send-JsonResponse $context.Response 409 @{ ok = $false; error = 'Cannot start: both players must be Ready.' }
            continue
          }
          $room.status = 'in_match'
          $room.updatedAtMs = $nowMs
          foreach ($playerCid in @($room.host.clientId, $room.guest.clientId)) {
            if ($script:mpPlayers.ContainsKey($playerCid)) {
              $script:mpPlayers[$playerCid].status = 'In Match'
            }
          }
          Add-MpEvent 'match_start' $code $null @{ room = $room; matchConfig = $payload.matchConfig }
          Send-JsonResponse $context.Response 200 @{ ok = $true; seq = $script:mpSeq; room = $room }
          continue
        }

        if ($type -eq 'match_move' -or $type -eq 'match_forfeit' -or $type -eq 'return_to_lobby') {
          if ($type -eq 'return_to_lobby' -and $script:mpRooms.ContainsKey($code)) {
            $room = $script:mpRooms[$code]
            $room.host.ready = $false
            if ($null -ne $room.guest) {
              $room.guest.ready = $false
              $room.status = 'full'
            } else {
              $room.status = 'waiting'
            }
            foreach ($playerCid in @($room.host.clientId, $(if ($room.guest) { $room.guest.clientId } else { $null }))) {
              if ($playerCid -and $script:mpPlayers.ContainsKey($playerCid)) {
                $script:mpPlayers[$playerCid].status = 'In Lobby'
              }
            }
            $room.updatedAtMs = $nowMs
            Add-MpEvent 'room_state' $code $null @{ room = $room }
          } else {
            Add-MpEvent $type $code $null $payload
          }
          Send-JsonResponse $context.Response 200 @{ ok = $true; seq = $script:mpSeq }
          continue
        }

        Send-JsonResponse $context.Response 400 @{ ok = $false; error = "Unknown multiplayer event type: $type" }
        continue
      }

      if ([string]::IsNullOrWhiteSpace($relativePath)) {
        $relativePath = 'index.html'
      }

      $filePath = [IO.Path]::GetFullPath([IO.Path]::Combine(
        $root,
        $relativePath.Replace('/', [IO.Path]::DirectorySeparatorChar)
      ))
      if (-not $filePath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase) -or
        -not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
        $context.Response.StatusCode = 404
        $context.Response.Close()
        continue
      }

      $extension = [IO.Path]::GetExtension($filePath).ToLowerInvariant()
      if ($mimeTypes.ContainsKey($extension)) {
        $context.Response.ContentType = $mimeTypes[$extension]
      } else {
        $context.Response.ContentType = 'application/octet-stream'
      }
      $context.Response.Headers['Accept-Ranges'] = 'bytes'
      Add-SecurityHeaders $context.Response

      $bytes = [IO.File]::ReadAllBytes($filePath)
      $range = $context.Request.Headers['Range']
      if ($extension -eq '.mp3' -and $range -match '^bytes=(\d+)-(\d*)$') {
        $start = [int64]$Matches[1]
        $end = $bytes.Length - 1
        if ($Matches[2]) {
          $end = [Math]::Min([int64]$Matches[2], $end)
        }
        if ($start -gt $end) {
          $context.Response.StatusCode = 416
          $context.Response.Close()
          continue
        }

        $context.Response.StatusCode = 206
        $context.Response.Headers['Content-Range'] = "bytes $start-$end/$($bytes.Length)"
        $context.Response.ContentLength64 = $end - $start + 1
        if ($context.Request.HttpMethod -ne 'HEAD') {
          $context.Response.OutputStream.Write($bytes, [int]$start, [int]($end - $start + 1))
        }
      } else {
        $context.Response.StatusCode = 200
        $context.Response.ContentLength64 = $bytes.Length
        if ($context.Request.HttpMethod -ne 'HEAD') {
          $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        }
      }
      $context.Response.Close()
    } catch {
      Write-Warning "Request failed: $($_.Exception.Message)"
      try {
        $context.Response.Abort()
      } catch {
        Write-Warning "Unable to close the failed request: $($_.Exception.Message)"
      }
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
