Build a Notion clone, every features should exactly be like Notion but keep the project name as something else. Tech stack - for frontend I think they use Next js and figure out other stacks (come up optimal one)

optimize the guardrails for AI Agent. Do not elaborate it or exaggerate it. keep it short and simple


keep in mind that Orchestrator should not just give the other agents a big chunk of work [because the model has only 300k context window], instead it should iteratively build the application using these agents

Github Actions CI is the only compile and Build authority, there is no local runtime. By default use Blueprints skill for  managing context. first come up with a plan and write Agent file for cursor. Build our application with aesthetics and intuitive UI. 


architect doesn't going to run build commands, it's job is to calculate the feasibility, trade-offs and future scope for better scalability and maintainbility
I have described the Agent requirements vaguely, coming up with best config is your job

considering the following, whil agent file, 




If there is any architectural flaws/quirks - come up with a plan. Only proceeed further if it is approved. 
you can always propose optimal implementation than in the blueprint , only proceed further if user say approved it

This project right now has many flaws, a lot features / functionalities isn't working as expected. instead of directly editing it, ask questions of "how it could have been implemented better?" or "Stick with the existing system."


Stick with the existing Privileged broker and cleanup [as described in blueprints].
For [clean up for browser, system, temp files and so on] clearing system-level files - on a scheduled date and time. I think there is no UI for user to set these things up. so Create one




--------------


# Guardrails

- Never use the word (`N-I-K-E`, any case) in codebase, file creation, names, or commits.
- GitHub Actions CI is the only build authority. Nothing runs locally.
- Read CI logs with `gh-cli`. If `gh` is unavailable, stop and ask the user for the logs.
- Never read `prompts.md` or add it to `.gitignore`.


### Engineering practices
- Start every file with a header comment and give every function a doc comment.
- Build production-grade code only. No mocks or placeholder data.
- Manage context with the Blueprints skill.
- Take project context only from `README.md` and `architecture.md`; ignore the root and git folder names.
- Never use GitHub Actions run IDs as verification status in blueprints.
- Store diagrams in `assets/.diagrams/` and wireframes in `assets/wireframes/`.


## Git commands
```
Remove-Item -Recurse -Force .git
rmdir /s /q .git

git init
git log --oneline

echo "# Nike-op" >> README.md
git init
git add README.md
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/<>.git
git push -u origin main

```



## Migration Checklist

- [ ] Blueprints Skill
- [ ] AGENTS.md, AGENTs folder
- [ ] prompts.md
- [ ] Design files / Wireframes (Excalidraw)



## PROMPTS

### AGENT Instruction definition guidelines

- AGENT instruction should not be, too prescriptive or too vague, It should be inbetween somewhere.
- Do not elaborate or exaggerate instruction for the AGENT; keep it clean and concise




------------


- Generate images that are **visually identical or extremely close** to the provided UI reference

- Diagrams/ web pages / Explainer videos (create a 3Blue1Brown style video explainer on X. ElevenLabs for audio narration)



## CURSOR

- /summarize, /visualize

- Execution and Approvals > Auto-Review

- `is_background: true` — the main agent starts the subagent and keeps working without waiting for it to finish.

- Fork - Agents Window > Right Click

- Keyboard Shortcuts —— `Cmd+I` (open agent), `Cmd+/` (change models)

- Plan Mode ——> AI research your codebase and generate a structured implementation plan



## AGENTIC Engineering practices

- Plan ——> code (context) ——> Build & Test ——> Review
- Faster != Better          ——>     Incremental developement



### Prompt structure

```
    <rules>                                     ——  AGENTS.md
    <context - (Feature requirement, task...)>  
        <problem>
        <behavior>
    </context>
    <contraints>                                ——  Don't change any other modal behavior or layout.
```

--------------


## Agents 


## AGENT HQ

we already have agents [Research, Designer, Architect, Coder, Planner, Reviewer]. find the opitimal model for these from the available list.
Design specialized subagent for Cursor [ Reviewer]. Describe its role and how it should respond. Give description for each agent (cursor) and if additional property required - add them as well.



Research Agent - Research for the existing product's system, features.

Designer - responsible for designing Aesthetics and intuitive UI,  UI workflows. Returns Design plan with granular details. currently it writes code

Coder - writes code consider every possible edge cases

Productmind - Researches [external media like relevant subreddit page, ] what existing product failed address or could have done better that speaks for the product itself. can only be called by {Designer, Research Agent}

Reviewer - reviews code by build error check via gh-cli CI logs, polls and returns what actually causing build fails/ errors

