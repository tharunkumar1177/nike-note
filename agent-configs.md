# Cursor Subagent Configuration

Five specialized subagents live in `.cursor/agents/`. Each file has YAML frontmatter (`name`, `description`, `model`, `readonly`) followed by its system prompt. Cursor reads `description` to decide when to delegate, and you can also call any of them explicitly with `/name` (e.g. `/architect plan the sync layer`).

The main agent acts as the **orchestrator**. Its instructions and the project guardrails live in the root `AGENTS.md`, which Cursor applies to the main agent automatically. It uses whichever model you pick in the chat, and it builds the app slice by slice, calling the subagents below.

| Agent | File | Access | Model | Called by |
| --- | --- | --- | --- | --- |
| orchestrator | `AGENTS.md` | write | chat model picker | you |
| researcher | `.cursor/agents/researcher.md` | read-only | `gpt-5.6-sol` | main agent |
| productmind | `.cursor/agents/productmind.md` | read-only | `claude-opus-5` | `designer`, `researcher` only |
| designer | `.cursor/agents/designer.md` | write | `claude-opus-5-5` | main agent |
| architect | `.cursor/agents/architect.md` | read-only | `claude-opus-5-5[effort=high]` | main agent |
| coder | `.cursor/agents/coder.md` | write | `claude-opus-5-5` | main agent |

## Workflow

```mermaid
flowchart LR
    Main[Main agent] --> R[researcher]
    Main --> A[architect]
    Main --> D[designer]
    Main --> C[coder]
    R --> P[productmind]
    D --> P
    A -. plan needs approval .-> Main
```

Typical flow for a feature: `researcher` (what exists) -> `architect` (plan, user approves) -> `designer` (UI and workflows) and `coder` (logic, APIs, tests) -> CI verifies.

### About the "only callable by Designer / Research" rule

Cursor has no frontmatter field that restricts who can call a subagent. The rule is enforced two ways:

1. `productmind`'s `description` tells the main agent not to call it directly, and the `researcher` and `designer` prompts tell those agents when to call it.
2. Cursor's nesting limit: the main agent and its direct subagents can launch subagents, but a subagent launched by another subagent can't launch more. When `designer` or `researcher` calls `productmind`, it stays a leaf.

If `productmind` is called outside that flow anyway, its prompt tells it to say so at the top of its output.

## Frontmatter fields used

| Field | Values used | Why |
| --- | --- | --- |
| `name` | lowercase-hyphen | Identifier and `/name` command. |
| `description` | role + when to use + "use proactively" where appropriate | Drives automatic delegation. |
| `model` | specific model IDs (see below) | Pins each role to the best-fit model instead of inheriting the parent's. |
| `readonly` | `true` for researcher, productmind, architect | Research and planning roles can't edit files or run state-changing commands. Designer and coder keep the default write access. |
| `is_background` | not set (defaults to `false`) | Every role's output feeds the next step, so the parent waits for it. Set `true` on `researcher` if you want long research to run in parallel. |

## Model selection research

Benchmarks were chosen to match each role. Sources are public leaderboards and vendor system cards, checked Sep 2026. Harnesses differ between sources, so small gaps are noise. Only models currently offered in Cursor were considered.

### Coder: repository-level coding (SWE-bench Pro)

| Model | Score | Available in Cursor |
| --- | --- | --- |
| **Claude Opus 5.5** | **89.9%** | yes (`claude-opus-5-5`) |
| Claude Fable 5.1 | 81.2% | not listed |
| Claude Opus 5 | 79.2% | yes |
| GPT-5.6 Sol | 64.6% | yes |
| Composer 2.5 | ~Opus 4.7 level (Cursor-reported) | yes, cheapest |

Pick: **Claude Opus 5.5**. It leads the next-best model in Cursor by more than 10 points and costs less than Opus 5 ($4/$20 per 1M tokens). Budget alternative: `composer-2.5` for routine, well-specified tasks.

