I want the Quire (which is a Notion clone that runs on the local machine, an browser extension based web application, opens the web page after click browser extension icon's popup window). I don't want it as a cloud deployable project at all. so restructure the blueprints and what so ever.

It reads the md files from the local machine (Folder that has been mapped by the user) and display it as a relevant notion elements. For example




It reads the md files from the local machine (Folder that has been mapped by the user) and display it as a relevant notion elements. For example



- Every newline in md file is a separate block in notion


- For the code blocks use this format (``` your code ```) 
- inline code block `your code`

- Gather data of how markdown file can be structured from this site - Https://www.freecodecamp.org/news/github-flavored-markdown-syntax-examples/

- If you don't clarity on Notion blocks, use Reverse Engineering anything (REA) skill

- we gonna use the same stack in order to get the same result, so what would that be? Research and finalize and write it in plan.md

- Don't use any subagents for designing, architectural plan or for CI review. Do the designing and architectural planning yourself and test it in the cursor browser


If we were going to implement sub pages, the files has to be stored in some structures, right? suggest me the optimal and best one.

## Structure 1

Root Folder
|
|— README.md
|
|— (Sub Folder) 
|     |
|     |—— README.md
|     |—— (Nested folders) 
|— 


## Structure 2

Root Folder
|— README.md
|
|— file1.md
|— file2.md 
|— file3.md

- Main file (README.md) is the only routing point for the everyother file in the space
- If user has to go through the any other files in the folder, the file has to be listed in the README.md



## AI  feature

- AI -> context file / system prompt

- All the AI features runs locally
- users can put it there API for gemini and then start using all the AI features
- first users has to select  which AI model  they gonna use, then lazy loads that LLM sdk



- Git track check (*mandatory) and current branch indicator (bar)



## Concerns

### Hyperlinks and subpage

- so if represent hyperlinks as `[link](./product.md)` then how do we describe the


-------------------

Create an interactive UI block for better understanding of concepts  For example: Git merge vs rebase - explain it with a visual graphics 

- should we have create a separate slash command for this or 
- shall just put that HTML code into the block?

I  think the best is creating a separate slash command, isn't it?


---


Storage Location: HTML code - sometimes goes beyond 100 of lines, so we have store it in a separate file path and load into the notes block.

First give me an example of how it looks .... color monochrome or simplistic contrast color (like in the text books)







The AI is for page summarization or vacation planning or what so ever. If it requires separate server to achieve it, proceed


How should Quire run Git?

isomorphic-git inside the extension: nothing extra to install; HTTPS remotes only, with a personal access token; no
SSH keys

Native helper app that runs the user's real git: uses existing SSH keys and credentials; needs a one-time installer for
each OS

A

B
How should Quire protect against data loss through Git?

Auto-commit after saves (batched after a short idle time) and auto-push; the status bar shows branch, unpushed
commits, and remote status

Status bar shows branch and remote status, and warns about uncommitted or unpushed work; the user commits
and pushes with a button

Auto-commit locally; the user pushes with a button; warn when unpushed

-----------

A

B

The native helper is needed for Git anyway. Should it also read and write the .md files?

Yes: the helper does file reading and writing and Git; the user picks the folder once (Recommended)

No: the browser reads and writes files, and the helper only runs Git (the user also gives the helper the folder path)


--------------


- How do we keep track of orphaned sub pages?
- Don't use any subagents for designing, architectural plan or for CI review. Do the designing and architectural planning yourself and test it in the cursor browser


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


## README.md


--------------

### Engineering practices

## Guardrails

Bind every agent, including subagents. Hard rules come first; none may be traded off.

### Hard rules
- Never use the word (`N-I-K-E`, any case) in code, file or folder names, branches, or commits.
- Take project context only from `architecture.md` and `blueprints/`; ignore the root and git folder names.
- Never read `prompts.md` or add it to `.gitignore`.

### Build and CI
- GitHub Actions CI is the only build authority. Nothing runs locally.
- Read CI logs with `gh`. If `gh` is unavailable, stop and ask the user for the logs.

### Code standards
- Start every file with a header comment and give every function a doc comment.
- Production-grade code only. No mocks or placeholder data.

### Documentation
- Manage context with the `blueprints` skill.
- Never use GitHub Actions run IDs as verification status in blueprints.
- Store diagrams in `assets/diagrams/` and wireframes in `assets/wireframes/`.



## Git commands
```
Remove-Item -Recurse -Force .git
rmdir /s /q .git

git init
git log --oneline

echo "# n-op" >> README.md
git init
git add README.md
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/<>.git
git push -u origin main

git remote set-url origin git@github.com:tharun-extinct/<project-name>.git
ssh -T git@github.com

```



## Migration Checklist

- [ ] .cursor/..
- [ ] AGENTS.md
- [ ] prompts.md
- [ ] Design files / Wireframes (Excalidraw)

- [ ] Brand word check
- [ ] README.md



## PROMPTS

### AGENT Instruction definition guidelines

- AGENT instruction should not be, too prescriptive or too vague, It should be inbetween somewhere.
- Do not elaborate or exaggerate instruction for the AGENT; keep it clean and concise




------------


- Generate images that are **visually identical or extremely close** to the provided UI reference

- Diagrams/ web pages / Explainer videos (create a 3Blue1Brown style video explainer on X. ElevenLabs for audio narration)



## CURSOR

- Codebase Indexing (RAG? Agentic RAG?)

- Tools pruning 

- AGENTS.md (Rewriting - Repeated mistake (Trial and error approaches) - let's say terminal command execution, getting it right after multiple attempts / approaches). Things get it right after multiple attempts

- /summarize, /visualize

- Execution and Approvals > Auto-Review

- `is_background: true` — the main agent starts the subagent and keeps working without waiting for it to finish.

- Fork - Agents Window > Right Click

- Keyboard Shortcuts —— `Cmd+I` (open agent), `Cmd+/` (change models)

- Plan Mode ——> AI research your codebase and generate a structured implementation plan

- **`.cursorignore`:** keeps the file out of Cursor's AI features and indexing. 

Sidepanel chat → **Ctrl+I** or **Ctrl+L**
Agent Layout → **Ctrl+E** (toggle)
Agents Window → Open Agents Window


## AGENTIC Engineering practices

- Plan ——> code (context) ——> Build & Test ——> Review
- Faster != Better          ——>     Incremental developement

### Context Hygiene

- Tools pruning
- Sub-agents definition / description
- 

- JS / node js / java (JDK21) based builds; run it locally

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

- To gain an additional perspective, review agent

## AGENT HQ


Design specialized subagent for Cursor [ Reviewer]. Describe its role and how it should respond. Give description for each agent (cursor) and if additional property required - add them as well.



Research Agent - Research for the existing product's system, features.

Designer - responsible for designing Aesthetics and intuitive UI,  UI workflows. Returns Design plan with granular details. currently it writes code

Coder - writes code consider every possible edge cases

Productmind - Researches [external media like relevant subreddit page, ] what existing product failed address or could have done better that speaks for the product itself. can only be called by {Designer, Research Agent}

Reviewer - reviews code by build error check via gh-cli CI logs, polls and returns what actually causing build fails/ errors

Planner - comes up with a plan, proceeds further if it is approved. writes plan in md file and wait for approval. Planner can invoke these Agents {Architect, Researcher, productmind}


---


subAgent - Research, review through CI logs


- Also come up with the list of best model that are best fit that specific role. [Do web research, get data from only legit sites. Do not spawn subAgents for this task]



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

Normally a repository has one folder (here `c:\n-tracker`), and it can only show one branch at a time. Switching branches swaps the files in that folder. `git worktree add <folder> <branch>` creates another folder with a different branch checked out, and both folders share the same history, commits and remote. A commit made in either folder is immediately visible from the other, because there's only one repository underneath.

That's why I used one:
- Another session had `c:\n-tracker` on the `promo-video` branch.
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



I used a worktree because a hard reset in `c:\n-tracker` would have caused damage there and still wouldn't have fixed the problem.

**What a hard reset would have done:**
- **Deleted your staged files:** `git reset --hard` throws away everything staged. Because `README.md` and `prompts.md` were newly added and not yet committed, they would have been deleted from disk.
- **Changed the other session's files:** that session had switched this folder to `promo-video` and was committing there. A reset or branch switch in the same folder would have changed the files it was working with.
- **Left the real job undone:** a reset only removes my commit from `promo-video`. The commit still had to be added to `slice-2-project-shell`.

**Why I couldn't just point the branch at the commit:** my commit's parent was the latest promo commit. Pointing `slice-2-project-shell` at it would have pulled all the promo-video commits into Slice 2. I had to cherry-pick the commit onto the Slice 2 branch, and that needs a checkout of that branch to resolve conflicts like the `.prettierignore` one. A separate worktree gave me that checkout without touching this folder.

**The worktree wasn't the only option.** I could have stashed your staged files, switched this folder to `slice-2-project-shell`, cherry-picked, and switched back. That's how I handled the final merge once the promo work was finished. Doing that earlier was only risky while the other session might still be using the folder. Looking back, the worktree caused more confusion than it was worth, and I won't use one again unless you ask.




-----------



No push needed reverting, because the misplaced commit (`7e56d21`) was never pushed to `promo-video`. It only existed in your local copy of the branch. My push command named `slice-2-project-shell` explicitly, and the copy of `promo-video` on GitHub stayed at `b28393c`, the other session's last promo commit. I confirmed that with `git fetch` and `git rev-parse origin/promo-video`.

To remove the commit locally, I ran this in `c:\n-tracker`:

```powershell
git reset --keep HEAD~1
```

This moved `promo-video` back one commit, to `b28393c`. I chose `--keep` over `--hard` because:
- **It's selective:** it only rewrites files that the removed commit changed, which are the Slice 2 files.
- **It keeps other uncommitted changes:** a hard reset would have discarded them.
- **It refuses rather than overwrites:** if the reset would have clobbered a local edit, it stops instead.

It did unstage your `.gitignore`, `README.md` and `prompts.md` without changing their contents, so I staged them again straight away.

Nothing was rewritten on GitHub, so there was no force-push. The commit's contents weren't lost either: a corrected version is on `main` through [PR #3](https://github.com/tharunkumar1177/tron/pull/3), and the original stays in git's local history log until it expires.








--------------------






For a "never read this file" instruction, there's almost no difference. Both are just text added to the model's prompt, and neither one actually stops a file from being read. They differ in how and when the instruction gets loaded.

**`AGENTS.md`**
- Plain markdown with no configuration.
- The root file is always included in every agent request. A nested `AGENTS.md` in a subfolder applies when working in that folder.
- It's the simplest choice for project-wide guardrails

**`.cursor/rules/*.mdc`**
- Each rule has frontmatter (`description`, `globs`, `alwaysApply`) that controls when it's loaded:
  - **Always** `alwaysApply: true`
  - **Auto-attached:** loaded when files matching `globs` are in context.
  - **Agent-requested:** the model decides from the `description` whether to pull it in.
  - **Manual:** - @-mention the rule

**The catch for your case:** don't use an auto-attached rule with `globs: prompts.md`. It would only load once `prompts.md` is already in context, which means after it has been read. A "don't read" rule has to be always-on, so `AGENTS.md` or an `alwaysApply: true` rule are equivalent here.

**If you want actual enforcement rather than a request:**
- **`.cursorignore`:** keeps the file out of Cursor's AI features and indexing. 





 read-blocking hook to enforce it.



**What each part blocks:**
- **`beforeReadFile`:** any agent file read of `prompts.md`.
- **`beforeShellExecution`:** commands that mention it, such as `cat prompts.md`, `Get-Content .\prompts.md`, or `type prompts*`. The `prompts` matcher means the script only runs for those commands, not every shell command.
- **`preToolUse`:** a Read or Grep aimed directly at the file or a `prompts*` glob.


**Gaps:**
- A Grep over the whole repo can still match lines inside `prompts.md`. Listing the file in `.cursorignore` closes that.
- A determined workaround, like building the filename from pieces in a script, gets past any string match. Hooks stop accidental reads, not adversarial ones.
- If the script crashes, the action is allowed (it fails open). I left `failClosed` off on purpose: with it on, a broken script would block every file read in the project.

the block will show up in the **Hooks** output channel. If the hooks don't appear in Cursor's **Hooks** settings tab, restart Cursor.




Never consider project root folder; archictecture.md is the only source of truth for project data


// (`.cursor/hooks.json` with a `beforeReadFile` hook): runs a script that denies reads of `prompts.md`.
// A `beforeShellExecution` hook can also catch `cat prompts.md` and similar commands.



The main agent follows `.cursor/orchestrator.md`; if you are the main agent and haven't received it this session, read it before acting. Subagents ignore it and follow their own file in `.cursor/agents/`.

skip the linux and MacOS helper build and shipping while you run it build and compilation check. And when it's goes for public, I shall run all the OS build from the main worflow dispatch. can you able to skip using gh cli?


- skip the test on the CI


since the workflow (GH Actions) is running on the current work branch, why does it have to run on the merge too (merge on the main), just add the workflow dispatch and remove the unnecessary run on the main. 

---

since we need only the windows version of the helper, why can't you skip the other OS's build save time and compute power / cost. Give me a rule to add it to the AGENTS.md


skip the linux and MacOS helper build and shipping while you run it build and compilation check. And when it's goes for public, I shall run all the OS build from the main worflow dispatch. can you able to skip using gh cli?




Ctrl + Z is not undo-ing the deleted block


write the e2e as a separate workflow.


(Can't you run a ) Target specific tests 

- Resource limitation and optimization for better yeild with in low time and cost




------


fix Orchestration instruction, even ask gh workflow for sub agents
Thought tool? - thinking tokens?
always Squash Merge on PR
CI runtime rules (Target test execution in CI, instead of run the whole test files, which have passed earlier)
Don't add --trailer "Co-authored-by Cursor"

gh pr create --repo tharunkumar1177/tron --base main --head slice-1-walking-skeleton --title "Slice 1: walking skeleton with Tauri shell, CI, and releases" --body $body 2>&1 -- $body



PR (pr also merge the code changes, right) vs Merge
thoughts tools control?
CRLF vs LF
If some changes staged by me, commit it with the changes you've made. 

How did you get back the action tokens and how ide parses it?
Reviewer counldnot run shell commands? why?




wire diagrams

(like it used to be in the Gemini diagrams, .





git branch --show-current; git stash push -u -m "auto-stash before switching to main"; git checkout main; git stash pop; git status --short | Select-Object -First 15; git branch --show-current


run git stash drop (list) once you've checked everything.

----------


what is the difference between origin/main and main? origin main is remote and main is local - isn't it? is that right?

Yes, mostly. `main` is your local branch, and you commit to it directly. `origin/main` is your local copy of where `main` was on the remote (`origin`) the last time you ran `git fetch` or `git pull`.

The detail that trips people up is that `origin/main` doesn't update live. It only moves when you fetch, so it can fall behind the real remote.

So when git said your branches "have diverged, and have 1 and 44 different commits each", it meant:
- Local `main` has 1 commit that isn't on `origin/main`.
- `origin/main` has 44 commits that your local `main` doesn't have yet.

The merge you're in the middle of is git combining those two histories. That's how `prompts.md` ended up conflicted.



- explain all the skill use cases briefly ($HOME/.cursor/skills)

Does each word is a token?


---









Cursor already loads most extras lazily ([dynamic context discovery](https://cursor.com/blog/dynamic-context-discovery), [token-efficiency update](https://cursor.com/blog/improved-token-efficiency)):
- **MCP tools:** only server and tool names go into the prompt. Full tool schemas are kept in a folder and read only when needed; Cursor measured a 46.9% token cut in sessions that used MCP tools.
- **Skills:** only each skill's `name` and `description` are loaded up front. The body and `references/` files are read only when the skill is used.

So unused items cost you their one-line listing, not their full content. Here's how to trim each item in your breakdown:

| Item | Tokens | Can you reduce it? |
|---|---|---|
| MCP & dynamic tools | 4.6K | Yes |
| Skills | 3.5K | Yes |
| Subagent definitions | 3.4K | Yes |


**1. MCP servers (4.6K).** The listing includes the usage instructions for each MCP server, and the browser server's are by far the longest. Turn off servers you aren't using under Customize → MCP in the sidebar; disabled servers aren't loaded at all. The same goes for the browser, subscriptions and app-control servers if you can toggle them in your build. Put project-only servers in `.cursor/mcp.json` inside that project instead of the global `~/.cursor/mcp.json`, so they load only where they're needed.

**2. Skills (3.5K).** These are loaded from many places, including `~/.claude/skills` and `~/.codex/skills`, so check for strays there.
- Delete skills you never use.
- For skills you only start yourself with `/name`, add `disable-model-invocation: true` to the frontmatter. The docs say such a skill is then only included when you invoke it.
- For skills that only matter for certain files, add `paths:` globs so they only show up when the agent works on matching files.
- Shorten long descriptions. Your `reverse-engineer-anything` skill fits the `disable-model-invocation` case well: its description is long and it's rarely relevant to this project.
- The ~14 built-in Cursor skills (canvas, loop, sdk and so on) can't be removed according to the docs.

**3. Subagents (3.4K).** Every file in `.cursor/agents/` adds its description to every chat, and you have six. Trim the descriptions to one sentence each. Remove subagents the main agent shouldn't call directly: `productmind`'s own description says only the designer and researcher should invoke it, but it's still listed for every chat.

**4. Rules (675).** These are fine. Keep `AGENTS.md` short, and use glob-scoped or "Apply Intelligently" rules instead of `alwaysApply: true` for anything that isn't universal.

**5. Conversation (14K and growing).** This matters most:
- Start a new chat for each separate task instead of continuing a long thread.
- Use `/summarize` when a chat gets long.
- Reference specific files or line ranges with `@` instead of pasting large logs or whole folders.
- Large tool and shell outputs are already written to files rather than inlined, so you don't need to pre-trim them.

One thing to fix while you're here: your global `~/.cursor/mcp.json` has the Context7 API key in plain text. Move it to an environment variable using `"CONTEXT7_API_KEY": "${env:CONTEXT7_API_KEY}"`. Since the key has now been printed in this chat, it's worth rotating it too. Context7 also isn't among this session's tools, so it may be disabled or failing to connect. If you don't use it, removing it costs nothing.

If you'd like, I can trim the six subagent descriptions and add the frontmatter changes to `reverse-engineer-anything`.


---


You can still call one yourself with `/name`, for example `/architect design the sync layer`. 

1. **Shorten the description.** It's the only part that's always loaded, so one short line keeps it cheap. You can also say "Only on explicit request." This is the right choice for `productmind`: your `designer` and `researcher` subagents call it by name, so it has to stay registered.
2. **Turn it into a skill.** For a subagent you only ever start yourself, move its prompt into `.cursor/skills/<name>/SKILL.md` with `disable-model-invocation: true`. In the body, tell the agent to run the instructions in a subagent. The catch is that you lose the subagent-only fields like `readonly` and `model`.
3. **Move the file out of the agents folders.** Put it somewhere Cursor doesn't scan, and move it back when you need it.


## Codebase indexing: it's agentic search, not RAG

**How it used to work.** Cursor split files into chunks and computed embeddings for them with its own embedding model. It kept them in sync using a Merkle tree of file hashes, so only changed files were re-processed. The agent then had a semantic-search tool it could call alongside grep ([how it worked](https://cursor.com/blog/semsearch), [indexing details](https://cursor.com/blog/secure-codebase-indexing)). Because the agent chose when to search instead of having chunks stuffed into the prompt automatically, that was agentic RAG rather than classic RAG.

**How it works now.** From v3.12, Cursor dropped the embedding path ([Cursor staff on the forum](https://forum.cursor.com/t/codebase-indexing-not-working-in-v-3-12-onwards/167527/7)). The agent uses **Instant Grep**, a local index of short text fragments that narrows down which files can match a regex, then runs the full regex on just those files ([how it works](https://cursor.com/blog/fast-regex-search)). It also uses file globbing and file reads. The index stays on your machine, and no embeddings are stored on Cursor's servers ([Search docs](https://cursor.com/docs/agent/tools/search)).

So today it's agentic search. The model decides what to look for, runs exact-match and regex searches, reads the hits, and repeats until it has what it needs. No similarity-based retrieval step runs before the model. On older builds the indexing progress bar may still show, but that doesn't mean a semantic search tool is available.


---


**What hooks can do**

- **`preCompact`** is the only hook related to summarization. The [hooks docs](https://cursor.com/docs/agent/hooks) say it "cannot block or modify the compaction behavior." It receives `trigger` (whether compaction was "auto" or "manual"), `context_usage_percent`, `context_tokens`, and `messages_to_compact`. Its only output is a `user_message` shown when compaction happens, so it's good for logging or a notification and nothing more.
- **`stop`** can return a `followup_message`, which Cursor sends as your next message. In theory a `stop` hook could send `/summarize`. However, the `stop` hook isn't told how full the context is, so it would have to guess, for example from the size of the transcript file at `transcript_path`. The docs also don't say whether a slash command sent this way runs as a command or arrives as plain text. I haven't tested it, so treat this as an experiment.

**What works in practice**
- Reduce how fast the window fills: delegate searching through lots of files to subagents (they return only a summary), and keep skill and subagent descriptions short, as we covered earlier.

I can set up a `preCompact` hook that logs each compaction and how full the window was. I can also try the `stop` hook experiment and report whether it actually triggers summarization.



---

 



 # ROADMAP.md


 How to build:

 - and follow the build loop in `.cursor/orchestrator.md`


---



- **`/write-instructions`**: plain and easy to find. This is my pick.
- **`/instructions`**: shorter, and still covers both writing and revising.
- **`/prompt-writer`**: if you think of the output as prompts (rules, skills, `AGENTS.md`, command files).
- **`/agent-instructions`**: if you want to make clear it's for agents, not human docs.





CI targeted test execution - rule



 the handoff note only needs the task-specific state.



## Handoff
Write a handoff note so another agent can continue this work. Put it in a `## Handoff` section directly after `## Guardrails` in `AGENTS.md`, replacing any existing `## Handoff` section. Include only what is not already in the Guardrails, `architecture.md`, or `blueprints/`.

- Lessons: ... Write each as a general agent rule that is not specific to this project.


---


- A skill supplements what the model already knows. Do not write skills for user journeys the model already handles well.




-------------



## Runtime environment

- simple py and java code can be run locally
- 

"nothing runs locally" only applies to builds; browser - a local HTTP server


wireframe: goal - just for developers understanding of UI. SVG - are rescalable . 
Don't include/ update wireframe paths in blueprints.
Test: That command set up a throwaway web server so I could look at the SVGs in the browser.

```
I copied my preview page, which put all six SVGs side by side, into a temporary folder under %TEMP%.
I rewrote the image paths in that page from file:///c:/nike-ap/assets/wireframes/... to /w/....
I created a directory junction (a Windows folder link) at %TEMP%\padlink-prev\w that points to c:\nike-ap\assets\wireframes. That way the server could reach the real SVGs without me copying them, so every reload showed the latest edits.
I ran python -m http.server 8765 on that temporary folder and opened http://localhost:8765/ in the browser.

- clean up the temp files
```

python version: Python 3.14.0a7

openjdk 21.0.6 2025-01-21 LTS
OpenJDK Runtime Environment Microsoft-10800203 (build 21.0.6+7-LTS)
OpenJDK 64-Bit Server VM Microsoft-10800203 (build 21.0.6+7-LTS, mixed mode, sharing)

Canvas: Mobile apps (potrait), desktop (landscape)

style.md structure

## cursor ignore

- add hooks.json


## Commands

- Creating a command for ROADMAP.md workflow





A directory junction is a folder entry that holds no files of its own. It stores a pointer to another folder, and Windows follows that pointer every time a program opens a path through it. Nothing gets copied because only one set of files exists on disk. The junction is just a second path that leads to them.

**How it works**

NTFS (the Windows file system) can mark a folder as a *reparse point*. A junction is one kind of reparse point, and it stores a target path. I created mine like this:

```powershell
cmd /c mklink /J "%TEMP%\padlink-prev\w" "c:\nike-ap\assets\wireframes"
```

Say a program asks for `%TEMP%\padlink-prev\w\settings-pen.svg`. As Windows works through the path, it reaches `w`, sees the reparse point, and swaps in the target. The request then continues as `c:\nike-ap\assets\wireframes\settings-pen.svg`. This all happens inside the operating system. Python, the browser, and every other program just see an ordinary folder called `w` holding the SVGs.

**Why I used it for the preview**

- The Python server was serving `%TEMP%\padlink-prev`, which held my temporary `preview.html`. I put it there so the preview page wouldn't end up in the repo.
- `preview.html` loaded the images as `w/main-connected.svg`, `w/settings-pen.svg`, and so on.
- Because `w` points to the real wireframes folder, the server was reading the actual repo files. When I saved an SVG and reloaded the page, the change showed up right away, with no copying or syncing.

A copy would have gone stale after every edit. The junction meant there was only one version of each file.

**Junctions compared with similar features**

- **Shortcut (`.lnk`):** This is a normal file that only File Explorer understands. Python would just see a file called `w.lnk`, not a folder.
- **Symbolic link (`mklink /D`):** This works much like a junction. It can also point to files or network paths, but on Windows it usually needs admin rights or Developer Mode. A junction only works for local folders and needs no special rights, so I used one.
- **Hard link:** This only works for single files, not folders.

**The risk with deleting junctions**

Because programs see the junction as a real folder, deleting it the wrong way can delete the target's contents too. Some tools follow the link and empty it, older PowerShell's `Remove-Item -Recurse` among them. In this case that would have meant the real `assets\wireframes` folder. The safe way is `cmd /c rmdir "%TEMP%\padlink-prev\w"`, which removes only the link and leaves the target alone. That's what I used during cleanup. All your wireframes are still in place, and the temporary folder and junction no longer exist.


## REA

- Do not document reverse Eng source code class, paths, in Blueprints/ or architecture or anywhere; if really necessary create a sep manifest routing file to the code path


It works now. `git check-ignore` no longer matches `references/decompiled`, and the plain `rg` search for `BluetoothHidDevice` (without `--no-ignore`) finds 11 files. Those include the expected `io/appground/blehid/ClassicHidService.java`, the `BluetoothHidDevice$Callback` stub, and several obfuscated classes in `defpackage/`: `c90`, `e10`, `op`, `fg0`, `ng0`, `hd0`, `mc`, `lc`, among others. So the earlier empty result was caused by the ignore rule, not by missing code.

There's a side effect: git now shows `references/` as untracked, which is 9,168 files. A `git add -A` or `git add .` would stage the whole decompiled app and the screenshots. To keep it searchable without risking a commit, you could move the rule into `.git/info/exclude`. But that would hide the folder from ripgrep again, because ripgrep reads that file too. The other option is to keep it out of `.gitignore` and only ever stage explicit paths, which is what I've been doing anyway.


-----------------------


The check confirmed the rule works. With `references/**` back in `.gitignore`, plain `rg` finds 0 files in `references/decompiled`, while `rg --no-ignore` finds all 11 files that use `BluetoothHidDevice`.

`rg --no-ignore-vcs` also finds the same 11 files. It only skips git's ignore files, so it's a slightly narrower option if you'd prefer it. Either way, the rule text I gave you works as written.


----


**HID (Human Interface Device)** is the standard way keyboards, mice, game controllers, and similar input devices talk to a computer. A HID device first sends the computer a *report descriptor*, a small block of bytes that describes the data it will send, for example "3 buttons, an X movement, a Y movement, and a scroll wheel." After that it sends short *reports* in that format, one each time something changes, such as "left button down, moved 5 right, 2 up."

This is why the phone works as a mouse without installing anything on Windows. Over Bluetooth, the app makes the phone present itself as a HID mouse and keyboard. Windows already has drivers for HID, so it accepts the phone the same way it accepts a real Bluetooth mouse. The app supports both flavors of Bluetooth HID:

- **Classic HID** uses Android's `BluetoothHidDevice` API, which is why that name came up in the searches.
- **BLE HID** is the same idea over Bluetooth Low Energy, using the standard GATT HID service.

The wired mode doesn't use HID. Instead, the Windows helper receives the movements over USB and injects them into Windows itself.

**Obfuscated classes** are code that was deliberately renamed to be hard to read. Before releasing an Android app, developers usually run a tool such as R8 or ProGuard. It shrinks the app and replaces meaningful names like `GestureDetector` or `calculateAcceleration()` with short meaningless ones like `c90` or `a()`. The program behaves exactly the same; only the names are lost.

In the decompiled reference app, you can see both kinds of code:

- `io/appground/blehid/ClassicHidService.java` kept its real name. Android has to find certain classes by name, such as services listed in the app manifest, so those can't be renamed.
- Most of the app's own logic ended up in `sources/defpackage/` under names like `c90.java`, `e10.java`, and `el5.java`.

Because those names say nothing about what the code does, you can't find a feature by guessing a class name. You search for what can't be renamed: Android API calls (like `BluetoothHidDevice` or `MotionEvent`), text strings, and numeric constants. That's how the tap, scroll, and acceleration values were pulled from files like `ba.java` and `el5.java` earlier in the project.


---



---
description: How to search and read the gitignored decompiled reference app in references/
alwaysApply: true
---

# Decompiled reference code

`references/` (the decompiled app in `references/decompiled/` and the
screenshots in `references/*.jpg`) is listed in `.gitignore`. Tools that
respect ignore files return nothing for it, so an empty result there does not
mean the code is missing.

## Searching

- Do not use the Grep or Glob tools on `references/`; they return 0 matches.
- Search with `rg` in the Shell, always passing `--no-ignore` and always
  scoping to `references/` so other ignored files are never touched:

  rg --no-ignore -n "BluetoothHidDevice" references/decompiled
  rg --no-ignore -l "setReport" references/decompiled/sources
  rg --no-ignore --files references/decompiled | rg "ClassicHidService"

- To list a directory, use `Get-ChildItem references/decompiled/... -Recurse`.
- Never run `--no-ignore` searches from the repository root.

## Reading

- Open files directly with the Read tool by absolute path, for example
  `c:\nike-ap\references\decompiled\sources\io\appground\blehid\ClassicHidService.java`.
- Obfuscated classes live in `sources/defpackage/` (for example `c90.java`,
  `e10.java`); find them by searching for the platform APIs or string
  constants they use, not by class name.

## Git

- Never stage, commit, or un-ignore anything under `references/`.
- Stage explicit paths only; never `git add -A` or `git add .`.


---------------------


The check confirmed the rule works. With `references/**` back in `.gitignore`, plain `rg` finds 0 files in `references/decompiled`, while `rg --no-ignore` finds all 11 files that use `BluetoothHidDevice`.

`rg --no-ignore-vcs` also finds the same 11 files. It only skips git's ignore files, so it's a slightly narrower option if you'd prefer it. Either way, the rule text I gave you works as written.


---


(Get-Command rg).Source

ripgrep isn't installed on your system. The `rg` I used is a copy bundled with Cursor, and only agent shells have it on their PATH, so the rule still works for agents. In your own terminal you have three options.

**1. Run Cursor's bundled copy by its full path:**

```powershell
& "$env:LOCALAPPDATA\Programs\cursor\resources\app\node_modules\@cursor\ripgrep-win32-x64\bin\rg.exe" --no-ignore -l "BluetoothHidDevice" references/decompiled
```

**2. Install ripgrep for your whole system** (recommended), then open a new terminal:

```powershell
winget install BurntSushi.ripgrep.MSVC
```

**3. Use PowerShell's built-in search**, which needs no install and doesn't read `.gitignore`:

```powershell
Get-ChildItem references/decompiled -Recurse -Filter *.java | Select-String "BluetoothHidDevice" -List | Select-Object -ExpandProperty Path
```

The third option is slower on the 9,000+ decompiled files, but it gives the same result.




------------


Cursor decides when to load a rule from its frontmatter. Which fields you fill in sets one of four trigger modes.

| Mode | Frontmatter | When it loads |
|---|---|---|
| Always | `alwaysApply: true` | Every chat |
| Auto Attached | `globs:` set, `alwaysApply: false` | When a file matching the glob is in context, such as one that is open, @-mentioned, or read by the agent |
| Agent Requested | `description:` set, no `globs`, `alwaysApply: false` | The agent reads the description and pulls in the rule if it looks relevant |
| Manual | No `description`, no `globs`, `alwaysApply: false` | Only when you type `@rule-name` in chat |

Examples:

```markdown
---
description: Kotlin conventions for the Android app
globs: android/**/*.kt
alwaysApply: false
---
```

```markdown
---
description: Use when searching or reading the decompiled reference app in references/, or when comparing behavior against the original app
alwaysApply: false
---
```

Two more ways to scope a rule:

- **Nested rules folders:** putting a `.cursor/rules/` folder inside a subdirectory, such as `android/.cursor/rules/`, limits those rules to work in that subtree.
- **Multiple globs:** separate patterns with commas, as in `globs: android/**/*.kt, android/**/*.kts`.

For your decompiled-code rule, Agent Requested is the best conditional choice. Auto Attached is a poor fit, because a glob like `references/**` only fires after a file from that folder is already in context. That is too late, since the rule exists to tell the agent how to find those files in the first place. With Agent Requested, the description is what triggers the rule, so phrase it the way you would ask: "decompiled", "reference app", "original app behavior". If you want it guaranteed in every chat, keep `alwaysApply: true`; the rule is short, so the extra context is small.


-----------



Here is the full rule with Agent Requested frontmatter. Save it as `.cursor/rules/decompiled-references.mdc`:

```markdown
---
description: Use when searching, reading, or citing the decompiled reference app or its screenshots in references/, including comparing behavior, constants, HID descriptors, gestures, or UI against the original app. Explains how to search this gitignored folder.
alwaysApply: false
---

# Decompiled reference code

`references/` (the decompiled app in `references/decompiled/` and the
screenshots in `references/*.jpg`) is listed in `.gitignore`. Tools that
respect ignore files return nothing for it, so an empty result there does not
mean the code is missing.

## Searching

- Do not use the Grep or Glob tools on `references/`; they return 0 matches.
- Search with `rg` in the Shell, always passing `--no-ignore` and always
  scoping to `references/` so other ignored files are never touched:

  rg --no-ignore -n "BluetoothHidDevice" references/decompiled
  rg --no-ignore -l "setReport" references/decompiled/sources
  rg --no-ignore --files references/decompiled | rg "ClassicHidService"

- To list a directory, use `Get-ChildItem references/decompiled/... -Recurse`.
- Never run `--no-ignore` searches from the repository root.

## Reading

- Open files directly with the Read tool by absolute path, for example
  `c:\nike-ap\references\decompiled\sources\io\appground\blehid\ClassicHidService.java`.
- Obfuscated classes live in `sources/defpackage/` (for example `c90.java`,
  `e10.java`); find them by searching for the platform APIs or string
  constants they use, not by class name.

## Git

- Never stage, commit, or un-ignore anything under `references/`.
- Stage explicit paths only; never `git add -A` or `git add .`.
```

The rule omits `globs` and sets `alwaysApply: false`, which makes it Agent Requested. The agent decides whether to load it from the `description` alone. That's why the description names the folder, uses words like "decompiled", "reference app", and "original app", and lists common topics such as HID descriptors and gestures.

If an agent still misses the rule in a chat, type `@decompiled-references` to load it by hand.



