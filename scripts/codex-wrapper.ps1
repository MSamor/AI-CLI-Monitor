param(
  [Parameter(ValueFromRemainingArguments=$true)]
  [string[]]$CodexArgs
)

codex @CodexArgs
