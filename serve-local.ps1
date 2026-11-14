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

try {
  while ($listener.IsListening) {
    try {
      $context = $listener.GetContext()
    } catch {
      break
    }

    try {
      $relativePath = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart('/'))
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
