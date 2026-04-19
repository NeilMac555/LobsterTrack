# SteamWatch — Logo assets

**Concept:** Line Break. A calm baseline that breaks sharply at a marker — the exact moment syndicate money enters the market. Dotted vertical = the steam event; dot = the signal intercept.

## Color

| Token           | Hex       | Usage                           |
|-----------------|-----------|---------------------------------|
| `--sw-blue`     | `#22d3ee` | Primary accent — the line & mark|
| `--sw-night`    | `#0d1418` | Brand black / container fill    |
| `--sw-ink`      | `#e8edf0` | Wordmark on dark                |
| `--sw-ink-sub`  | `#8a94a0` | `.io` TLD on dark               |

Mark fill is the night color so it punches clean off dark chrome.

## Files

```
export/
├─ mark.svg                      Transparent mark (cyan on transparent)
├─ mark-on-dark.svg              Mark in rounded-square night container (primary)
├─ mark-mono-dark.svg            1-color dark — for light/print surfaces
├─ mark-mono-white.svg           1-color white — for dark photography, merch
├─ favicon.svg                   32×32 optimized favicon
├─ lockup-horizontal-dark.svg    Mark + "SteamWatch.io" wordmark, dark bg
├─ lockup-horizontal-light.svg   Same, light bg
└─ lockup-stacked.svg            Mark above wordmark (narrow contexts)
```

## Typography

Wordmark is set in **Inter Tight**, weight 700, letter-spacing −0.5px. The `.io` is weight 500 in the secondary ink token.

## Clearspace

Minimum clearspace around the mark = ½ of the mark's height on all sides. Don't crowd it; it's already compact.

## Minimum sizes

- Favicon / app icon: 16 px square
- In-product header mark: 24 px
- Primary lockup: 120 px wide

Below 16 px, drop the dotted intercept line — keep only the baseline, spike, and dot.

## Don'ts

- Don't recolor the line to anything other than `--sw-blue`, `--sw-night`, or white.
- Don't rotate or flip the mark — the direction of the break is meaningful (line goes down-and-right = odds shortening).
- Don't add a glow or drop-shadow. The mark reads flat.

## HTML snippet

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<a href="/" class="brand">
  <img src="/logos/mark-on-dark.svg" width="28" height="28" alt="">
  <span>SteamWatch<span class="tld">.io</span></span>
</a>
```

```css
.brand { display:inline-flex; align-items:center; gap:10px;
  font: 700 18px/1 "Inter Tight", system-ui, sans-serif;
  letter-spacing: -0.02em; color: #e8edf0; }
.brand .tld { color:#8a94a0; font-weight:500; }
```
