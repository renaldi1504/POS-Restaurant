---
name: material-design-pos
description: Apply Material Design 3 to the Rumah Makan Berkat POS (pos-web, order-web, mockups) — tokens, components, elderly-friendly phone UI, and the adaptive bottom navigation of most-used features.
---

# Material Design 3 — POS Rumah Makan Berkat

Use this whenever you design, restyle, or build UI for the POS project (staff PWA `apps/pos-web`, customer site `apps/order-web`, or the `.dc.html` mockups). Everything is **phone-first (360–430 px wide) and responsive up to tablets (600–1280 px), used by older staff**, in 4 languages (id/en/km/zh-Hans). Material 3 (Material You) is the visual language; this file is the single source of truth for how it is applied here.

## 1. Principles (in priority order)

1. **Legible and tappable before pretty.** Body text ≥ 16 px, primary actions ≥ 56 px tall, any tap target ≥ 48×48 px with ≥ 8 px between targets. Never rely on color alone: pair it with an icon or a word.
2. **One primary action per screen**: a filled button in the bottom action area or an extended FAB. Everything else is tonal, outlined, or text.
3. **Tonal surfaces, not shadows.** Hierarchy comes from surface-container tones; shadows only for elevated cards, FAB, menus and sheets (levels 1–3).
4. **Familiar M3 components** — don't invent widgets when an M3 component exists.
5. **Consistent across both apps and mockups**: same tokens, same component anatomy.

## 2. Color tokens (seed #047857, generated with material-color-utilities)

Light scheme (default; dark mode optional later, values in §2.1):

| Role | Hex | Use |
|---|---|---|
| primary / on-primary | `#006C4E` / `#FFFFFF` | filled buttons, active nav indicator icon, FAB |
| primary-container / on-primary-container | `#87F8C9` / `#002115` | active nav pill, selected chips, tonal emphasis |
| secondary / on-secondary | `#4C6358` / `#FFFFFF` | less prominent actions |
| secondary-container / on-secondary-container | `#CFE9DA` / `#092017` | tonal buttons, nav indicator, filter chips selected |
| tertiary / on-tertiary | `#3E6374` / `#FFFFFF` | info accents (Telegram, delivery) |
| tertiary-container / on-tertiary-container | `#C1E8FC` / `#001F2A` | info badges/banners |
| error / on-error | `#BA1A1A` / `#FFFFFF` | destructive, cancel, overdue |
| error-container / on-error-container | `#FFDAD6` / `#410002` | error banners, "Habis" |
| warning (custom) / on-warning | `#795900` / `#FFFFFF` | late kitchen tickets, cash difference |
| warning-container / on-warning-container | `#FFDF9F` / `#261A00` | pending/attention badges |
| surface / on-surface | `#F8FAF6` / `#191C1A` | app background, main text |
| on-surface-variant | `#404944` | secondary text, icons |
| surface-container-lowest | `#FFFFFF` | cards on busy screens, inputs |
| surface-container-low | `#F2F4F0` | list sections |
| surface-container | `#ECEEEB` | navigation bar, bottom app bar |
| surface-container-high | `#E7E9E5` | bottom sheets, dialogs, search bar |
| surface-container-highest | `#E1E3DF` | filled text fields, disabled fills |
| outline / outline-variant | `#707973` / `#BFC9C2` | outlined buttons & fields / dividers, card borders |
| inverse-surface / inverse-on-surface / inverse-primary | `#2E312F` / `#EFF1ED` / `#6ADBAE` | snackbars |
| scrim | `#000000` at 32% | behind sheets/dialogs |

Order-status colors map to roles, never raw hex: Baru → tertiary-container, Dimasak → warning-container, Siap → primary-container, Diantar → secondary-container, Selesai → surface-container-highest, Batal → error-container. Channel badges (Grab, foodpanda) may keep their brand color as a small leading dot only.

### 2.1 Dark scheme (only if asked)
primary `#6ADBAE`/on `#003827`, primary-container `#00513A`/on `#87F8C9`, secondary-container `#354B41`, surface `#191C1A`/on `#E1E3DF`, outline `#89938D`, error `#FFB4AB`/container `#93000A`.

## 3. Tailwind 4 mapping (both web apps)

Define tokens once in each app's `index.css` `@theme` (or a shared CSS file imported by both) using M3 names so classes read like the spec:

