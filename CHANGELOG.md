# Changelog

All notable changes to `@ascentsparksoftware/react-calendar` are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] — 2026-07-10

First stable release: full feature parity with `@ascentsparksoftware/angular-calendar@22.1.0`,
sharing the same headless core (date math, view-model builders, recurrence expansion,
overlap packing, OKLCH theming pipeline).

### Added

- **Views:** `CalMonthView`, `CalTimeGridView` (1–7 days, `anchorToWeek` day-aware default,
  vertical/horizontal `orientation`), `CalTimelineView` (resource scheduler, horizontal +
  vertical orientation, row virtualization), `CalAgendaView`, `CalYearView`.
- **Components:** `CalEventDialog` (focus trap + opener focus restore), `CalRecurrenceEditor`,
  `CalTimezonePicker`.
- **Provider:** `CalendarProvider` (`defaults`, `dateAdapter`, `recurrenceAdapter`,
  `tokenBridge`, `virtualization`, `intl`, `a11y`) with `useCalendar`/`useCalendarConfig`/
  `useDateAdapter` hooks.
- **Theming:** `deriveTheme`/`applyTheme` OKLCH pipeline, `--cal-*` token contract,
  per-status `statusColors` triplets, token bridge to host design systems, AA-contrast
  guarantees in light and dark modes.
- **Interactions:** touch-first pointer layer — drag-to-move, resize, drag-to-create,
  long-press on touch, keyboard drag with live announcements, `validateChange` veto hook,
  `externalDrop`.
- **Recurrence:** RFC 5545 via `/recurrence` (rrule adapter), windowed expansion in every
  view, exception + this/this-and-following/all edit semantics.
- **Timezones:** explicit IANA zone model, DST-correct wall-clock positioning, `/date-fns`
  adapter over `date-fns` + `date-fns-tz`.
- **Export:** `/export` — ICS, CSV, Excel XML, print/print-to-PDF (Trusted-Types-safe
  DOMParser path).
- **A11y:** ARIA grid patterns, roving tabindex, focus management, localisable
  screen-reader strings, reduced-motion support.
- **SSR/Next.js:** `"use client"` entries, no module-scope DOM access, StrictMode-idempotent
  effects, React-Compiler-safe API.

[Unreleased]: https://github.com/ascentspark/react-calendar/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/ascentspark/react-calendar/releases/tag/v1.0.0
