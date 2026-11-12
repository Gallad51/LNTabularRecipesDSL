// Renders every examples/*.trecipe into examples/demo.html (run `npm run demo`).
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { escapeHtml, parse, renderHtml } from '../dist/index.js';

const css = readFileSync(new URL('../dist/style.css', import.meta.url), 'utf8');
const dir = new URL('../examples/', import.meta.url);
const sections = readdirSync(dir)
  .filter((f) => f.endsWith('.trecipe'))
  .sort()
  .map((file) => {
    const text = readFileSync(new URL(file, dir), 'utf8');
    const result = parse(text);
    const body = result.ok
      ? renderHtml(result.recipe, {
          decimalSeparator: ',',
          stickyIngredients: true,
          stepOrientation: 'auto',
          unitLabels: { pincee: 'pincée', cs: 'c. à s.', cc: 'c. à c.' },
        })
      : `<pre class="error">${escapeHtml(result.diagnostics.map((d) => `${d.line}:${d.column} ${d.code} ${d.message}`).join('\n'))}</pre>`;
    return `<section><h2>${escapeHtml(file)}</h2>${body}<details><summary>DSL</summary><pre>${escapeHtml(text)}</pre></details></section>`;
  });

const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tabular recipes demo</title>
<style>
${css}
body { font-family: system-ui, sans-serif; margin: 1.5rem; background: #fff; color: #1f2328; }
section { margin-bottom: 2.5rem; }
pre { background: #f6f8fa; padding: .75rem; overflow-x: auto; }
.error { color: #cf222e; }
[data-theme='dark'] body, body[data-theme='dark'] { background: #0d1117; color: #e6edf3; }
body[data-theme='dark'] pre { background: #161b22; }
</style>
</head>
<body>
<h1>Tabular recipes demo</h1>
<p><button onclick="document.body.dataset.theme = document.body.dataset.theme === 'dark' ? 'light' : 'dark'">Toggle dark / light</button></p>
${sections.join('\n')}
</body>
</html>
`;
writeFileSync(new URL('demo.html', dir), html);
console.log(`examples/demo.html written (${sections.length} recipes)`);
