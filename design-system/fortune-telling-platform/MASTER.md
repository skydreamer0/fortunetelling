# 通書 Design System

The web app's visual language: an almanac (通書) printed on rice paper.
Tokens live in `apps/web/src/styles/tokens.css`; this file explains intent.

## Principles

1. **Paper, ink, seal.** Rice-paper background, ink text, vermilion only for seals,
   the primary action and "you are here" markers. Never decorative gradients.
2. **Rules, not boxes.** Structure comes from hairline rules and ledger rows;
   raised cards are reserved for self-contained units (domain cards, detail panels).
3. **Every number is auditable.** Charts show real report values and expose their
   formula; colour is never the only carrier of meaning.
4. **Chapters, not a feed.** Reports are numbered chapters (壹…柒, 附) with a sticky index.

## Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `#F3EDE1` | `#16140F` | page |
| `--paper-raised` | `#F8F4EC` | `#1E1B15` | cards, form sheet |
| `--ink` / `--ink-2` / `--ink-3` | `#1D1A15` / `#4A443A` / `#7A7162` | `#ECE4D2` / `#C2B8A3` / `#8F8674` | text hierarchy |
| `--rule` / `--rule-strong` | `#D6CAB3` / `#A99B81` | `#353026` / `#5A5142` | hairlines |
| `--zhu` 朱 | `#B03A26` | `#E0593F` | seal, primary action, current state |
| `--qing` 青 / `--jin` 金 / `--dai` 黛 / `--zi` 紫 | celadon / ochre / indigo / plum | lighter variants | systems & elements |

Five elements: 木 `--qing`, 火 `--zhu`, 土 `--jin`, 金 `--steel`, 水 `--dai`.
Systems: 八字 朱, 紫微 黛, 靈數 金, 八宅 青, 馬雅曆 紫.
四化: 祿 green, 權 plum, 科 blue, 忌 vermilion.

## Type

| Role | Family | Notes |
|---|---|---|
| Display | Chiron Sung HK (fallback Noto Serif TC) | titles, pillars, palace names; wide letter-spacing |
| Body | Noto Sans TC | 16px / 1.75 |
| Script | LXGW WenKai TC | summary sentences and compatibility narrative only |
| Numerals | Cormorant Garamond | always `lining-nums tabular-nums` |

## Components

- **Seal** (`.seal-mark`, `.masthead__seal`): vermilion square with an inset paper line.
- **Segmented / 時辰 grid**: native radio inputs, ink fill when selected (時辰 uses vermilion).
- **Chapter**: numbered index box + display title + one-line lede.
- **Sources**: system-coloured label + component name; every claim carries one.
- **Radar**: SVG, auto-scaled with `niceMax`, scale label on the outer ring, hidden data table.

## Motion

One staggered rise on page load; tab panels fade; everything respects
`prefers-reduced-motion`.
