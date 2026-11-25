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
    users = @{}
    sessions = @{}
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

function Serialize-AuthUser($u) {
  return @{
    id = [int64]$u.id
    username_key = [string]$u.username_key
    display_name = [string]$u.display_name
    best_score = if ($null -ne $u.best_score) { [int]$u.best_score } else { 0 }
    total_kills = if ($null -ne $u.total_kills) { [int]$u.total_kills } else { 0 }
    total_correct = if ($null -ne $u.total_correct) { [int]$u.total_correct } else { 0 }
    total_answers = if ($null -ne $u.total_answers) { [int]$u.total_answers } else { 0 }
    topic_progress = if ($null -ne $u.topic_progress) { $u.topic_progress } else { @{} }
    skill_progress = if ($null -ne $u.skill_progress) { $u.skill_progress } else { @{} }
    review_store = if ($null -ne $u.review_store) { $u.review_store } else { @{} }
    achievements = if ($null -ne $u.achievements) { $u.achievements } else { @{} }
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
  $uKey = [string]$sess.user_key
  if (-not $script:authStore.users.ContainsKey($uKey)) { return $null }
  return $script:authStore.users[$uKey]
}

$script:authStore = Load-AuthStore

function Get-NowMs {
  return [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
}

function Send-JsonResponse($response, [int]$statusCode, $data) {
  $json = $data | ConvertTo-Json -Depth 12 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $response.StatusCode = $statusCode
  $response.ContentType = 'application/json; charset=utf-8'
  $response.Headers['Cache-Control'] = 'no-store'
  $response.ContentLength64 = $bytes.Length
  $response.OutputStream.Write($bytes, 0, $bytes.Length)
  $response.Close()
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
        Send-JsonResponse $context.Response 200 @{ ok = $true; provider = 'local' }
        continue
      }

      if ($relativePath -like 'api/auth/*' -and $context.Request.HttpMethod -eq 'POST') {
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
            review_store = @{}
            achievements = @{}
            created_at = $nowIso
            updated_at = $nowIso
            last_login_at = $nowIso
          }
          $script:authStore.users[$usernameKey] = $newUser
          $sess = New-AuthSessionForUser $usernameKey
          Save-AuthStore
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
          $password = if ($null -ne $body.password) { [string]$body.password } else { '' }
          $userObj = if ($usernameKey -and $script:authStore.users.ContainsKey($usernameKey)) { $script:authStore.users[$usernameKey] } else { $null }
          $storedHash = if ($null -ne $userObj -and $userObj.ContainsKey('password_hash')) { [string]$userObj.password_hash } else { '' }
          $validPw = ($displayName.Length -ge 1 -and $displayName.Length -le 24 -and $password.Length -ge 1 -and $password.Length -le 72)
          $verified = if ($validPw) { Test-PasswordHash $password $storedHash } else { $false }
          if ($null -eq $userObj -or -not $verified) {
            Send-JsonResponse $context.Response 401 @{ ok = $false; code = 'INVALID_CREDENTIALS'; error = 'Invalid username or password.' }
            continue
          }
          $userObj.last_login_at = $nowIso
          $sess = New-AuthSessionForUser $usernameKey
          Save-AuthStore
          Send-JsonResponse $context.Response 200 @{
            ok = $true
            session_token = $sess.session_token
            expires_at = $sess.expires_at
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
          if ($body.ContainsKey('reviewStore') -and $null -ne $body.reviewStore) { $userObj.review_store = $body.reviewStore }
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

        Send-JsonResponse $context.Response 404 @{ ok = $false; error = 'Unknown auth endpoint.' }
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