```css
@theme {
  --color-primary: #006c4e;           --color-on-primary: #ffffff;
  --color-primary-container: #87f8c9; --color-on-primary-container: #002115;
  --color-secondary-container: #cfe9da; --color-on-secondary-container: #092017;
  --color-tertiary-container: #c1e8fc;  --color-on-tertiary-container: #001f2a;
  --color-error: #ba1a1a; --color-error-container: #ffdad6; --color-on-error-container: #410002;
  --color-warning: #795900; --color-warning-container: #ffdf9f; --color-on-warning-container: #261a00;
  --color-surface: #f8faf6; --color-on-surface: #191c1a; --color-on-surface-variant: #404944;
  --color-surface-container-lowest: #ffffff; --color-surface-container-low: #f2f4f0;
  --color-surface-container: #eceeeb; --color-surface-container-high: #e7e9e5;
  --color-surface-container-highest: #e1e3df;
  --color-outline: #707973; --color-outline-variant: #bfc9c2;
  --color-inverse-surface: #2e312f; --color-inverse-on-surface: #eff1ed; --color-inverse-primary: #6adbae;
  --radius-xs: 4px; --radius-sm: 8px; --radius-md: 12px; --radius-lg: 16px; --radius-xl: 28px;
  --shadow-e1: 0 1px 2px rgb(0 0 0 / .3), 0 1px 3px 1px rgb(0 0 0 / .15);
  --shadow-e2: 0 1px 2px rgb(0 0 0 / .3), 0 2px 6px 2px rgb(0 0 0 / .15);
  --shadow-e3: 0 4px 8px 3px rgb(0 0 0 / .15), 0 1px 3px rgb(0 0 0 / .3);
}
```

When migrating, keep old token names working temporarily only as aliases if it shortens the diff, then remove them; the end state uses M3 names only. Don't hardcode hex in components.

**State layers**: hover 8%, focus 10%, pressed 10% of the content color over the container. Implement with a `::before` overlay utility (e.g. `.state-layer`) or `hover:bg-[color-mix(in_srgb,var(--color-on-surface)_8%,transparent)]`. Focus-visible: 3 px outline in `secondary` with 2 px offset.

## 4. Typography

Font: **Roboto Flex / Roboto** for Latin (Material default); fall back to **Noto Sans Khmer** (`lang="km"`) and **Noto Sans SC** (`lang="zh-Hans"`). Numbers in money and order numbers use `font-variant-numeric: tabular-nums`.

M3 type scale, bumped one step for elderly users (sizes px / line-height / weight):

| Token | Size | LH | Wt | Used for |
|---|---|---|---|---|
| display-small | 36 | 44 | 400 | big totals, change due |
| headline-medium | 28 | 36 | 400 | order number on kitchen tickets |
| headline-small | 24 | 32 | 400 | screen titles in large top app bar |
| title-large | 22 | 28 | 500 | small top app bar title, sheet titles |
| title-medium | 18 | 24 | 500 | card titles, menu item names |
| body-large | 17 | 24 | 400 | default body |
| body-medium | 16 | 22 | 400 | secondary body (never smaller for content) |
| label-large | 16 | 20 | 500 | buttons, tabs |
| label-medium | 14 | 18 | 500 | nav bar labels, chips, badges |

The existing text-size setting (normal/large/xlarge) keeps working by scaling the root.

## 5. Shape, elevation, spacing, motion

- Shape: buttons & chips full pill (`rounded-full`) except chips at 8 px; cards 12 px; text fields 4 px top corners (filled) or 4 px all (outlined); bottom sheets 28 px top; dialogs 28 px; FAB 16 px; nav indicator pill 16 px.
- Elevation: level 0 for most surfaces; cards on the menu grid level 1; FAB level 3; menus/sheets level 1 + surface-container-high.
- Spacing: 4 px grid; screen padding 16 px; gap between cards 12 px; list item min height 56 px (72 px with two lines).
- Motion: standard easing `cubic-bezier(0.2,0,0,1)`, 200 ms for small, 300 ms for sheets/page; respect `prefers-reduced-motion`.

## 6. Icons

