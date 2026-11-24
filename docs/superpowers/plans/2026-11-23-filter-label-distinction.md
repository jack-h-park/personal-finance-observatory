# Filter group labels vs. options: audit and plan

Status: plan, not started. Date: 2026-11-23.

## Problem

On `/holdings` → 종목별 비중 추이, the row `범위 [전체] [한국 주식] [미국 주식] [가상자산]  보기 [누적] [선]`
does not tell the reader which words are group names and which are options. Only the
selected chip is readable as a control; the group name and every unselected option look
like the same kind of grey text.

### Root cause (measured, not guessed)

The inline pattern is

```tsx
<span className="mr-1 text-label text-ink-3">{copy.scopeFilter}</span>
<LinkChip …>{…}</LinkChip>   // variant 'info'
```

| Property | Group label | Unselected `LinkChip` (`info`) |
| --- | --- | --- |
| Size | `text-label` (11px) | `text-label` (11px) |
| Colour | `text-ink-3` | `text-ink-3` |
| Weight | 400 | 500 |
| Boundary | none | `border-line` = `--border-default` |

`--border-default` against `--bg-card`: **1.07:1 in dark** (#2A2A2A on #252525),
**1.16:1 in light** (#EFEEEA on #FFFFFF). The border is the only thing that marks an
unselected chip as a control, and it is invisible. WCAG 1.4.11 (and guideline §8, "3:1 for
borders that carry meaning") asks for 3:1. `--bg-surface` equals `--bg-card` in dark, so a
surface fill would not help either. What is left is one font-weight step, which Hangul at
11px barely shows.

Secondary causes:

- Inline groups carry no `role="group"` / accessible name, so a screen reader also hears the
  label as loose text next to links (FilterBar already does this right).
- Groups sit side by side on one wrapped line with only `gap-x-4` between them; when the
  row wraps, a label can end up at the end of a line, detached from its options.
- Some rows mix a single-choice selection and an on/off toggle under one label
  (net-worth `보기`: 금액/비중 + 자녀 포함), so even a reader who finds the label cannot
  tell how the options behave.

## Inventory

Every place a row of chips/tabs selects something. "Label" = visible group name.

### A. Labelled inline groups (the reported pattern) — 9 groups, all affected

| # | Page / card | Group label (ko) | Options | Kind | File |
| --- | --- | --- | --- | --- | --- |
| A1 | /holdings · 시장 구성 추이 | 보기 | 금액 / 비중 | single | `app/holdings/page.tsx:434` |
| A2 | /holdings · 종목별 비중 추이 | 범위 | 전체 / 한국 주식 / 미국 주식 / 가상자산 | single | `app/holdings/page.tsx:493` |
| A3 | /holdings · 종목별 비중 추이 | 보기 | 누적 / 선 | single | `app/holdings/page.tsx:501` |
| A4 | /holdings · 종목별 비중 추이 | 따로 보기 | one chip per security | multi toggle | `app/holdings/page.tsx:571` |
| A5 | /holdings · table | 행 기준 | 계좌별 / 종목별 | single | `app/holdings/page.tsx:634` |
| A6 | /net-worth · hero | 기간 | 1M … 전체 (`TrendRangeLinks`) | single | `app/net-worth/page.tsx:260` |
| A7 | /net-worth · hero | 자산군 | one chip per class | multi toggle | `app/net-worth/page.tsx:270` |
| A8 | /net-worth · hero | 보기 | 금액 / 비중 **+ 자녀 포함 toggle** | single + toggle mixed | `app/net-worth/page.tsx:284` |
| A9 | /net-worth · hero | (hint text) | `RangeSelectForm` | form | `app/net-worth/page.tsx:302` |

A9 is a hint sentence in the same grey 11px style; it reads as a fourth label.

### B. Unlabelled chip rows — group boundaries are guesswork

| # | Page / card | What it holds | File |
| --- | --- | --- | --- |
| B1 | / (overview) · 스냅샷 추이 | three groups on one line: 개별/합산 · scope (전체/한국/미국/금…) · metric — separated only by a 1px `bg-line-subtle` rule, in two different chip variants (`info`, `subtle`) | `app/page.tsx:526-560` |
| B2 | / · 현금 흐름 | range chips (`as="nav"`, has aria-label, no visible label) | `app/page.tsx:627` |
| B3 | card headers on /, /holdings ×2, /net-worth | `TrendRangeLinks` in `Card action` | `app/page.tsx:485`, `app/holdings/page.tsx:430,488` |
| B4 | /net-worth · 이력 | 최근 / years / 전체 in `Card action` | `app/net-worth/page.tsx:485` |
| B5 | /fbar | year chips in `Card action` | `app/fbar/page.tsx:84` |

B3–B5 are acceptable as they are: one group, in the card header, with an obvious meaning
(period/year). They still inherit the invisible-border chip, which Phase 1 fixes for free.
B1 is the second real problem.

### C. Already distinguishable — reference designs, no change beyond Phase 1

| Component | Why it works | Used by |
| --- | --- | --- |
| `FilterBar` | each group on its own line, label in a fixed `w-16` column (`Label size="micro"`, 10px), `role="group"` + `aria-label`, `ink` chip recipe | /holdings, /lots, /transactions, /realized, /spending, /cash-inflow |
| `Tabs` | underline tabs, a different shape from chips | /spending, /data-connections, /rebalance/proposals/[id] |
| `SegmentedControl` | one bordered track, no outside label | `LanguageSwitcher` |
| `TickerFilterChip` | a single removable chip with its own wording | /lots, /transactions, /realized |

Note: `FilterBar`'s unselected chips also use `border-line` (1.07:1). They read better
only because the label column and line breaks do the separating.

## Plan

Each phase is one PR. Phases 2–4 depend on Phase 1; 2, 3 and 4 do not depend on each other.

### Phase 0 — rulings (decide before code)

- **R1. Chip boundary.** Add an app token `--border-control` with ≥3:1 against `--bg-card`
  in both themes, and use it for every unselected chip. For reference, `ink-3` at 70%
  gives 3.42:1 dark but only 2.76:1 light, so one opacity on an existing token does not
  pass both themes; a per-theme token value does. Recommended over a filled background,
  because `--bg-surface` = `--bg-card` in dark.
- **R2. Label recipe.** Group labels use `Label size="micro"` (10px, ink-3, regular weight)
  in a fixed-width column, as in `FilterBar`. Options stay 11px medium in ink-2 (not
  ink-3), so label and option differ in size, colour, weight and boundary at once.
  Alternative considered: a trailing colon (`범위:`); rejected as the only cue because it
  does not survive a line wrap.
- **R3. One group per line** in card bodies when there are two or more labelled groups.
  Side-by-side only above `lg`, and only when the label column keeps each group intact
  (`flex-nowrap` inside a group's label + first chip).
- **R4. Selections and toggles do not share a label.** A multi-select toggle row gets its
  own label (or a checkbox-style chip with a ✓ glyph), separate from single-choice groups.
- **R5. Unify chip variants.** `info`, `subtle` and `ink` collapse to two: a selection chip
  and a toggle chip. `subtle` (overview metrics) goes away.

Record the rulings in `docs/ui-guide.md` next to the existing LinkChips row (line ~92).

### Phase 1 — shared component and chip recipe

- New `ChipGroup` in `components/LinkChips.tsx`:
  `<ChipGroup label="범위">…chips…</ChipGroup>` renders `role="group"` with
  `aria-labelledby` pointing at the visible label, the R2 label column, and R3 wrapping.
- Change the `LinkChip` unselected state to `--border-control` + `text-ink-2` (R1, R2).
  This alone fixes B3–B5 and FilterBar's boundaries.
- Make `FilterBar` render its rows through `ChipGroup` so there is one recipe.
- Screenshot net: expect every page with chips to change; review per page, not per pixel.

### Phase 2 — /holdings (A1–A5)

- Replace the five inline `span + LinkChip` blocks with `ChipGroup`.
- 종목별 비중 추이: 범위 and 보기 on separate lines (R3); 따로 보기 keeps its own group
  with the toggle chip (R4).
- 행 기준 (A5) sits right under `FilterBar`; render it as one more `FilterBar` group with
  `countsAsFilter: false` (the prop already exists) instead of a separate row, as
  /cash-inflow (월별/연별) and /spending (정렬) already do. It regroups rows rather than
  narrowing them, so put it last, below a subtle divider from the four narrowing groups.
  It was added inline in #459 by copying the chart-card pattern above it.

### Phase 3 — /net-worth (A6–A9)

- 기간 / 자산군 / 보기 through `ChipGroup`.
- Split 자녀 포함 out of 보기 into its own toggle (R4); copy needs a group label for it,
  e.g. `포함` / "Include" — add to `lib/ui-copy/pages/netWorth.ts`.
- Restyle the `selectHint` sentence (A9) as help text under the form (`text-caption`,
  `aria-describedby`), not as a label-looking line.

### Phase 4 — overview trend toolbar (B1)

- Give the three groups visible labels (보기 / 범위 / 지표 — confirm wording in Phase 0)
  and render them through `ChipGroup`; drop the 1px divider rules.
- Metric group uses the selection chip (R5), not `subtle`.
- When `view=combined` hides the metric group, keep the layout stable (hide the whole
  group including its label).

### Phase 5 — guardrail

- Add a rule to `scripts/ui-guardrails.mjs`: a `text-label text-ink-3` (or `text-micro`)
  `<span>` immediately followed by `<LinkChip` / `<LinkChips` / `<TrendRangeLinks` fails;
  use `ChipGroup`. Ratchet the baseline to zero after Phases 2–4.
- Add a contrast unit test for `--border-control` vs `--bg-card` in both themes (≥3:1),
  next to the existing token contrast checks if any, otherwise as a small node test that
  parses `styles/jhp-app-theme.css`.

## Verification per phase

- `pnpm test`, `pnpm tsc`, `pnpm lint`, `pnpm ui:guardrails` (CI ratchets the last one).
- Screenshot net in light and dark, 375px and desktop, for every page touched.
- Keyboard: Tab reaches each chip; screen reader announces "범위, 그룹" before the options.

## Out of scope

- Moving card-header period chips (B3–B5) into the body.
- Replacing chips with `<select>` on mobile; FilterBar's fold already covers phones.
- Changing the cross-app kit; `--border-control` is an app token. If other Studio apps hit
  the same problem, propose it to `workspace-governance/docs/ux` separately.
