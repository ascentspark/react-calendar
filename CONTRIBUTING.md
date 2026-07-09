# Contributing

Thanks for your interest in improving `@ascentsparksoftware/react-calendar`.

## Reporting bugs vs. requesting features

- **Bugs:** open an issue using the **Bug report** form. A **minimal reproduction is
  required** — the smallest standalone example (StackBlitz or a repo) that shows the problem.
- **Features:** open a **Feature request** and **discuss the API first**. We care a lot about
  a small, consistent public surface; let's agree the shape before code.
- **Security:** do **not** open a public issue. See [`SECURITY.md`](./SECURITY.md) and report
  privately.

## Versioning

The package majors are decoupled from React majors; `peerDependencies` pin the supported
React range (`^19.0.0`). Development happens on `main`.

## Setup & commands

```bash
npm install
npm run build                 # build the library (tsup)
npm run dev -w demo           # the docs/example app (Vite)
npm test                      # vitest run
npm test -w @ascentsparksoftware/react-calendar -- -t "name"   # a single test by name
npm run lint
npm run typecheck
```

Date/adapter specs run under both `TZ=UTC` and a pinned DST zone
(`TZ=America/New_York`) — run them the same way locally before pushing.

## Coding conventions

- **Function components + hooks only**, StrictMode-clean, React-Compiler-safe (plain
  props/state; no mutable stable references), **SSR/Next.js-safe** (no `window`/`document`
  at module scope).
- **Headless core is pure** — no DOM, no date library, no `rrule` imports in `src/core`
  (adapters are supplied via the provider). Pure functions return new immutable values.
- **Theme-agnostic** — component CSS reads only `var(--cal-*)`; no hard-coded colours.
- **Security** — caller text is rendered as **text nodes only**; never `dangerouslySetInnerHTML`
  of caller content; no `eval`.
- **No `any`**, strict TypeScript, no non-null `!` assertions in core math.

## Pull request checklist

- [ ] Tests pass (`npm test`), lint passes (`npm run lint`), build succeeds (`npm run build`)
- [ ] Tests added/updated for the change
- [ ] Public API and docs updated if the surface changed
- [ ] `CHANGELOG.md` updated under `[Unreleased]`
- [ ] No `dangerouslySetInnerHTML` of caller content; StrictMode/SSR-safe
