# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). The text format is versioned in
[SPEC.md](./SPEC.md).

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
