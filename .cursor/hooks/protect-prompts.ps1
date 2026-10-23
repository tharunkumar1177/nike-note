$ErrorActionPreference = 'Stop'

$raw = [Console]::In.ReadToEnd()
try {
    $payload = $raw | ConvertFrom-Json
} catch {
    '{ "permission": "allow" }'
    exit 0
}

$candidates = @(
    $payload.file_path,
    $payload.command,
    $payload.tool_input.path,
    $payload.tool_input.file_path,
    $payload.tool_input.glob,
    $payload.tool_input.command
) | Where-Object { $_ }

$protected = '(^|[\\/\s"''])prompts(\.md|\.\*|\*)'

foreach ($value in $candidates) {
    if ([string]$value -match $protected) {
        @{
            permission    = 'deny'
            user_message  = 'Blocked: prompts.md is off-limits to the agent.'
            agent_message = 'prompts.md is protected by a project hook. Do not attempt to read it by any means.'
        } | ConvertTo-Json -Compress
        exit 2
    }
}

'{ "permission": "allow" }'
exit 0