# DESIGN.md — FOKUS

Written from the built system after the white/blue redesign (2026-10-29).

## World

Edtech-standard app shell, owner-pinned: white ground, blue accent, left sidebar with sections.
The colorful module cell track is the single signature move; every other control is the
category standard executed cleanly. Light theme is fixed (study-time scene, desk, daylight).

## Tokens

- `--blue: #2563eb` primary; `--blue-dark: #1d4ed8` hover/active; `--blue-soft: #eff6ff` tint fills;
  `--blue-border: #bfdbfe`
- `--ink: #0f172a` headings/body; `--ink-2: #475569` secondary; `--ink-3: #64748b` tertiary
- `--canvas: #f5f8fc` page ground; `--card: #ffffff` surfaces; `--line: #e2e8f0` hairlines
- `--danger: #dc2626`, `--danger-soft: #fef2f2` destructive; `--ok: #16a34a` done-state only
- Shadows always offset + blur: `--shadow`, `--shadow-lg`; radius `12px` cards, `9px` controls,
  `999px` pills
- Type: system-ui stack (deliberate; workhorse UI face for an Operate surface). Page title
  1.9rem/800, card title 1.08rem/700, body 0.93rem, meta 0.84rem. Lowercase product voice
  for nav/labels/actions ("my roadmaps", "sign out", "mark as done").

## Shell

Fixed 240px white sidebar (brand mark: 34px blue rounded square "F" + FOKUS wordmark;
nav links with 19px stroke icons, active = blue-soft fill + blue-dark text; footer: avatar
chip with 2-letter initials, sign out). Canvas `--canvas`, main content max 1080px.
At <=860px the sidebar hides and a sticky white mobile topbar (blur, hairline border) leads.

## Signature: the vertical module timeline

Left rail with circular nodes (46px, one gradient hue per module index, `cell-1..8`,
dark stops ≥5:1 with white text) and lesson cards to the right (680px column): bold white
title + 2-line clamped description on the matching gradient. The rail is drawn segment by
segment — blue behind finished modules, pale gray ahead. Done = white disc, green check,
green ring; up next = soft blue ring on the node; open module = white+blue double ring on
card and node. Cards are buttons; hover nudges right. Page scrolls naturally; no horizontal
overflow.

## Components

- Module page (`/roadmap/:id/m/:index`): full page per module (replaces the old drawer).
  Gradient hero card (step chip, title, summary), then white section cards — study guide
  (concepts list, blue "practice this" callout, amber "common mistake" callout, source links),
  videos (16:9 embed + rows), courses (platform pill rows) — a full-width mark-done button,
  and prev/next cards with two-line labels. Legacy flat-text guides are formatted into
  paragraphs and lists client-side.
- Cards (dashboard): white, hairline border, offset+blur shadow, hover lift 2px + blue border;
  content-led (topic title, progress bar, meta line) — never icon+heading+text tiles.
- Progress bars: 7px, `#e6edf6` track, blue fill.
- Auth: centered card on radial blue-tinted canvas, brand row, segmented sign-in/register tabs.
- Buttons: primary blue fill white text; secondary white hairline; danger red text on
  `--danger-soft`; ghost gray. Icons inline SVG, stroke 2, lucide grammar, 15-20px.
- Browser surfaces themed: selection `#dbeafe/#1e3a8a`, focus ring 3px `--blue-border`,
  thin scrollbars `#c3cedd`.

## Motion

One authored moment: the module drawer's cubic-bezier slide-in. Cell hovers lift 3px.
Tab/segment transitions 0.15s. Nothing else moves.

## States

Hover/disabled/loading/error/empty everywhere: generating hints, `loading` pulse for
fetches, dashed-border empty state, rate-limit error copy names the wait, 404 page for
missing roadmaps.