Sources: [llm-stats SWE-bench Pro](https://llm-stats.com/benchmarks/swe-bench-pro), [BenchLM SWE-bench Pro](https://benchlm.ai/benchmarks/swe-bench-pro), [Cursor Models & Pricing](https://cursor.com/docs/models-and-pricing)

### Designer: front-end and UI quality (LMArena WebDev, human preference)

| Model | Elo | Available in Cursor |
| --- | --- | --- |
| **Claude Opus 5.5 (max)** | **1820** | yes |
| GPT-6 Astra (max) | 1792 | no |
| Claude Fable 5.1 | 1758 | not listed |
| Claude Opus 5 (max) | 1687 | yes |
| GPT-5.6 Sol (xhigh) | 1617 | yes |

Pick: **Claude Opus 5.5**. It ranks #1 on human-judged web UI quality, and it's also the best coder, so the designer's code holds up. Alternative: `claude-opus-5`.

Sources: [Arena WebDev leaderboard](https://arena.ai/leaderboard/code/webdev/overall), [Arena WebDev by lab](https://arena.ai/leaderboard/code?rankBy=labs)

### Architect: deep reasoning and planning

Pick: **Claude Opus 5.5 with `effort=high`**. It leads real-repo reasoning (SWE-bench Pro) and Terminal-Bench, which fits planning that has to line up with the actual codebase. High effort is worth the extra cost here because the architect runs rarely and its mistakes are expensive. Alternative: `gpt-5.6-sol`, a strong second opinion from a different model family.

### Researcher: finding hard facts on the web (BrowseComp)

| Model | Score | Available in Cursor |
| --- | --- | --- |
| Atria Dawn Preview | 92.5% | no |
| **GPT-5.6 Sol** | **90.4% single / 92.2% multi-agent** | yes (`gpt-5.6-sol`) |
| GPT-6 Astra | 91.5% | no |
| Kimi K3 | 91.2% | no |
| Claude Opus 5 | 90.8% | yes |

Pick: **GPT-5.6 Sol**. It's the best Cursor-available model at persistent, multi-page fact-finding, which is what product-system research needs. Alternative: `claude-opus-5`.

Sources: [BenchLM BrowseComp](https://benchlm.ai/benchmarks/browsecomp), [TensorFeed BrowseComp](https://tensorfeed.ai/benchmarks/browsecomp), [Steel.dev BrowseComp](https://leaderboard.steel.dev/leaderboards/browsecomp/)

### Productmind: synthesizing user sentiment (DeepResearch Bench II + BrowseComp)

| Model | DeepResearch Bench II | BrowseComp |
| --- | --- | --- |
| **Claude Opus 5** | **54.1** (highest in comparison) | 90.8% |
| GLM 5.3 | 52.7 | - |
| Kimi K3 | 51.3 | 91.2% |
| GPT-5.6 Sol | 50.7 | 92.2% |

Pick: **Claude Opus 5**. Productmind's job is to turn many noisy opinions into a ranked, evidence-backed synthesis, and DeepResearch Bench II (long-form research reports) measures that more directly than BrowseComp. Using a different model family from `researcher` also means a second viewpoint when their findings are merged. Alternative: `gpt-5.6-sol`.

Source: [Atria Dawn Preview benchmark table (Hugging Face)](https://huggingface.co/internlm/Atria-Dawn-Preview/blob/main/README.md)

## Notes

- **Model IDs:** `gpt-5.6-sol`, `claude-opus-5`, and `composer-2.5` come straight from Cursor's docs. `claude-opus-5-5` is inferred from Cursor's documented fast-mode ID `claude-opus-5-5-fast`. If Cursor rejects it, check the exact ID in the model picker or on the Models page.
- **Fallbacks:** Cursor silently falls back to another model if a pinned model is blocked by a team admin or not on your plan. On legacy request-based plans without Max Mode, subagents run on Composer whatever `model` says.
- **Cost:** every subagent uses its own context window, and all pinned third-party models bill from the "Other Models" pool. To save money, change `model: inherit` on any agent or drop `coder` to `composer-2.5`.
- **Re-check models every quarter.** Leaderboards change quickly; update the `model` field and this document together.









The company is your employer, Nike. The endpoint is on `nikecloud.com`, the same company as your login email, and it's the one in the hook's GitHub org allowlist. It has no fixed public IP. The hostname points to an internal Amazon Web Services load balancer that currently resolves to three private addresses.

The lookup goes like this:

- `us-west-2.sky-hook.github-admin-prod.nikecloud.com` is an alias for `k8s-npeservi-skyhookg-22a4137c7c-ac401314c782ef75.elb.us-west-2.amazonaws.com`.
- That is an AWS Elastic Load Balancer in the `us-west-2` (Oregon) region, in front of a Kubernetes service, judging by the `k8s-` prefix.
- It resolves to `10.232.56.6`, `10.232.56.119` and `10.232.56.168`.

All three addresses are in the private `10.x.x.x` range, so this is an internal load balancer. It's only reachable from inside the company network, through the office network or VPN, not from the public internet. Off VPN, the script's telemetry call would simply fail after its 2-second timeout, without affecting your prompt.

The addresses can change at any time. The DNS records are cached for only 60 seconds, and AWS rotates load balancer IPs, so anything that relies on them should use the hostname instead.





----



That JSON is not from your hook. It's the input Cursor gave a **team hook** that your company's Cursor admin pushes to your machine. The hook checks which GitHub repository you're working in and is meant to report that to a company server. Right now it never runs to completion, so it sends nothing anywhere.

## What it does

The script is `C:\Users\TMano1\.cursor\managed\team_27443805\hooks\repo-validator-windows.ps1`. It runs every time you submit a prompt, on the `beforeSubmitPrompt` event. Its steps are:

1. Take the workspace folder from the input (`workspace_roots`) and run `git remote get-url origin` there.
2. Check that the remote is on `github.com` and that the GitHub organization is on the company allowlist: company-prefixed orgs, or personal repos with a company suffix.
3. Send a telemetry event to a company endpoint on `nikecloud.com`, whether or not the repo passes.
4. `ENFORCEMENT_MODE=false` means it's in **audit mode**. It never blocks anything; failing repos are recorded as `audit_blocked` and allowed.

It reads only the workspace path from the input. It doesn't send your prompt text, even though the prompt is in the JSON you pasted.

## Why it's in `.cursor\managed\team_...`

That folder is where Cursor stores hook scripts that a team or enterprise admin configures centrally. The log line "Executing hook 1/1 from team config" confirms this one came from your company's Cursor team settings. You didn't install it. That folder holds the script, not the logs you pasted. The script would write its own log to `logs\validator.log` next to itself, and only when a repo fails the check.

## Where the logs go

- **The hook log you pasted** is a local file under `%APPDATA%\Cursor\logs\...`. It's what Cursor's Hooks output channel shows. I don't know of Cursor uploading these files, unless you attach logs to a bug report. Your prompt reaches Cursor's servers anyway, because that's how the model receives it.
- **The script's telemetry**, if it worked, would go to your company's server, not Cursor's. Each event would include:
  - the full git remote URL, repo name and org
  - your Windows username and computer name
  - a timestamp and the hook version

  The script sends the remote URL as-is. If your remote URL had a token embedded in it (`https://user:token@github.com/...`), that token would be sent too.

## Why it currently does nothing

The file is a Windows batch script (it starts with `@echo off`) but is saved with a `.ps1` extension, so PowerShell runs it and fails on line 1. That's the `ParserError ... repo-validator-windows.ps1:1` in your log, followed by "Hook 1 produced no output". Cursor then carries on as if the hook weren't there. The repo check never happens and no telemetry is sent.

It's managed by your admin, so don't edit or remove it. It would likely be replaced on the next sync anyway. If you want it fixed, report the wrong file extension to whoever runs your company's Cursor setup.




---



Cursor's documentation confirms the main point: your employer cannot read your prompts or the agent's answers through Cursor's dashboard, its APIs or its audit logs. Cursor's documented way for a company to capture prompts is hooks, and that's exactly the mechanism your company has installed.

## What the admin dashboard shows

The [Usage Analytics](https://cursor.com/docs/account/teams/analytics) page lists what admins can see for every member:

- **Activity counts:** messages sent (filterable by mode and model), Tab suggestions accepted, Agent lines suggested and accepted, and active days.
- **AI share of committed code,** overall and per repository. This is matched on your machine using line signatures, and only the counts are uploaded.
- **A usage leaderboard:** chats, Tab completions, Agent lines and favourite model. Every team member can see it, not just admins.
- **Conversation Insights:** on by default for Enterprise. Each agent session is labelled by category (bug fixing, refactoring and so on), work type, complexity, and how specific your prompts are. The docs say the classification runs on your device and only the labels leave it. So your employer can see what kind of work you do and how specific your prompts are, though not the prompts themselves.

The [Compliance and Monitoring](https://cursor.com/docs/enterprise/compliance-and-monitoring) page says audit logs "never" contain prompts, agent output or generated code, and points admins to hooks for that. A Cursor staff answer on the [forum](https://forum.cursor.com/t/control-or-monitor-employees-prompt-response-data/159854) says the same: content is visible only to the person who wrote it.

## Ways the docs allow a company to see more

1. **Hooks.** The [hooks docs](https://cursor.com/docs/agent/hooks) describe three distribution routes: committed to the repo, pushed by device-management software, or cloud-distributed from the Enterprise dashboard. Your `.cursor\managed\team_...` hook arrived the third way. Cloud hooks sync automatically, outrank your own hooks, and can be set to make Cursor wait for them before sending a prompt. A hook on `beforeSubmitPrompt` gets your full prompt, and `afterAgentResponse` and `afterAgentThought` get the agent's replies and reasoning.
2. **OpenTelemetry export (Enterprise).** The [OpenTelemetry Export](https://cursor.com/docs/enterprise/opentelemetry-export) page describes a stream of usage data to a company-run collector: token counts, tool calls, errors and hook runs. Prompt and response text is a separate, off-by-default option, and it currently covers only Cloud Agents and Grok Bot. The docs say IDE, CLI and desktop chats are not included yet.
3. **Ways outside Cursor, from my earlier answer:** monitoring software reading your local transcript files, decryption of traffic on the corporate network, and company-controlled model API keys. Cursor's docs don't cover these, but they're common on managed laptops.

## What this means for you right now

From Cursor's own features, your employer gets activity counts and work-type labels, not your text. The only route to your prompt text in this setup is the team hook, and its current script ignores the prompt and is broken anyway. Your admin could change that script at any time without telling you. The text could also reach the company through the ways outside Cursor.



------------------------------------


Encrypting it so that only the encrypted copy lives in the repo works well. The plaintext must never sit in the repo folder, and you'd decrypt to a folder outside the repo only when you need it. On Windows, `age` or 7-Zip are the simplest tools for this.

## Option 1: `age` (recommended)

`age` is a small, modern encryption tool that encrypts a single file with a passphrase.

```powershell
winget install FiloSottile.age

# Encrypt: asks for a passphrase twice, nothing is echoed
age -p -o prompts.md.age prompts.md

# Remove the plaintext from Git and from disk
git rm --cached prompts.md
Remove-Item prompts.md
git add prompts.md.age
```

To edit it, decrypt to a folder outside the repo, edit it there in an editor other than Cursor, then encrypt it back:

```powershell
$private = "$env:USERPROFILE\Private"; New-Item -ItemType Directory -Force $private | Out-Null
age -d -o "$private\prompts.md" C:\nike-no\prompts.md.age
notepad "$private\prompts.md"
age -p -o C:\nike-no\prompts.md.age "$private\prompts.md"
Remove-Item "$private\prompts.md"
```

## Option 2: 7-Zip archive

```powershell
# -p with no value asks for the password; -mhe=on also hides filenames inside the archive
7z a -t7z -mhe=on -p prompts.7z prompts.md
7z x -p -o"$env:USERPROFILE\Private" prompts.7z
```

## Options that don't fit this goal

- **git-crypt:** it encrypts files only on GitHub. In your working copy they're decrypted automatically, so an agent can read them as normal.
- **Windows EFS (Encrypting File System):** it protects files from other Windows accounts. The agent runs under your account, so EFS decrypts files for it too.
- **SOPS:** designed for structured secrets files like YAML or JSON. It's overkill for one Markdown file.

## Things that would undo the encryption

- **Git history:** encrypting now doesn't touch earlier commits. The plaintext is still in past commits and on GitHub. Removing it requires rewriting history (for example with `git filter-repo --path prompts.md --invert-paths`) and force-pushing. Anyone with an existing clone still has the old copy.
- **Passwords typed on the command line:** never use `7z -pMySecret` or similar. The password ends up in PowerShell's history file, which an agent can read. Use the prompt forms above.
- **Opening it in Cursor:** Cursor shares the names of open files with the agent, and you could attach the file to a chat by accident. Edit the decrypted copy in Notepad or another editor.
- **Where you decrypt:** an agent running under your account can still read `%USERPROFILE%\Private` if it knows the path. The risk is lower because nothing in the repo points there. Delete the plaintext once you're done.
- **Rules that point to it:** `AGENTS.md` and the hook still say `prompts.md`. Both keep working: `prompts.md.age` and `prompts.7z` still match the hook's "prompt" pattern. Update `.cursorignore` to include the new filename.

The hook would block me from running these commands, since they name the file, so you'll need to run them yourself.