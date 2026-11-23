# UI design system

Tokens are defined in `frontend/src/index.css` under `@theme`. The brand colours are CSS variables that `BrandingProvider` sets from college settings at runtime.

| Token | Value | Use |
|---|---|---|
| `navy` | #101B3A | Sidebar, hero bands, headings |
| `primary` | `var(--brand-primary)` default #4163F5 | Buttons, links, focus, selected nav |
| `accent` | `var(--brand-accent)` default #0EAA9E | Success, progress, completion |
| `gold` | #F0B550 | Deadlines, caution (dark text on it, never white) |
| `cloud` | #F4F7FC | App canvas |
| `surface` | #FFFFFF | Cards, tables, forms |
| `ink` / `muted` | #23324B / #5F6F87 | Body / secondary text |
| `line` | #DCE4F0 | Borders |
| `danger` | #C8323C | Errors, destructive actions |

Typeface: Inter with a system fallback. Scale 24/20/16/14/12 px. 8 px spacing rhythm, cards `p-5`, rounded-2xl.

## Components (`src/components/ui.tsx`)
Button (primary/secondary/ghost/danger/accent, loading), Card, PageHeader, Input/Textarea/Select (label, hint and error wired with `aria-describedby`), Checkbox, Badge/StatusBadge, Skeleton/LoadingBlock, EmptyState, ErrorState, **QueryView** (loading/error/empty/data in one place), Progress (`role=progressbar`), Stat, Table (`caption`, `scope`), Tabs (`role=tablist`), Modal (native `<dialog>`), `useConfirm` (sensitive-action confirmation with impact text), Toasts (`aria-live`).

## Accessibility measures
Skip link; visible `:focus-visible` ring; every input labelled; errors announced (`role=alert`); grades, heatmaps and warnings always carry text, not colour alone; reduced-motion respected; the timer announces urgently only in the last minute; 44 px tap targets in navigation; mobile drawer navigation.

## White-label
College name, short name, logo URL, primary/accent colours, time zone, locale, sender name and support email live in `CollegeSettings`. The server rejects a primary colour with less than 4.5:1 contrast against white text. Nothing college-specific is hard-coded in components.
