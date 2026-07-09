<div align="center">

# @ascentsparksoftware/react-calendar

A modern, theme-agnostic **calendar & scheduler** for React — month, week, day, year,
agenda and a resource **timeline** — headless-first, SSR/Next.js-safe, timezone-correct,
with RFC 5545 recurrence and a touch-first drag/resize engine.

by&nbsp;<a href="https://ascentspark.com" target="_blank" rel="noopener"><img src="https://cdn.ascentspark.com/assets/images/asc-logo-full.svg" alt="Ascentspark" height="22" valign="middle"></a>

[![npm version](https://img.shields.io/npm/v/@ascentsparksoftware/react-calendar.svg?color=087ea4)](https://www.npmjs.com/package/@ascentsparksoftware/react-calendar)
[![downloads](https://img.shields.io/npm/dm/@ascentsparksoftware/react-calendar.svg)](https://www.npmjs.com/package/@ascentsparksoftware/react-calendar)
[![React 19](https://img.shields.io/badge/React-19-087ea4.svg)](https://react.dev)
[![license MIT](https://img.shields.io/github/license/ascentspark/react-calendar?color=3b82f6)](https://github.com/ascentspark/react-calendar/blob/main/LICENSE)

**[✨ Features](#features)** &nbsp;·&nbsp;
**[🚀 Quick start](#quick-start)** &nbsp;·&nbsp;
**[🎨 Theming](#theming)** &nbsp;·&nbsp;
**[🧩 API](#api)** &nbsp;·&nbsp;
**[♿ Accessibility](#accessibility)** &nbsp;·&nbsp;
**[🔢 Versions](#versions)**

</div>

---

A complete scheduling toolkit you drop into a React app as plain components. Render your own
events through the built-in views — `month`, `week`/`work-week`/`day`, `year`, `agenda`, and a
resource **timeline** (dispatch board) — pass your data as props, and read interactions back as
typed callbacks. Feature-for-feature parity with
[`@ascentsparksoftware/angular-calendar`](https://github.com/ascentspark/angular-calendar):
both packages share the same headless core.

Everything is **headless-first**: all date math, recurrence expansion, overlap-lane layout and
view-model construction are pure functions with no DOM, unit-tested in isolation, and exported
for advanced use. The presentational components render those view models and never compute them
inline. It is **timezone-correct from day one** (an explicit IANA zone travels through the whole
model — it never leans on the host's local `Date`), renders caller content as **plain text only**
(never `dangerouslySetInnerHTML`; Trusted-Types / strict-CSP clean), and derives its entire
palette from a few color inputs so it drops onto any brand in light or dark with **WCAG 2.2 AA**
contrast guaranteed.

## Features

- **Seven views** — `month`, `week`, `work-week`, `day` (a shared time-grid), `year`, `agenda`,
  and a hierarchical resource **`timeline`** with a configurable time axis, collapsible resource
  groups, working-hours / block-out shading, horizontal or vertical orientation, and row
  virtualization for long resource lists.
- **Plain function components + hooks.** StrictMode-clean, React-Compiler-safe, no wrapper
  around your state — props in, callbacks out.
- **SSR / Next.js-safe** — `"use client"` entries, no `window`/`document` at module scope, all
  DOM work inside effects. Drop it behind `next/dynamic` or render it directly in a client
  component.
- **Timezone-correct** — a pluggable date adapter carries an explicit IANA zone through the whole
  model. Default adapter is `date-fns` + `date-fns-tz`; a Temporal adapter is a drop-in later.
- **RFC 5545 recurrence** — RRULE series expansion behind an adapter (default `rrule`), exceptions,
  and **edit this / this-and-following / all** semantics, plus a standalone recurrence editor.
- **Touch-first interactions** — a custom pointer-events layer for drag / create / resize with
  snap, long-press, and sub-pixel projection; fully keyboard-operable move/resize. External
  **drag-in** (native HTML drag-and-drop, no extra deps) drops jobs from an outside list onto a
  timeline lane. A `validateChange` hook vetoes or adjusts any proposed change.
- **Theme-agnostic** — `baseColor` + `accentColor` + `themeMode` + a `statusColors` map derive the
  whole palette as scoped `--cal-*` CSS variables (OKLCH pipeline), with guaranteed AA contrast.
  Any single token is host-overridable, and a **token bridge** defers chosen tokens to your design
  system's own CSS variables.
- **Bring your own markup** — render props override the event chip, day cell, "+N more"
  overflow, resource header and the event-detail dialog body, so you keep full control of
  rendering.
- **Accessible** — correct ARIA `grid` / roving-tabindex patterns, focus trap + opener restore in
  the dialog, visible `:focus-visible` rings, `prefers-reduced-motion`, localisable screen-reader
  strings.
- **Export** — iCalendar (`.ics`), CSV (RFC 4180), Excel (SpreadsheetML) and printable HTML, all as
  pure serializers in a tree-shakable secondary entry point.
- **Tree-shakable** — heavy features (`/date-fns`, `/recurrence`, `/export`) are secondary entry
  points; you only pay for what you import. `sideEffects` limited to CSS, no `any`, strict
  TypeScript.

## Install

```bash
npm install @ascentsparksoftware/react-calendar
```

Peer dependencies: `react` and `react-dom` `^19`.

## Quick start

```tsx
import { CalendarProvider, CalMonthView, CalTimeGridView } from '@ascentsparksoftware/react-calendar';
import { DateFnsDateAdapter } from '@ascentsparksoftware/react-calendar/date-fns';
import '@ascentsparksoftware/react-calendar/styles.css';

const adapter = new DateFnsDateAdapter(); // keep the instance stable (module scope or useMemo)

export function Schedule({ events, date, view }) {
  return (
    <CalendarProvider dateAdapter={adapter} defaults={{ weekStartsOn: 1 }}>
      {view === 'month' ? (
        <CalMonthView
          events={events}
          viewDate={date}
          eventClicked={({ event }) => console.log(event.id)}
        />
      ) : (
        <CalTimeGridView
          events={events}
          viewDate={date}
          days={view === 'day' ? 1 : 7}
          anchorToWeek={view === 'day' ? false : null}
          editable
          eventChanged={({ change }) => save(change)}
        />
      )}
    </CalendarProvider>
  );
}
```

Events are plain objects — `{ id, title, start, end, allDay?, status?, resourceId?,
recurrenceRule?, meta? }` — where `start`/`end` are `Date`s or `{ epochMs, zone }` pairs.
The calendar never mutates them.

### Recurrence

```tsx
import { RruleRecurrenceAdapter } from '@ascentsparksoftware/react-calendar/recurrence';

<CalendarProvider dateAdapter={adapter} recurrenceAdapter={new RruleRecurrenceAdapter()}>
```

Any event carrying a `recurrenceRule` (RRULE string) expands into concrete occurrences in
every view, windowed to the visible period.

### Next.js

The package ships `"use client"` entries. In an App Router page, either render the views from
any client component, or load them lazily:

```tsx
const CalTimelineView = dynamic(
  () => import('@ascentsparksoftware/react-calendar').then((m) => m.CalTimelineView),
  { ssr: false },
);
```

## Theming

High-level inputs derive the full palette (OKLCH, AA-guaranteed) as `--cal-*` custom
properties scoped to the component host:

```tsx
<CalMonthView
  events={events}
  viewDate={date}
  baseColor="#101418"
  accentColor="#22c55e"
  themeMode="dark"
  statusColors={{ confirmed: '#22c55e', pending: '#eab308', cancelled: '#ef4444' }}
/>
```

Each `statusColors` key yields `--cal-event-<key>` / `-ink` / `-soft` triplets used by event
chips (`status: 'confirmed'` on the event picks them up). For the long tail, override any
single token with CSS on the host, or **bridge tokens to your design system** so the calendar
follows your app's theme switching:

```tsx
<CalendarProvider
  dateAdapter={adapter}
  tokenBridge={{ '--cal-accent': '--brand-500', '--cal-bg': '--surface', '--cal-ink': '--text' }}
>
```

Bridged tokens win over the derived theme; unbridged tokens keep their derived values. The
theming machinery (`deriveTheme`, `applyTheme`, token names) is exported for standalone use.

## API

### Components

| Component | Purpose |
|---|---|
| `CalMonthView` | Month grid, multi-day spanning chips, "+N more" overflow popover |
| `CalTimeGridView` | Week/work-week/day time grid (`days` 1–7, `anchorToWeek`, `orientation`), all-day band, drag/resize/create |
| `CalTimelineView` | Resource timeline (rows or columns via `orientation`), grouping, virtualization, drag across resources |
| `CalAgendaView` | Chronological list, `hideEmptyDays` |
| `CalYearView` | 12-month overview with event densities |
| `CalEventDialog` | Accessible event-detail dialog (focus trap, opener restore, `renderEventDetail`) |
| `CalRecurrenceEditor` | RRULE editor (`RecurrenceParts` in/out) |
| `CalTimezonePicker` | IANA zone select |

### Common props (all views)

`events`, `viewDate`, `today`, `timezone`, `locale`, `calendarSystem`, `weekStartsOn`,
theming (`baseColor`, `accentColor`, `themeMode`, `statusColors`, `accentInk`), and the
callbacks `eventClicked`, `viewPeriodChanged`. Time-based views add `hour12`, `slotMinutes`,
`dayStartMinutes`/`dayEndMinutes`, `snapMinutes`, `editable`, `validateChange`,
`eventChanged`, `slotSelected`, `externalDrop`. Render props: `renderEvent`, `renderCell`,
`renderOverflow`, `renderResourceHeader`, `renderEventDetail`.

### Provider

```tsx
<CalendarProvider
  defaults={{ locale: 'en-GB', weekStartsOn: 1, slotMinutes: 15, hour12: false }}
  dateAdapter={adapter}
  recurrenceAdapter={rrule}
  tokenBridge={bridge}
  virtualization={{ rowThreshold: 60 }}
  intl={myIntl}      // visible strings
  a11y={myA11y}      // screen-reader strings
>
```

### Headless core

The pure machinery is exported for custom views: `buildMonthView`, `buildTimeGridView`,
`buildTimelineView`, `buildAgendaView`, `buildYearView`, `expandRecurringEvents`,
`packColumns`, `packRows`, `computeDragTimes`, `detectConflicts`, projection and
virtual-window helpers, plus the full theming API.

## Accessibility

ARIA `grid`/`listbox` patterns with roving tabindex, every interaction keyboard-operable
(arrow keys move/resize a grabbed event, Enter commits, Escape cancels — with live-region
announcements), focus trap + opener focus restore in the dialog, `prefers-reduced-motion`
honoured, and AA contrast guaranteed by the theme pipeline in both modes. Screen-reader and
visible strings are both replaceable wholesale for localisation.

## Versions

| Package line | React | Status |
|---|---|---|
| 1.x | ^19.0.0 | Active |

The package major is decoupled from the React major; the peer range is what matters.
Angular consumer? Use
[`@ascentsparksoftware/angular-calendar`](https://www.npmjs.com/package/@ascentsparksoftware/angular-calendar)
— same core, same tokens, same behavior.

## Security

- Caller content is rendered as **text nodes only** — never `dangerouslySetInnerHTML`, no HTML
  parsing of your data.
- Print/export builds documents via `DOMParser` (Trusted-Types-safe), not string-injected HTML.
- No `eval`, no `Function`, no dynamic script.
- See [`SECURITY.md`](./SECURITY.md) for reporting.

## License

[MIT](./LICENSE) © Ascentspark Software Private Limited
