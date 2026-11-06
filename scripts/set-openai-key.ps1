$ErrorActionPreference='Stop'
function Update-OpenAIEnvText([string]$Text,[string]$Key) {
 if ($Key -notmatch '^sk-[A-Za-z0-9_-]{16,512}$') { throw 'The OpenAI key format is invalid. No file was changed.' }
 $entry='OPENAI_API_KEY='+$Key
 $pattern='(?m)^[ \t]*(?:export[ \t]+)?OPENAI_API_KEY[ \t]*=[^\r\n]*'
 if ([regex]::IsMatch($Text,$pattern)) { return [regex]::Replace($Text,$pattern,[System.Text.RegularExpressions.MatchEvaluator]{param($m) $entry}) }
 $separator=if ($Text -and !$Text.EndsWith("`n")) { "`r`n" } else { '' }
 return $Text+$separator+$entry+"`r`n"
}
# Dot sourcing exposes only the pure updater; it never reads or writes credentials.
if ($MyInvocation.InvocationName -ne '.') {
 $repoRoot=Split-Path -Parent $PSScriptRoot
 $path=Join-Path $repoRoot '.env'
 $secureKey=Read-Host 'Paste the NEW OpenAI API key and press Enter (input is hidden)' -AsSecureString
 $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
 try {
  $openaiKey=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer).Trim()
  $original=if (Test-Path -LiteralPath $path) { [IO.File]::ReadAllText($path) } else { '' }
  $updated=Update-OpenAIEnvText $original $openaiKey
  [IO.File]::WriteAllText($path,$updated,[Text.UTF8Encoding]::new($false))
  Write-Output 'OpenAI key saved in local .env. Other settings were preserved. No API request was made.'
  Write-Output 'Return to the chat and say: saved. The server still needs a restart to load the new key.'
 } finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  $openaiKey=$null;$updated=$null;$original=$null
  $secureKey.Dispose()
 }
}