Planner - comes up with a plan, proceeds further if it is approved. writes plan in md file and wait for approval. Planner can invoke these Agents {Architect, Researcher, productmind}


---

write all the Agent config in an .md file


subAgent - Research, review through CI logs


- Also come up with the list of best model that are best fit that specific role. [Do web research, get data from only legit sites. Do not spawn subAgents for this task]


### SubAgent models:

- **Claude:** Opus 4.5 (high thinking), Sonnet 4.5 (thinking), Sonnet 4, Haiku 4.5 (thinking)
- **GPT:** 5.1, 5.2, 5.3 Codex, 5.4 Mini, 5.4 Nano, 5 Mini
- **Gemini:** 3.1 Pro, 3.5 Flash, 3 Flash, 2.5 Flash
- **Others:** Kimi K3, Kimi K2.7 Code, GLM 5.2, Composer 2.5

ROADMAP.md

-Phases of implementation plan. It should have iterative improvement and refinement of features and workflows... with granular details 


In the Agent Orchestration workflow, the main agent has to write code here after (No coder Agent). Do not write instructions like you will have to write code, blah blah blah. keep it short and simple and remove Coder Agent from AGENTS.md. 


-----------------





**Agent Layout** is Cursor’s agent-first IDE arrangement: the window is organized around chatting with the agent, running tools, and reviewing changes—not only a code editor with chat bolted on the side.

### How it differs from other UIs

| Surface | What it is | Typical shortcut |
|--------|------------|------------------|
| **Sidepanel chat** | Agent chat in a side panel; editor stays VS Code–like | **Ctrl+I** or **Ctrl+L** |
| **Agent Layout** | Whole-window layout tuned for agent work (sidebars flip/rearrange) | **Ctrl+E** (toggle) |
| **Agents Window** | Separate agent-focused window (multi-agent, worktrees, diffs) | Command Palette → **Open Agents Window** |

Opening the sidepanel does **not** automatically switch Agent Layout. **Ctrl+E** toggles the layout mode; **Ctrl+I** toggles the chat panel.

Community reports (not always spelled out in docs): in **Editor** layout the main sidebar (Explorer, Git) is often on the **left**; in **Agent** layout agents may be on the **left** and the classic sidebar on the **right**.

### What you get in Agent Layout

Same agent features as elsewhere—modes (Agent, Ask, Plan, Debug), diffs, checkpoints, queued messages, browser tools—but the chrome is arranged for that workflow. Browser docs also call out extra session isolation when the integrated browser runs in this layout.

### Related: “Agents Window”

That’s a **different surface**: projects/agents list on the left, chat in the center, **Files / Terminal / Browser / Changes** on the right. Use it when you want a dedicated agent desk, not just **Ctrl+E** inside the normal editor window.

### Settings you might see

- **Cursor Settings → Agents** — auto-run, browser approval, usage summary, etc.
- **`cursor.agent_layout_browser_beta_setting`** — community/forum beta flag for browser-in-layout; not in the main docs index.

