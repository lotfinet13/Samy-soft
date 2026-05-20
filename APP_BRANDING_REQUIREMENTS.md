# Application branding requirements — SAMY SOFT

Factory-facing Windows packaging and in-app identity. Placeholder icons are generated in-repo; replace `build/icon-source.svg` before final factory branding. See `build/ICON_ASSETS.md`.

---

## Current state (audit)

| Item | Status |
|------|--------|
| `build.win.icon` / `build.icon` in `package.json` | **Configured** → `build/icon.ico` |
| `build/icon.ico` / `build/icon.png` | **Generated** via `npm run icons:generate` (placeholder until factory SVG supplied) |
| `BrowserWindow` `icon` in `electron/main.ts` | **Set** in dev from `build/icon.ico` |
| In-app branding (`branding-service.ts`) | **OK** — factory name, currency, theme from SQLite settings |
| NSIS installer graphics | **Icons wired** — `installerIcon` / `uninstallerIcon`; wizard BMPs still default |

---

## Windows packaging (electron-builder)

### Required assets

| File | Format | Min size | Purpose |
|------|--------|----------|---------|
| `build/icon.ico` | ICO (multi-resolution) | 256×256 included | App executable, taskbar, Alt+Tab |
| Optional `build/icon.png` | PNG 512×512+ | Source for regenerating ICO |

**ICO must embed:** 16×16, 32×32, 48×48, 256×256 (Windows scales for DPI).

### `package.json` configuration (applied)

Icons point to `build/icon.ico`. Regenerate with:

```bash
npm run icons:generate   # reads build/icon-source.svg
npm run icons:verify     # pre-flight before dist:win
```

Use a single master **SVG or 1024×1024 PNG** (square, 15% safe margin). Optional: ImageMagick, GIMP, or edit `build/icon-source.svg` directly.

### NSIS optional polish (later)

- `build/installerHeader.bmp` — 150×57 (wizard header)
- `build/installerSidebar.bmp` — 164×314 (wizard sidebar)
- `build.license` — if EULA required for closed industrial license

---

## Runtime / UI

| Surface | Recommendation |
|---------|----------------|
| Login split panel | Factory logo from settings or static `public/branding/logo.png` (future) |
| PDF / Excel exports | Already use `factoryName` from settings |
| About / workstation info | Show `app.getVersion()` + product name (already via IPC) |

---

## Legal / product copy (already in repo)

- `productName`: `SAMY SOFT`
- `copyright` in `package.json` `build` section
- Closed industrial use — align installer text with license when `build.license` is added

---

## Verification checklist (after adding icons)

1. `npm run build && npm run dist:win`
2. Confirm **no** electron-builder warning: `default Electron icon is used`
3. Inspect `release/win-unpacked/SAMY SOFT.exe` icon in Explorer
4. Install NSIS build — shortcut and Add/Remove Programs show custom icon
5. Run `npm run validate:packaged` (smoke only; does not assert icon pixels)

---

## Out of scope (this phase)

- macOS `.icns` / Linux `.png` (Windows-only product today)
- Code signing certificate (Authenticode) — separate deployment track
- Dynamic per-factory icon from database
