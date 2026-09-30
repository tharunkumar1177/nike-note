# Quire Roadmap

Quire is a block-based workspace for pages, databases, and team collaboration, built to match the reference product feature for feature.

## Approved decisions

- Stack: Next.js App Router, pnpm + Turborepo, custom block tree with Lexical for inline text, Node WebSocket realtime service with Redis pub/sub, PostgreSQL + Drizzle, Better Auth, S3-compatible storage, BullMQ, Vitest + Playwright. Details in [architecture.md](architecture.md).
- Sync: server-ordered operations; last writer wins per block property.
- API: tRPC internally; public REST API in a later slice.
- Deploy: Vercel (web) and Fly.io (realtime, worker).
- Email: Resend.

## How to resume

Pick the first unchecked slice. Route it through [the blueprint manifest](blueprints/README.md) and follow the build loop in `AGENTS.md`. Slice branches are named `slice/<number>-<short-name>`.

## Slices

### Foundation

- [ ] 1. Walking skeleton: monorepo scaffold, CI (guard, lint, type-check, test, build, e2e), forbidden-word check
- [ ] 2. Auth and workspaces: sign in with email code, password, or Google; create and switch workspaces
- [ ] 3. Block store: persist blocks through transactions with revisions and conflict handling
- [ ] 4. Basic editor: type paragraphs, headings, and bulleted lists on a page
- [ ] 5. Sidebar page tree: nested pages, create, rename, delete, drag to reorder and nest
- [ ] 6. Page style: title, icon, cover, font, small text, full width, lock page
- [ ] 7. Real-time sync: two sessions co-edit a page with live updates

### Editor and collaboration

- [ ] 8. Members and roles: invite by email, owner/member/guest roles
- [ ] 9. Permissions and share menu: page grants with inheritance, general access
- [ ] 10. Rich blocks: to-do, numbered list, toggle, toggle headings, quote, callout, divider, code
- [ ] 11. Slash menu and markdown shortcuts
- [ ] 12. Block handle: drag, indent, turn into, duplicate, color, multi-block selection, undo and redo
- [ ] 13. Inline formatting: bold, italic, underline, strike, code, links, text and background colors
- [ ] 14. Mentions: people, pages, dates
- [ ] 15. Comments: inline and page comments, resolve and reopen
- [ ] 16. Presence: avatar stack and live cursors

### Databases, search, portability

- [ ] 17. Database core: inline and full-page databases, table view, row pages
- [ ] 18. Property types: all standard property types with number formats and status groups
- [ ] 19. Board, list, and gallery views
- [ ] 20. Filters, sorts, grouping, sub-grouping, calculations
- [ ] 21. Relations and rollups
- [ ] 22. Search: Ctrl+K full-text search with filters and recents
- [ ] 23. Import and export: Markdown, CSV, HTML import; Markdown + CSV zip, HTML, PDF export

### Complete product

- [ ] 24. Trash and version history: restore, permanent delete, page history restore
- [ ] 25. Inbox, notifications, and reminders
- [ ] 26. Files and media: image, video, audio, file, embed, bookmark blocks
- [ ] 27. Advanced blocks: simple table, columns, synced blocks, table of contents, breadcrumb, equation, button, link to page
- [ ] 28. Calendar and timeline views
- [ ] 29. Formulas 2.0
- [ ] 30. Teamspaces, favorites, and Home
- [ ] 31. Publish to web
- [ ] 32. Database templates, locking, and automations
- [ ] 33. Chart, feed, map, and form views
- [ ] 34. Settings, themes, and keyboard shortcuts
- [ ] 35. Public REST API and integrations
- [ ] 36. Page analytics
- [ ] 37. AI features

## Checkpoint log

- 2026-09-30: Phase 0 complete. Stack, name (Quire), and slice plan approved. Next: slice 1.