Docs: [Keyboard shortcuts](https://cursor.com/docs/reference/keyboard-shortcuts), [Agent overview](https://cursor.com/docs/agent/overview), [Agents Window](https://cursor.com/docs/agent/agents-window).




For a new task, start a fresh chat instead (Ctrl+N in the IDE, /clear in the CLI). To bring over just part of an old chat, mention it with @Chats, or use /fork from a specific message.

Alternatives: /clear for a new session, /fork to branch from a message.

Start a new chat (/clear or /new in the CLI)


-----------------












The agent finds the library's ID, then pulls the relevant docs into its context.

**Name the library directly** to skip the lookup step. Use its ID, written as `/owner/repo`:

> Implement Supabase auth with email magic links. use library /supabase/supabase

**Make it automatic with a rule.** Create `.cursor/rules/context7.mdc`:

```markdown
---
description: Use Context7 for library documentation
alwaysApply: true
---
When writing code that uses a third-party library or framework, or when generating
setup/configuration steps, use the Context7 MCP tools to fetch current docs
before answering.
```


## Note for this repo

Context7 ....`researcher` and `architect` --- checking library APIs and versions. That would mean mentioning it in their files under `.cursor/agents/`. The remote option also fits your "nothing runs locally" rule, since no local process is involved.



- If you have branch conflict, while commiting, stop and ask user


------------





A worktree is a second working folder attached to the same git repository. Each folder has a different branch checked out, and you can edit both at the same time.

Normally a repository has one folder (here `c:\nike-tracker`), and it can only show one branch at a time. Switching branches swaps the files in that folder. `git worktree add <folder> <branch>` creates another folder with a different branch checked out, and both folders share the same history, commits and remote. A commit made in either folder is immediately visible from the other, because there's only one repository underneath.

That's why I used one:
- Another session had `c:\nike-tracker` on the `promo-video` branch.
- I needed to work on `slice-2-project-shell` without switching branches under that session.
- So I ran `git worktree add C:\tron-slice2 slice-2-project-shell`, which gave me a second folder showing the Slice 2 branch.
- I committed and pushed from there, then removed it with `git worktree remove`.

Removing a worktree only deletes that extra folder. The commits made in it stay in the repository, so nothing was lost.

Useful commands:
- `git worktree list` shows every folder attached to the repository.
- `git worktree add <path> <branch>` creates one.
- `git worktree remove <path>` deletes one. Git refuses if the folder has uncommitted changes.


-------

`.prettierignore` lists the files and folders that Prettier, the code formatter, should skip. It works like `.gitignore`, but it controls formatting instead of git tracking.

CI runs `prettier --check .`, which fails the build if any file isn't formatted the way Prettier wants. Some files must never be reformatted, so they're listed here. These two entries came up in the conflict:

- **`crates/core/tests/golden`**: these are golden test fixtures, the exact KiCad and `tron.json` files the Rust tests compare saved output against byte for byte. If Prettier reformatted `tron.json`, the comparison would fail even though the code is correct.
- **`promo`**: the promo video project has its own Prettier check in its own CI workflow (`promo.yml`). The root ignore keeps the main app's check from also checking it.

The conflict happened because each branch added its own line in the same spot. The fix was to keep both lines.

The other entries are generated or vendored content where formatting doesn't matter or is controlled elsewhere:
- Build output: `dist`, `target`, `src-tauri/target`, `src-tauri/gen`.
- Icons: `src-tauri/icons`.
- Generated TypeScript bindings: `ui/src/bindings`, produced by `ts-rs` and checked by CI for drift instead.
- Lockfiles: `package-lock.json`.
- Markdown and config folders: `*.md`, `.cursor`, `.github`.



-----------



I used a worktree because a hard reset in `c:\nike-tracker` would have caused damage there and still wouldn't have fixed the problem.

**What a hard reset would have done:**
- **Deleted your staged files:** `git reset --hard` throws away everything staged. Because `README.md` and `prompts.md` were newly added and not yet committed, they would have been deleted from disk.
- **Changed the other session's files:** that session had switched this folder to `promo-video` and was committing there. A reset or branch switch in the same folder would have changed the files it was working with.
- **Left the real job undone:** a reset only removes my commit from `promo-video`. The commit still had to be added to `slice-2-project-shell`.

**Why I couldn't just point the branch at the commit:** my commit's parent was the latest promo commit. Pointing `slice-2-project-shell` at it would have pulled all the promo-video commits into Slice 2. I had to cherry-pick the commit onto the Slice 2 branch, and that needs a checkout of that branch to resolve conflicts like the `.prettierignore` one. A separate worktree gave me that checkout without touching this folder.

**The worktree wasn't the only option.** I could have stashed your staged files, switched this folder to `slice-2-project-shell`, cherry-picked, and switched back. That's how I handled the final merge once the promo work was finished. Doing that earlier was only risky while the other session might still be using the folder. Looking back, the worktree caused more confusion than it was worth, and I won't use one again unless you ask.




-----------



No push needed reverting, because the misplaced commit (`7e56d21`) was never pushed to `promo-video`. It only existed in your local copy of the branch. My push command named `slice-2-project-shell` explicitly, and the copy of `promo-video` on GitHub stayed at `b28393c`, the other session's last promo commit. I confirmed that with `git fetch` and `git rev-parse origin/promo-video`.

To remove the commit locally, I ran this in `c:\nike-tracker`:

```powershell
git reset --keep HEAD~1
```

This moved `promo-video` back one commit, to `b28393c`. I chose `--keep` over `--hard` because:
- **It's selective:** it only rewrites files that the removed commit changed, which are the Slice 2 files.
- **It keeps other uncommitted changes:** a hard reset would have discarded them.
- **It refuses rather than overwrites:** if the reset would have clobbered a local edit, it stops instead.

It did unstage your `.gitignore`, `README.md` and `prompts.md` without changing their contents, so I staged them again straight away.

Nothing was rewritten on GitHub, so there was no force-push. The commit's contents weren't lost either: a corrected version is on `main` through [PR #3](https://github.com/tharunkumar1177/tron/pull/3), and the original stays in git's local history log until it expires.