**Material Symbols Rounded** (variable font, `FILL` 0 → 1 when selected, weight 500, optical size 24). Load via Google Fonts with only the used icon names (`&icon_names=…`) or self-host a subset in the PWA so it works offline. One wrapper component `<Icon name="point_of_sale" filled? size? />`. Replace hand-drawn SVGs and emoji/text glyphs (☰ › ✓ ×) with symbols. Suggested names: Kasir `point_of_sale`, Meja `table_restaurant`, Online `cloud_download`/`notifications_active`, Riwayat `history`, Pengeluaran `payments`, Closing `account_balance_wallet`, Dapur `skillet`, Driver `two_wheeler`, Dashboard `bar_chart`, Kelola menu `restaurant_menu`, Promo `sell`, Meja & QR `qr_code_2`, Users `group`, Settings `settings`, Printer `print`, Lainnya `apps`/`more_horiz`, Keluar `logout`.

## 7. Component anatomy (use these, consistently)

- **Top app bar**: small (64 px, title-large) for detail screens with a leading `arrow_back` icon button (48 px, with `aria-label` "Kembali ke …"); center-aligned on login; large (headline-small) on main hubs. Background surface; on scroll → surface-container.
- **Navigation bar** (bottom, 80 px + safe area, surface-container): 3–5 destinations, icon 24 px in a 64×32 indicator pill (secondary-container) when active, label-medium always visible (older users need labels). See §8 for which destinations appear.
- **Buttons**: filled (primary action), tonal (secondary-container), outlined, text, elevated (rare). Height 56 px for the main bottom action, 48 px elsewhere. Destructive confirm = filled with error color.
- **FAB / extended FAB**: only for the single create action of a screen (e.g. "+ Menu baru" in Kelola menu). Sits above the navigation bar.
- **Cards**: filled (surface-container-highest) for summaries, elevated (lowest + e1) for tappable menu items, outlined (outline-variant) for list groups.
- **Lists**: one-line 56 px, two-line 72 px, leading icon/avatar 40 px, trailing switch/chevron/price.
- **Chips**: filter chips for categories (horizontal scroll), input chips for selected options, assist chips for quick cash amounts.
- **Segmented buttons**: for 2–4 mutually exclusive modes (Dine-in/Take away/Delivery; currency KHR/USD/IDR).
- **Text fields**: outlined by default, 56 px, label floats, supporting text below, error text in error color with `error` icon. Money fields right-aligned tabular numbers with currency suffix. File/image inputs use a tonal "Upload" button plus a preview thumbnail (with crop where the project already crops) — never a raw URL field.
- **Bottom sheets** (modal): option pickers, cart, app "Lainnya" menu; drag handle 32×4, surface-container-high, 28 px top radius, scrim.
- **Dialogs**: confirmations (cancel order, closing with difference) — title-large, body, text buttons right; destructive uses error-colored text button.
- **Snackbar**: inverse-surface, bottom above nav bar, 4–6 s, optional action ("Batal").
- **Badges**: small dot or count on nav icons (new online orders, QR orders, ready-to-deliver).
- **Switch**: M3 switch with icon in the thumb when on (menu availability "Habis").
- **Progress**: linear indeterminate under the top app bar for loading; circular in buttons while submitting.

## 8. Adaptive bottom navigation — "fitur yang sering dipakai"

Staff screens use a bottom **Navigation bar** whose destinations are the user's most-used features, so the things they open most are always one tap away at the bottom.

Rules:
1. Candidate destinations = app menu entries the user's permissions allow (`MENU_ENTRIES` + `hasAnyPermission`). Never show a forbidden route.
2. Track usage locally per user: on each navigation to a top-level destination, increment `count` and set `lastUsed` in `localStorage` key `pos.navUsage.<userId>` (wrap in try/catch). Score = count with time decay (e.g. halve counts older than 14 days) so habits can change.
3. Show **4 slots + "Lainnya"** (5th item opens the full menu bottom sheet, which also holds profile/shift info, sound toggle, logout). If the user has ≤ 5 allowed destinations, show them all and no "Lainnya".
4. Before enough data (< 10 navigations), use role defaults: Kasir → Kasir, Meja, Online, Riwayat; Dapur → Dapur, Printer; Driver → Driver; Owner → Kasir, Online, Dashboard, Kelola menu.
5. Slot order must be **stable**: recompute only at login or once per app start, never reorder while the user is working (older users rely on position memory). The current route is always shown highlighted; if it isn't in the top 4, it temporarily takes the 4th slot.
6. Users can **pin** destinations from the "Lainnya" sheet (pin icon `keep`); pinned items always occupy the first slots, max 4. Store pins in the same storage entry.
7. Badges on nav items: Online (new orders count), Meja (QR orders/bill requests), Driver (ready to deliver).
8. Hide the nav bar on focused flows where it distracts or risks mis-taps: payment, closing wizard, open shift, option sheet, login. Kitchen and driver full-screen views keep it only if the user has more than one destination.
9. Accessibility: `<nav aria-label>`, each item `aria-current="page"` when active, labels always visible, 48 px minimum hit area per item.

