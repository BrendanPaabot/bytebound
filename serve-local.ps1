param(
  [int]$Port = 8765,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $PSScriptRoot).Path.TrimEnd('\')
$rootPrefix = $root + [IO.Path]::DirectorySeparatorChar
$prefix = "http://127.0.0.1:$Port/"
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
$listener.Start()
Write-Host "Serving $root at $prefix. Press Ctrl+C to stop."
if (-not $NoBrowser) {
  Start-Process $prefix
}

$script:mpPlayers = @{}
$script:mpRooms = @{}
$script:mpClosedRooms = @{}
$script:mpEvents = [System.Collections.ArrayList]::new()
$script:mpSeq = 0

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
    if (($nowMs - [int64]$entry.Value.lastSeenMs) -gt 9500) {
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
          foreach ($pid in @($room.host.clientId, $room.guest.clientId)) {
            if ($script:mpPlayers.ContainsKey($pid)) {
              $script:mpPlayers[$pid].status = 'In Match'
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
            foreach ($pid in @($room.host.clientId, $(if ($room.guest) { $room.guest.clientId } else { $null }))) {
              if ($pid -and $script:mpPlayers.ContainsKey($pid)) {
                $script:mpPlayers[$pid].status = 'In Lobby'
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
