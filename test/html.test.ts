import { describe, expect, it } from 'vitest';
import { escapeHtml, renderHtml } from '../src/html';
import type { Recipe } from '../src/model';
import { gratin } from './fixtures';

describe('renderHtml', () => {
  it('renders the gratin with spans, banners and classes', () => {
    const html = renderHtml(gratin(), { decimalSeparator: ',' });
    expect(html.startsWith('<div class="trd-wrap">\n<table class="trd-table">')).toBe(true);
    expect(html).toContain(
      '<tr class="trd-banner-row"><td class="trd-banner" colspan="6">Préchauffer le four à 180 °C</td></tr>',
    );
    expect(html).toContain(
      '<tr><td class="trd-qty" data-key="pdt">1,5 kg</td><td class="trd-ingredient" data-key="pdt">Pommes de terre</td>' +
        '<td class="trd-step" data-key="tranche" colspan="2">Éplucher, trancher finement</td>' +
        '<td class="trd-step" data-key="monte" rowspan="7">Disposer en couches dans le plat, napper de la crème chaude</td>' +
        '<td class="trd-step trd-final" data-key="cuisson" rowspan="7">Cuire 1 h</td></tr>',
    );
    expect(html).toContain('<td class="trd-step" data-key="plat" rowspan="2" colspan="2">');
    expect(html.match(/<tr>/g)).toHaveLength(7);
  });

  it('escapes every label (XSS-safe)', () => {
    const evil = '<img src=x onerror="alert(1)">&\'';
    const r: Recipe = {
      prerequisites: [evil],
      ingredients: [{ key: 'a', name: evil, quantity: 1, unit: '<b>' }],
      steps: [{ key: 's', text: evil, inputs: ['a'] }],
    };
    const html = renderHtml(r, { caption: evil });
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;');
    expect(escapeHtml('<>&"\'')).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('supports prefix, sticky, caption and flags invalid recipes', () => {
    const invalid: Recipe = {
      prerequisites: [],
      ingredients: [{ key: 'a', name: 'A' }],
      steps: [{ key: 's', text: 'S', inputs: [] }],
    };
    const html = renderHtml(invalid, {
      classPrefix: 'rx',
      stickyIngredients: true,
      caption: 'Test',
    });
    expect(html).toContain('<div class="rx-wrap">');
    expect(html).toContain('<table class="rx-table rx-sticky rx-invalid">');
    expect(html).toContain('<caption>Test</caption>');
    expect(html).not.toContain('trd-');
  });
});