## 8b. Responsive layout — phone & tablet (M3 window size classes)

Design phone-first, then adapt by window width (CSS breakpoints; also handle landscape and the text-size zoom):

| Class | Width | Navigation | Layout |
|---|---|---|---|
| Compact | < 600 px (phones) | bottom Navigation bar (§8) | single pane, full-width lists, bottom sheets |
| Medium | 600–839 px (small tablet, phone landscape) | **Navigation rail** on the left (80 px, same adaptive destinations + "Lainnya" at the bottom of the rail, FAB at top) | 2-column grids, list-detail when it fits |
| Expanded | ≥ 840 px (tablet landscape) | Navigation rail (or expanded rail with labels beside icons at ≥ 1200 px) | **list-detail / supporting panes** side by side |

Rules:
1. Same destinations, ordering, pins and badges on bar and rail — only the placement changes. Never show both.
2. Content max width ~1200 px, centered; body text line length ≤ 75 characters (cap forms/settings at ~640 px).
3. Pane patterns per screen (expanded):
   - Kasir: menu grid (left, 3–5 columns adaptive `minmax(160px,1fr)`) + cart/order pane always visible (right, 360–400 px); no cart bar or sheet.
   - Meja: table grid + selected table bill as detail pane.
   - Online / Riwayat: order list + order detail pane.
   - Dapur: tickets in a multi-column masonry/grid (2 cols medium, 3–4 expanded), large type kept.
   - Driver: order list + map pane side by side.
   - Admin (Kelola menu, Users, Promo, Meja & QR): list + edit form pane; Dashboard: KPI cards 2→4 columns, charts side by side.
   - Payment / Closing / Open shift: centered single column (max ~560 px) — focused flows stay simple.
   - Customer site: menu grid 2→3→4 columns; cart becomes a right-side supporting pane on expanded; checkout/status centered max ~640 px.
4. Bottom sheets become side sheets or centered dialogs (max 560 px) on medium/expanded; option sheets → dialog.
5. Touch targets and type sizes do not shrink on tablets.
6. Test at 360×800, 390×844, 768×1024 (portrait tablet), 1024×768 and 1280×800 (landscape); no horizontal scroll at any size.
7. Mockups: add tablet artboards (1024×768 landscape, and 768×1024 where portrait matters) for the key screens.

The customer site (order-web) does **not** use adaptive nav; it keeps a simple flow (menu → cart → checkout → status) with a bottom cart bar (filled, primary) and a top app bar with search.

## 9. Mockups (.dc.html)

Mockups are 390×844 frames. Apply the same tokens by inlining hex values from §2, Roboto + Material Symbols links in `<helmet>`, and the same component anatomy. Show the navigation bar on staff hub screens (Kasir, Meja, Dapur, Driver, Dashboard, Kelola menu) with realistic most-used slots for that role and a badge example. Keep content, copy and 4-language behavior exactly as before — only the visual language changes.

## 10. Checklist before finishing

- [ ] No raw hex or old token names left in components (grep).
- [ ] Every tap target ≥ 48 px; main action ≥ 56 px; body text ≥ 16 px.
- [ ] Icons are Material Symbols with accessible labels on icon-only buttons.
- [ ] Nav bar respects permissions, stable order, pins, badges, hidden on focused flows.
- [ ] Contrast ≥ 4.5:1 for text (on-* colors on their containers satisfy this).
- [ ] Responsive: nav bar < 600 px, rail ≥ 600 px, list-detail panes ≥ 840 px; no horizontal scroll at 360/768/1024/1280 px; Khmer and Chinese labels fit — nav labels stay on one line, truncated with ellipsis, full text in `aria-label`.
- [ ] Existing unit and e2e tests updated (selectors by role/label, not by color classes) and green.
