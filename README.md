# ln-tabular-recipes-dsl

Write recipes as **tabular recipes** — ingredients as rows, preparation steps
as merged cells read left to right — with a small Mermaid-like text format,
and render them as an HTML table.

```
pdt[1,5 kg Pommes de terre] --> tranche(Éplucher, trancher finement)
creme[500 ml Crème] & lait[250 ml Lait] & sel[Sel] --> melange(Mélanger) --> chaud(Porter à frémissement)
tranche & chaud --> monte(Disposer en couches, napper) --> cuisson(Cuire 1 h)
```

```
+--------+-----------------+------------------------------+--------------+-----------+
| 1,5 kg | Pommes de terre | Éplucher, trancher finement  | Disposer en  | Cuire 1 h |
+--------+-----------------+--------------+---------------+ couches,     |           |
| 500 ml | Crème           | Mélanger     | Porter à      | napper       |           |
+--------+-----------------+              | frémissement  |              |           |
| 250 ml | Lait            |              |               |              |           |
+--------+-----------------+              |               |              |           |
|        | Sel             |              |               |              |           |
+--------+-----------------+--------------+---------------+--------------+-----------+
```

- **Zero runtime dependencies**, pure functions, browser-safe: works in a Vue/React
  client, a Node API and an Obsidian plugin.
- Text ⇄ JSON model, both directions, with a canonical form (round-trip safe).
- Precise, **language-neutral diagnostics** (code + params + line/column) for editors.
- Table layout (`rowspan`/`colspan` grid) usable by any renderer, plus a
  ready-made HTML renderer and stylesheet (light & dark).

The format is specified in [SPEC.md](./SPEC.md).

## Install

```sh
npm install ln-tabular-recipes-dsl
```

ESM and CommonJS builds, TypeScript types included. Node ≥ 20 for server use;
any modern browser.

## Quick start

```ts
import { parse, renderHtml } from 'ln-tabular-recipes-dsl';
import 'ln-tabular-recipes-dsl/style.css'; // or <link> dist/style.css

const result = parse(`
before: Préchauffer le four à 180 °C
pdt[1,5 kg Pommes de terre] & creme[20 cl Crème] --> gratin(Disposer, napper) --> cuire(Cuire 1 h)
`);

if (result.ok) {
  element.innerHTML = renderHtml(result.recipe, { decimalSeparator: ',' });
} else {
  for (const d of result.diagnostics) console.log(`${d.line}:${d.column} ${d.code} ${d.message}`);
}
```

## The text format in 30 seconds

| Write                               | Means                                                                                         |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| `id[500 g Farine]`                  | ingredient `id`: quantity `500`, unit `g`, name `Farine` (quantity/unit optional: `sel[Sel]`) |
| `id(Mélanger)`                      | step `id`                                                                                     |
| `a & b --> s(Mélanger)`             | `a` and `b` are the inputs of `s` (in this order → row order)                                 |
| `a --> s1(x) --> s2(y)`             | chain: `s1` is the input of `s2`                                                              |
| `s1 & b --> s2`                     | reuse a defined node by its bare id (definitions may come later in the file)                  |
| `before: Préchauffer le four`       | step without ingredient, shown as a banner above the table                                    |
| `id["4 épices"]`, `s("Cuire (1 h")` | quoted labels (escapes `\"` and `\\`)                                                         |
| `%% comment`                        | comment                                                                                       |

Quantities: `3`, `1.5`, `1,5`, `1/2`. Units (default, case-insensitive):
`pcs g kg ml cl l cs cc pincee`. A recipe is a tree: every ingredient and
every step except the last feeds exactly one step. A recipe with no step is a
valid **draft**. Full grammar and rules: [SPEC.md](./SPEC.md).

## API

All functions are pure and never mutate their input.

### Model

```ts
interface Recipe {
  prerequisites: string[];
  ingredients: Ingredient[];
  steps: Step[];
}
interface Ingredient {
  key: string;
  name: string;
  quantity?: number;
  unit?: string;
}
interface Step {
  key: string;
  text: string;
  inputs: string[];
}
```

Constants: `DEFAULT_UNITS`, `KEY_PATTERN`, `MAX_KEY_LENGTH`.

Shared options (`RecipeOptions`):

| Option             | Default         | Effect                                                                             |
| ------------------ | --------------- | ---------------------------------------------------------------------------------- |
| `units`            | `DEFAULT_UNITS` | Unit vocabulary; matching is case-insensitive, spelling from the list is canonical |
| `decimalSeparator` | `'.'`           | Separator used when **writing** quantities (parsing accepts both)                  |

