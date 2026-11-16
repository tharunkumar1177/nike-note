# Quire product plan

## Core idea

- Quire is a Chromium extension (Chrome, Edge, Brave) built on Manifest V3, paired with a small native helper program on the user's computer. There is no Quire server, no account, and no cloud deploy.
- The popup has one button, **Open Quire**. It opens the full-page app at `chrome-extension://<id>/app.html`, or focuses it if it is already open.
- The app talks to the helper through Chrome native messaging. The helper owns all disk access and Git: it reads and writes the `.md` files, watches for outside changes, runs the user's `git`, and searches files.
- The user picks the notes folder once. The helper remembers it, so no folder permission prompt appears on each browser restart.
- A page shows its `README.md` as Notion-style blocks. Each line is one block. Multi-line constructs (fenced code, tables, front matter) are single blocks.
- Edits save back to the file. Unchanged lines stay byte-for-byte identical.
- Network traffic is limited to the Git remote (through the helper) and the AI provider the user chooses.

## Scope

- Local notes folder of pages, each a folder with a `README.md`
- Notion-style block editing: slash menu, Markdown shortcuts, block handle, inline formatting
- Mandatory Git sync to an `origin` remote with a visible status bar
- Optional AI actions with the user's own provider key (Gemini first)

## Non-goals

Cloud hosting, accounts, multiple users, real-time co-editing, Firefox, Safari, and mobile.

## Page structure

```text
My Notes/
├── README.md                 <- Home page
├── groceries/
│   └── README.md
└── trip-to-japan/
    ├── README.md
    ├── flights/
    │   └── README.md
    └── hotels/
        ├── README.md
        ├── assets/           <- images used by this page
        └── tokyo/
            └── README.md
```

The rules are defined in [architecture.md](architecture.md#page-structure).

## Block mapping

| Markdown | Block | Slash command |
| --- | --- | --- |
| `# ` to `###### ` | Heading 1 to 6 | `/h1` to `/h6` |
| `> ` | Quote | `/quote` |
| `- `, `* `, `+ ` (indentation sets nesting) | Bulleted list | `/bullet` |
| `1. ` | Numbered list | `/numbered` |
| `- [ ] `, `- [x] ` | To-do | `/todo` |
| `---` | Divider | `/divider` |
| Fenced code (three backticks, optional language) | Code, one block across many lines | `/code` |
| `[Title](child/README.md)` | Page (sub-page link) | `/page` |
| Table (header, delimiter, rows) | Table, one block | (slice 13) |
| `![alt](assets/file.png)` | Image | (slice 13) |
| `> [!NOTE]` and the other GFM alerts | Callout | (slice 13) |
| `<details>` | Toggle | (slice 13) |
| Any other line | Text; a blank line is an empty Text block | `/text` |

Inline styles inside a block: `**bold**`, `*italic*` and `_italic_`, `~~strikethrough~~`, `` `code` ``, `[link](url)`, and autolinks. Constructs with no Notion equivalent (HTML lines, footnote definitions, reference link definitions) render as Text blocks that show their source, so files round-trip without loss.

## Git

The notes folder must be a Git repository with an `origin` remote. If either is missing, Quire shows a blocking setup screen. The status bar shows the branch, the saved state, the unpushed commit count, the remote status, and the last successful push time. Sync rules are in [architecture.md](architecture.md#git-sync).

## AI

AI actions (summarize a page, generate blocks, ask about a page) work only after setup: pick a provider and model, then enter a key. Note text is sent only when the user runs an AI action, and the UI says so. Contract: [architecture.md](architecture.md#ai-providers).

## Slices

The ordered slice list and progress live in [ROADMAP.md](ROADMAP.md).
