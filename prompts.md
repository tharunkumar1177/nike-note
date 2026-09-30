Build a Notion clone, every features should exactly be like Notion but keep the project name as something else. Tech stack - for frontend I think they use Next js and figure out other stacks (come up optimal one)


Now write Main Agent/Orchestrator.

keep in mind that Orchestrator should not just give the other agents a big chunk of work [because the model has only 300k context window], instead it should iteratively build the application using these agents

Github Actions CI is the only compile and Build authority, there is no local runtime. By default use Blueprints skill for  managing context. first come up with a plan and write Agent file for cursor. Build our application with aesthetics and intuitive UI. 



considering the following, create agent file, 

# Guardrails

- Don't mock up UI / data, build production grade application
- Do not use the word 'NIKE' anywhere in the codebase or during file creation
- use `gh-cli` to read CI logs. If you can't able to access the Github CLI, end the session and I will give you the logs of the CI (Actions)
- Never read `prompts.md`


assemblyDebug

Debug Apk vs 


```
cd C:/nike-tracker; git tag -a v0.1.1 -m "v0.1.1 - debug-signed, sideloadable release APK"; git push origin v0.1.1
```


























```
Remove-Item -Recurse -Force .git

rmdir /s /q .git

git init
git log --oneline

```


echo "# Nike-op" >> README.md
git init
git add README.md
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/tharunkumar1177/Nike-op.git
git push -u origin main






Is there any optimal way of installing this application that put all the core components into one installed exe.

If there is any architectural flaws/quirks - come up with a plan. Only proceeed further if it is approved. 
you can always propose optimal implementation than the blueprint , only proceed further if user say approved it

This project right now has many flaws, a lot features / functionalities isn't working as expected. instead of directly editing it, ask questions of "how it could have been implemented better?" or "Stick with the existing system."


Stick with the existing Privileged broker and cleanup [as described in blueprints].
For [clean up for browser, system, temp files and so on] clearing system-level files - on a scheduled date and time. I think there is no UI for user to set these things up. so Create one




and installs a network-routing driver (sometimes needing a restart) plus the app running with admin rights.


--------------


Design specialized subagent for Cursor [Research, Designer, Architect, Coder]. Describe its role and how it should respond. Give description for each agent (cursor) and if additional property required - add them as well.

## Things to consider while create Agent config:

- The Agent instruction should not be - too descriptive/ specific or too vague, It should be inbetween somewhere.

- Also come up with the list of best model that are best fit that specific role. [Do web research, get data from only legit sites]

- Do not exaggerate instruction for the AGENTS


## Agents 

Research Agent - Research for the existing product's system, features.

Designer - responsible for designing Aesthetics and intuitive UI,  UI workflows {write access}

Coder - writes code consider every possible edge cases

Productmind - Researches [external media like relevant subreddit page, ] what existing product failed address or could have done better that speaks for the product itself. can only be called by {Designer, Research Agent}


Reviewer - reviews code by build error check via gh-cli CI

Planner - {Architect, Researcher, productmind} - comes up with a plan, proceeds further if it is approved. writes plan in md file and wait for approval


---

write all the Agent config in an .md file





----


`is_background: true` means the main agent starts the subagent and keeps working without waiting for it to finish.

- **`false` (the default, foreground):** the main agent pauses until the subagent is done, then uses its result right away. Use this when the next step depends on that output. For example, the coder needs the architect's plan before it can start.
- **`true` (background):** the main agent gets control back immediately and carries on with other work. It's notified when the subagent finishes. While the subagent runs, it writes its progress to `~/.cursor/subagents/`, so the main agent can check on it. This suits long, independent jobs.

I left it off for all five agents because each one's output feeds the next step. In a sequence like researcher, then architect, then coder, running in the background wouldn't save time; the main agent would just wait for the result anyway.

Where it could help in your setup:
- **`researcher`:** if you often kick off a long investigation while you or the main agent keep building something unrelated.
- **`productmind`:** probably not. The designer or researcher that calls it needs its findings to continue.

The trade-off is cost. Background agents run in parallel, and each has its own context, so token usage adds up. They also can't ask you questions mid-task, because nothing is waiting on them in the conversation.




subAgent - Research, review through CI logs