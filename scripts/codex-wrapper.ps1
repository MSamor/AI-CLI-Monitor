param(
  [Parameter(ValueFromRemainingArguments=$true)]
  [string[]]$CodexArgs
)

function Send-CodexState {
  param([string]$State)

  try {
    Invoke-RestMethod `
      -Method Post `
      -Uri 'http://127.0.0.1:17361/hooks/codex' `
      -ContentType 'application/json' `
      -Body (@{ event = $State; source = 'codex-wrapper' } | ConvertTo-Json -Compress) `
      -TimeoutSec 1 | Out-Null
  } catch {
  }
}

try {
  Send-CodexState 'generating'
  codex @CodexArgs
} finally {
  Send-CodexState 'idle'
}
