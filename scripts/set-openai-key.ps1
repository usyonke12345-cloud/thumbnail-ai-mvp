$ErrorActionPreference='Stop'
function ConvertTo-OpenAIKey([string]$Value) {
 if ($Value -match '[\r\n\x00]') { throw 'Paste one complete secret key, not multiple lines. No file was changed.' }
 $key=$Value.Trim()
 $key=[regex]::Replace($key,'^(?:export\s+)?OPENAI_API_KEY\s*=\s*','')
 if ($key.Length -ge 2 -and (($key.StartsWith('"') -and $key.EndsWith('"')) -or ($key.StartsWith("'") -and $key.EndsWith("'")))) { $key=$key.Substring(1,$key.Length-2).Trim() }
 $key=[regex]::Replace($key,'^Bearer\s+','',[Text.RegularExpressions.RegexOptions]::IgnoreCase)
 # This only makes the value safe for a header and a single dotenv entry.
 # Authentication, not a hard-coded key prefix or length, decides whether it works.
 if (!$key.Length -or $key.Length -gt 4096 -or $key -notmatch '^[A-Za-z0-9._~+/-]+=*$') {
  throw 'Paste the complete secret key copied when it was created, not its name or a masked value. No file was changed.'
 }
 return $key
}
function Update-OpenAIEnvText([string]$Text,[string]$Key) {
 $entry='OPENAI_API_KEY='+(ConvertTo-OpenAIKey $Key)
 $pattern='(?m)^[ \t]*(?:export[ \t]+)?OPENAI_API_KEY[ \t]*=[^\r\n]*'
 if ([regex]::IsMatch($Text,$pattern)) { return [regex]::Replace($Text,$pattern,[System.Text.RegularExpressions.MatchEvaluator]{param($m) $entry}) }
 $separator=if ($Text -and !$Text.EndsWith("`n")) { "`r`n" } else { '' }
 return $Text+$separator+$entry+"`r`n"
}
function Confirm-OpenAIKey([string]$Key) {
 # Fixed read-only endpoint; no model generation and no credential in the URL.
 $protocol=[Net.ServicePointManager]::SecurityProtocol
 try {
  [Net.ServicePointManager]::SecurityProtocol=$protocol -bor [Net.SecurityProtocolType]::Tls12
  $response=Invoke-WebRequest -Uri 'https://api.openai.com/v1/models' -Method Get -Headers @{Authorization='Bearer '+$Key} -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 15
  if ($response.StatusCode -ne 200) { throw 'Unexpected authentication response.' }
 } catch {
  $status=$null
  try { $status=[int]$_.Exception.Response.StatusCode } catch {}
  if ($status -eq 401) { throw 'OpenAI did not accept this key (HTTP 401). Copy the full newly created secret key, not its name. No file was changed.' }
  if ($status -eq 403) { throw 'OpenAI refused the free model check (HTTP 403). Check the key project and model-read permissions. No file was changed.' }
  throw 'The free authentication check did not finish. Check the network and try again. No file was changed.'
 } finally { [Net.ServicePointManager]::SecurityProtocol=$protocol }
}
# Dot sourcing exposes only the pure updater; it never reads or writes credentials.
if ($MyInvocation.InvocationName -ne '.') {
 $repoRoot=Split-Path -Parent $PSScriptRoot
 $path=Join-Path $repoRoot '.env'
 $secureKey=Read-Host 'Paste the NEW OpenAI API key and press Enter (input is hidden)' -AsSecureString
 $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
 try {
  $openaiKey=ConvertTo-OpenAIKey ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer))
  Write-Output 'Checking the key with OpenAI (free, no image generation)...'
  Confirm-OpenAIKey $openaiKey
  $original=if (Test-Path -LiteralPath $path) { [IO.File]::ReadAllText($path) } else { '' }
  $updated=Update-OpenAIEnvText $original $openaiKey
  [IO.File]::WriteAllText($path,$updated,[Text.UTF8Encoding]::new($false))
  Write-Output 'OpenAI key saved in local .env after a free authentication check. Other settings were preserved. No image was generated.'
  Write-Output 'Return to the chat and say: saved. The server still needs a restart to load the new key.'
 } finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  $openaiKey=$null;$updated=$null;$original=$null
  $secureKey.Dispose()
 }
}
