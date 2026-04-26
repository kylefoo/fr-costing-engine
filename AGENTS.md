# AGENTS.md

Guidance for AI coding agents (Cursor, Claude Code, Codex, Aider, Devin, etc.) working in this repo. Cursor users: more granular rules live in `.cursor/rules/`.

## Project: fr-costing-engine

Next.js 15 App Router app, exported as a static site, deployed to DigitalOcean App Platform.

## Tech stack

- **Next.js** 15 — App Router only (no `pages/`)
- **React** 19
- **TypeScript** 5 (strict)
- **Tailwind CSS** v4 — PostCSS plugin, OKLCH CSS variables
- **shadcn/ui** — style: `new-york`, base color: `zinc`
- **Icons**: `lucide-react`
- **Package manager**: Yarn 1 (use `yarn`, **never** `npm`)
- **Node**: ≥22.12 (pinned to `22.22.2` in `.nvmrc`)

## Project structure

```
app/                  App Router (pages, layouts, globals.css)
components/ui/        shadcn primitives (vendored, owned source)
components/           App-specific components (non-shadcn)
lib/utils.ts          cn() helper (clsx + tailwind-merge)
public/               Static assets (e.g. background.jpg)
_static/              Build output (served at runtime)
sammy.js              DigitalOcean ASCII banner — printed on `yarn start`
next.config.js        output: 'export', distDir: '_static', images.unoptimized
tsconfig.json         "@/*" alias → repo root
eslint.config.mjs     Flat config (ESLint 9 + FlatCompat for next preset)
postcss.config.mjs    Tailwind v4 PostCSS plugin
components.json       shadcn config (style + base color + aliases)
```

## Commands

| Command | What it does |
|---|---|
| `yarn dev` | Next.js dev server (port 3000) |
| `yarn build` | Production static export → `_static/` |
| `yarn start` | Runs `node sammy.js` banner, then `serve _static/` on `$PORT` (default 8080) |
| `yarn lint` | ESLint (flat config) |

To add a shadcn component:

```bash
yarn dlx shadcn@latest add <name>
```

## Imports

- Use the `@/*` path alias (resolves to repo root). Prefer `@/components/ui/...` and `@/lib/utils` over relative paths.
- For images, **static-import** them so Next.js infers dimensions:

  ```tsx
  import bg from "@/public/bg.jpg"
  <Image src={bg} alt="..." />
  ```

## Styling conventions

- Tailwind v4 — no `tailwind.config.js`. Theme is configured in `app/globals.css` via `@theme inline { ... }`.
- Use **semantic tokens**: `bg-primary`, `text-foreground`, `border-border`, `bg-muted`. Avoid raw colors (`bg-blue-500`) unless intentionally off-theme.
- Use `cn()` from `@/lib/utils` for conditional/merged class strings.
- Dark mode: add `class="dark"` to `<html>` (or via a theme provider) — `.dark { ... }` overrides take effect automatically.

## Constraints (important)

- `output: 'export'` means **static export**: no API routes, no server actions, no middleware that mutates, no `dynamic = 'force-dynamic'`. All data fetching must be build-time (or client-side via `fetch` from the browser).
- `images.unoptimized: true` is required by static export — keep it.
- Do not create a `pages/` directory — App Router only.
- Do not edit `next-env.d.ts` — Next.js regenerates it (and ESLint ignores it).

## Fonts

`Inter` is loaded via `next/font/google` in `app/layout.tsx` and exposed as the `--font-inter` CSS variable. Never use `<link>` tags for Google Fonts.

## Linting & types

- ESLint flat config in `eslint.config.mjs` (uses `FlatCompat` to bring in `next/core-web-vitals` + `next/typescript`).
- `yarn lint` runs `eslint .` (no longer `next lint`).
- TypeScript pinned to `^5` (TS 6 has compatibility issues with current Next.js plugin).

## Deployment

DigitalOcean App Platform, configured via `.do/app.yaml`. The platform runs `yarn build && yarn start`. `$PORT` is provided by the platform.

## AI agent preferences

Tailored defaults for Superpowers and other agent skills working in this repo. User instructions override these; skill defaults defer to this section.

### Verification (before claiming "done")

Run **`yarn build`** and **`yarn lint`** and show their output. A successful build matters more than a passing dev server, since `output: 'export'` failures only surface at build.

```bash
yarn build && yarn lint
```

### Brainstorming

- **Use** for: new features, multi-file refactors, design decisions, anything touching architecture or affecting >2 files.
- **Skip** for: typo/style fixes, single-line tweaks, dependency bumps, formatting, comment edits.

### Test-driven development

- **Currently opt-out** — no test runner is configured yet. Skip the TDD skill until a test framework is added.
- When tests are added (likely Vitest + Testing Library), revisit this and remove the opt-out.

### Systematic debugging

- **Always use** when something breaks: failed builds, lint errors, runtime errors, unexpected UI, type errors. Investigate before patching. Don't guess-and-check.

### Plans and worktrees

- **Write a plan** (writing-plans skill) before: migrations, package-manager swaps, framework upgrades, removing/adding routing strategies, anything reversible-only-with-effort.
- **Use a worktree** (using-git-worktrees skill) only when explicitly requested or when a refactor would meaningfully diverge from `main` for >1 session.

### Package management

- Always use `yarn` (Yarn 1, pinned via `packageManager`). Never `npm install` or `pnpm`.
- To add deps: **run `yarn add <pkg>`**, don't hand-edit `package.json` (yarn updates the lockfile correctly).
- After any dep change, run `yarn install` and re-run `yarn build` to confirm.

### Git etiquette

- **Do not commit** unless I explicitly say "commit this" or similar. Show me the diff first.
- **Never** `git push --force` to `main`, `--no-verify`, or `--amend` someone else's commit.
- When asked to commit, write Conventional-Commits-style messages (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`).

### shadcn workflow

- New component: `yarn dlx shadcn@latest add <name>` (don't hand-write — let the CLI scaffold).
- Keep components in `components/ui/` editable but flag if I run `add` on a customized one (it overwrites).
- Prefer composing existing primitives over installing new ones for trivial UI.

### When in doubt

Ask one focused clarifying question rather than assuming. Especially around:
- Whether to use TypeScript strict-mode escapes (`any`, `as`, `// @ts-ignore`) — default to **no**.
- Whether to add a runtime dependency vs. write a small utility — default to **utility** unless the dep is mainstream and small.
- Whether to break the static-export constraint — default to **no, raise it with me first**.
