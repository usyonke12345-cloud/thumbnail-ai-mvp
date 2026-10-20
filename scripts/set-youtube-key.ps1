$ErrorActionPreference='Stop'
function Update-YouTubeEnvText([string]$Text,[string]$Key) {
 if ($Key -notmatch '^[A-Za-z0-9_-]{20,200}$') { throw 'The YouTube key format is invalid. No file was changed.' }
 $entry='YOUTUBE_API_KEY='+$Key
 if ([regex]::IsMatch($Text,'(?m)^YOUTUBE_API_KEY=')) { return [regex]::Replace($Text,'(?m)^YOUTUBE_API_KEY=[^\r\n]*',[System.Text.RegularExpressions.MatchEvaluator]{param($m) $entry}) }
 $separator=if ($Text -and !$Text.EndsWith("`n")) { "`r`n" } else { '' }
 return $Text+$separator+$entry+"`r`n"
}
# Dot sourcing exposes only the pure updater for tests; it never prompts or reads .env.
if ($MyInvocation.InvocationName -ne '.') {
 $repoRoot=Split-Path -Parent $PSScriptRoot
 $path=Join-Path $repoRoot '.env'
 $secureKey=Read-Host 'Paste the YouTube Data API key (input is hidden)' -AsSecureString
 $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
 try {
  $youtubeKey=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  $original=if (Test-Path -LiteralPath $path) { [IO.File]::ReadAllText($path) } else { '' }
  $updated=Update-YouTubeEnvText $original $youtubeKey
  [IO.File]::WriteAllText($path,$updated,[Text.UTF8Encoding]::new($false))
  Write-Output 'YouTube key saved in the local .env. Other settings were preserved. The key was not displayed.'
 } finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  $youtubeKey=$null;$updated=$null;$original=$null
  $secureKey.Dispose()
 }
}
