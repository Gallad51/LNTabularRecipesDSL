# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). The text format is versioned in
[SPEC.md](./SPEC.md).

## [0.2.0] - 2026-11-12

### Added

- **Partial layout** for visual editors: `layout(recipe, { partial: true })`
  lays out a recipe under construction (a forest: several root steps and/or
  unconsumed ingredients) instead of falling back to the 2-column draft layout.
  Open nodes stretch to the last column and carry the new `Cell.open` flag.
  Complete trees are laid out exactly as before. See SPEC §6.1.
- `normalize(recipe, { partial: true })` puts a forest's rows in forest order;
  new exports `forestOrder`, `treeOrder`, `isForest`, `INCOMPLETE_TREE_CODES`
  and type `NormalizeOptions`.
- `renderHtml` adds class `trd-open` to open cells (dashed border in
  `style.css`).

## [0.1.2] - 2026-11-12

### Added

- `renderHtml` option `stepOrientation` (`'horizontal'` | `'vertical'` |
  `'auto'`): step texts can be turned sideways (read bottom to top) so step
  columns stay narrow on mobile; `'auto'` switches with a container query when
  the wrapper is narrower than 40rem. New classes `trd-vsteps`, `trd-auto`,
  `trd-step-text` and custom property `--trd-step-max-height` in `style.css`.
  Default output is unchanged.
- The demo page renders with `stepOrientation: 'auto'`.

## [0.1.1] - 2026-11-12

First release published from GitHub Actions with npm provenance (trusted
publishing). No library changes.

### Changed

- CI and publish workflows use `actions/checkout@v5` and
  `actions/setup-node@v5` (Node 24 runtime).
- `package.json` now points to the GitHub repository (`repository`,
  `homepage`, `bugs`).

## [0.1.0] - 2026-11-12

First release, implementing spec v0.1.

### Added

- Recipe model (`Recipe`, `Ingredient`, `Step`): a tree of ingredients and
  steps plus prerequisites; drafts without steps.
- Mermaid-like text format (`.trecipe`): `id[qty unit name]`, `id(text)`,
  `&`, `-->` chains, `before:`, `%%` comments, quoted labels, forward
  references, multi-line edges.
- `parse()` with language-neutral diagnostics (code, params, line/column) and
  a partial recipe on failure.
- `serialize()` to a canonical, round-trip-safe text form.
- `validate()` and `normalize()` for JSON recipes.
- `layout()` (rowspan/colspan grid), `renderHtml()` and `style.css`
  (light/dark, sticky ingredient columns).
- `scale()`, `formatQuantity()`, `formatDiagnostic()` for translations.