### `parse(text, options?)`

```ts
parse(text: string, options?: { units?: string[] }): ParseResult
type ParseResult =
  | { ok: true; recipe: Recipe; diagnostics: [] }
  | { ok: false; diagnostics: Diagnostic[]; partial?: Recipe };
```

The returned recipe is normalized. On failure every problem found is
returned, sorted by position, plus a best-effort `partial` recipe for live
previews.

### `serialize(recipe, options?)`

Writes the canonical text (see SPEC §5). `parse(serialize(r)).recipe` deep-equals
`normalize(r)` for valid recipes. Invalid recipes are still written (best effort)
so an editor can switch from a visual mode to text and let `parse` explain the
problems.

### `validate(recipe, options?)`

Checks a JSON recipe (accepts `unknown`, e.g. an API body) and returns
`Diagnostic[]` with a `path` (`['steps', 3, 'inputs', 1]`). Empty, or warnings
only, means valid. Use `hasErrors(diagnostics)` to decide.

### `normalize(recipe, options?)`

Trims, canonicalises units, and reorders ingredients depth-first from the final
step when the tree is valid (so each step's ingredients are contiguous rows).
Never throws on well-shaped input; drafts and invalid recipes keep their order.

### `layout(recipe, options?)`

```ts
interface Layout {
  valid: boolean;
  columnCount: number;
  banners: string[];
  rows: Cell[][];
}
interface Cell {
  kind: 'quantity' | 'ingredient' | 'step';
  key: string;
  text: string;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  final?: boolean;
}
```

`rows[r]` lists the cells **starting** on row `r` — map it straight to
`<tr>`/`<td rowspan colspan>` in any framework. Extra options: `maxDecimals`
(default 2), `unitLabels` (e.g. `{ pincee: 'pincée' }`). Invalid recipes give
`valid: false` and the 2-column ingredient layout.

### `renderHtml(recipe, options?)`

Returns an escaped HTML string (`<div class="trd-wrap"><table class="trd-table">…`).
Options: layout options + `classPrefix` (default `trd`; the bundled CSS uses
`trd`), `stickyIngredients`, `caption`. Classes: `trd-wrap`, `trd-table`,
`trd-sticky`, `trd-invalid`, `trd-banner-row`, `trd-banner`, `trd-qty`,
`trd-ingredient`, `trd-step`, `trd-final`; cells carry `data-key`.

`style.css` exposes custom properties (`--trd-fg`, `--trd-bg`, `--trd-border`,
`--trd-step-bg`, `--trd-final-bg`, `--trd-banner-bg`, `--trd-qty-width`, …)
and switches to dark with `prefers-color-scheme`, `.theme-dark` (Obsidian) or
`[data-theme="dark"]`; `.theme-light` / `[data-theme="light"]` force light.

### Quantities

- `scale(recipe, factor)` multiplies every quantity (e.g. `scale(r, 6 / 4)`
  from 4 to 6 servings). Throws `RangeError` if `factor` is not finite `> 0`.
- `formatQuantity(n, { decimalSeparator?, maxDecimals? })`: `1.5 → "1,5"`,
  `1/3 → "0.33"`; a positive amount is never shown as `0`. No vulgar fractions
  in v0.1.

### Diagnostics and translation

```ts
interface Diagnostic {
  code: DiagnosticCode;
  message: string;
  severity: 'error' | 'warning';
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  path?: (string | number)[];
  params?: Record<string, string | number>;
}
```

`message` is English. Translate with your own templates using the same
`{placeholders}`:

```ts
import { formatDiagnostic, type DiagnosticCode } from 'ln-tabular-recipes-dsl';

const fr: Partial<Record<DiagnosticCode, string>> = {
  UNDEFINED_NODE: 'Le nœud « {key} » est utilisé mais jamais défini.',
  MULTIPLE_CONSUMERS: '« {key} » est déjà utilisé par l’étape « {consumer} ».',
};
formatDiagnostic(diagnostic, fr); // falls back to English for missing codes
```

`DIAGNOSTIC_CODES` lists every code; `DIAGNOSTIC_MESSAGES` holds the English
templates. The full table is in [SPEC.md §7](./SPEC.md#7-diagnostics). Lines
and columns are 1-based, columns in UTF-16 code units (CodeMirror-compatible).

## Usage notes

### Vue

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { layout, type Recipe } from 'ln-tabular-recipes-dsl';
const props = defineProps<{ recipe: Recipe }>();
const grid = computed(() => layout(props.recipe, { decimalSeparator: ',' }));
</script>

<template>
  <table>
    <tr v-for="(banner, i) in grid.banners" :key="'b' + i">
      <td :colspan="grid.columnCount">{{ banner }}</td>
    </tr>
    <tr v-for="(cells, r) in grid.rows" :key="r">
      <td
        v-for="cell in cells"
        :key="cell.kind + cell.key"
        :rowspan="cell.rowSpan"
        :colspan="cell.colSpan"
        :class="cell.kind"
      >
        {{ cell.text }}
      </td>
    </tr>
  </table>
</template>
```

For a live editor, call `parse()` on each (debounced) keystroke and map
diagnostics to editor markers with `line`/`column`/`endColumn`; render
`partial` while the text is invalid.

### Node API

```ts
import { hasErrors, normalize, parse, serialize, validate } from 'ln-tabular-recipes-dsl';

// Accept either text or JSON from clients:
const recipe = body.diagram ? parse(body.diagram) : null;
const problems = recipe ? recipe.diagnostics : validate(body);
if (hasErrors(problems)) return res.status(400).json({ errors: problems });
const stored = recipe?.ok ? recipe.recipe : normalize(body);
// …and give the text back on demand:
const diagram = serialize(stored);
```

### Obsidian

```ts
import { Plugin } from 'obsidian';
import { formatDiagnostic, parse, renderHtml } from 'ln-tabular-recipes-dsl';

export default class TabularRecipePlugin extends Plugin {
  async onload() {
    this.registerMarkdownCodeBlockProcessor('recipe', (source, el) => {
      const result = parse(source);
      if (result.ok) {
        el.innerHTML = renderHtml(result.recipe, { stickyIngredients: true });
      } else {
        const pre = el.createEl('pre');
        pre.setText(
          result.diagnostics.map((d) => `${d.line}:${d.column} ${formatDiagnostic(d)}`).join('\n'),
        );
      }
    });
  }
}
```

Ship `style.css` content as the plugin's `styles.css`. In a note:

````markdown
```recipe
oeufs[3 pcs Oeufs] & sel[Sel] --> battre(Battre) --> cuire(Cuire à feu doux)
```
````

## Development

```sh
npm install
npm test            # vitest
npm run lint        # eslint + prettier --check
npm run typecheck   # src without Node types (browser-safe) + tests
npm run build       # tsup → dist (ESM, CJS, d.ts) + style.css
npm run demo        # examples/*.trecipe → examples/demo.html
```

`examples/` holds a corpus of `.trecipe` files with their expected JSON
models; the test suite checks parsing, round-trip and layout on all of them.

## Publishing (npmjs.org via GitHub Actions)

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and build on Node
20 and 22 for every push and pull request. Publishing
(`.github/workflows/publish.yml`) runs on a `v*` tag, checks that the tag
matches `package.json`'s version, re-runs the checks and publishes with npm
provenance.

First time:

1. **npm account**: create one on <https://www.npmjs.com/signup> and enable 2FA.
2. **GitHub repository**: <https://github.com/Gallad51/LNTabularRecipesDSL>
   (`repository`, `homepage` and `bugs` in `package.json` point to it — npm
   provenance requires `repository.url` to match the GitHub repo).
3. **First publish** — the package must exist before trusted publishing can be
   configured. Either:
   - locally: `npm login && npm publish --access public`, or
   - via CI: create an npm **granular access token** (publish rights on this
     package / all packages), store it as the `NPM_TOKEN` repository secret,
     then `git tag v0.1.0 && git push origin v0.1.0`.
4. **Trusted publishing (recommended)**: on npmjs.com → package → Settings →
   _Trusted Publisher_ → GitHub Actions, with owner `Gallad51`, repository
   `LNTabularRecipesDSL` and workflow `publish.yml`. Then delete the
   `NPM_TOKEN` secret and revoke the token: the workflow authenticates with
   OIDC (`id-token: write`) — no long-lived secret.

Each release afterwards:

```sh
npm version minor        # bumps package.json, commits, tags vX.Y.Z
# update CHANGELOG.md (or before npm version)
git push --follow-tags   # the tag triggers the publish workflow
```

## License

MIT © Grégory Lecomte
