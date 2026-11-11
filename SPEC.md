# Tabular Recipe DSL — spec v0.1

This document specifies the recipe model, the text format (`.trecipe`), how
text maps to the model, and how a recipe is laid out as a table. It is the
reference for every implementation and consumer of `ln-tabular-recipes-dsl`
(API, web editor, Obsidian plugin…). The library version implementing it is
`0.1.x`.

- [1. The tabular view](#1-the-tabular-view)
- [2. Model](#2-model)
- [3. Text format](#3-text-format)
- [4. From text to model](#4-from-text-to-model)
- [5. Canonical text](#5-canonical-text)
- [6. Layout algorithm](#6-layout-algorithm)
- [7. Diagnostics](#7-diagnostics)

## 1. The tabular view

```
+--------+-----------------+--------------------------------+----------------+-----------+
| Préchauffer le four à 180 °C                                                           |
+--------+-----------------+--------------------------------+----------------+-----------+
| 1,5 kg | Pommes de terre | Éplucher, trancher finement    | Disposer en    | Cuire 1 h |
+--------+-----------------+--------------------------------+ couches dans   |           |
| 1 pcs  | Ail (gousse)    | Frotter le plat à l'ail,       | le plat,       |           |
+--------+-----------------+ puis le beurrer                | napper de la   |           |
| 20 g   | Beurre          |                                | crème chaude   |           |
+--------+-----------------+--------------+-----------------+                |           |
| 500 ml | Crème liquide   | Mélanger     | Porter à        |                |           |
+--------+-----------------+              | frémissement    |                |           |
| 250 ml | Lait            |              |                 |                |           |
+--------+-----------------+              |                 |                |           |
|        | Sel             |              |                 |                |           |
+--------+-----------------+              |                 |                |           |
|        | Muscade         |              |                 |                |           |
+--------+-----------------+--------------+-----------------+----------------+-----------+
```

One row per ingredient. Each step is a cell spanning the ingredients it
(directly or indirectly) combines, read left to right; the rightmost cell is
the final step. Steps without ingredients ("Préchauffer le four") are
full-width banners above the table.

## 2. Model

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

| Field                        | Rule                                                                       |
| ---------------------------- | -------------------------------------------------------------------------- |
| `key`                        | `^[A-Za-z0-9_-]{1,40}$`, unique across ingredients **and** steps           |
| `name`, `text`, prerequisite | non-empty after trimming                                                   |
| `quantity`                   | optional, finite, `> 0`                                                    |
| `unit`                       | optional, requires `quantity`; should belong to the unit vocabulary (§2.2) |
| `inputs`                     | keys of ingredients and/or **earlier** steps, in row order                 |

### 2.1 Tree rules

A recipe with no step is a **draft** (any list of ingredients, possibly empty)
and is valid. As soon as there is one step, the recipe must be a tree:

1. every input references an ingredient or an earlier step (no forward
   reference, hence no cycle);
2. every step has at least one input;
3. every ingredient and every step except the last is consumed by exactly
   one step;
4. the last step — the **final step** — is consumed by nobody (follows from 1).

### 2.2 Units

Default vocabulary: `pcs g kg ml cl l cs cc pincee`. Implementations accept a
custom list. Matching is case-insensitive; the spelling in the list is
canonical. A unit outside the vocabulary is a warning in the JSON model and
cannot be expressed in the text format (it would be read as part of the name).

### 2.3 Normalization

`normalize(recipe)`:

- trims every string; drops empty units; canonicalises known unit spelling;
  omits undefined `quantity`/`unit` properties;
- when the recipe is a valid tree: reorders ingredients by **depth-first
  traversal** from the final step, visiting inputs in order. This makes the
  ingredients of every step contiguous rows.

Steps keep their order. Drafts and invalid recipes keep their ingredient
order. Normalization never fails on well-shaped input.

## 3. Text format

Line based, UTF-8, file extension `.trecipe`, Markdown code-block language
`recipe`. Line breaks: `\n`, `\r\n` or `\r`.

```
%% Gratin dauphinois
before: Préchauffer le four à 180 °C

pdt[1,5 kg Pommes de terre] --> tranche(Éplucher, trancher finement)
ail[1 pcs Ail (gousse)] & beurre[20 g Beurre] --> plat("Frotter le plat à l'ail, puis le beurrer")
creme[500 ml Crème liquide] & lait[250 ml Lait] & sel[Sel] & musc[Muscade] --> melange(Mélanger) --> chaud(Porter à frémissement)
tranche & plat & chaud --> monte(Disposer en couches dans le plat, napper de la crème chaude) --> cuisson(Cuire 1 h)
```

### 3.1 Grammar (EBNF)

```ebnf
document      = line , { newline , line } ;
line          = ws , [ statement ] , ws , [ comment ] ;
comment       = "%%" , { any-char } ;            (* outside labels and quoted strings *)

statement     = before | definition | edges ;
before        = "before" , ws , ":" , ws , ( quoted , ws | raw-before ) ;
raw-before    = { any-char } ;                   (* up to "%%" or end of line, trimmed *)
definition    = node-id , ws , label ;
edges         = node , { ws , "&" , ws , node } ,
                ws , "-->" , ws , node , { ws , "-->" , ws , node } ;
node          = node-id , [ ws , label ] ;
node-id       = id-char , { id-char } ;          (* never contains "-->" *)
id-char       = "A".."Z" | "a".."z" | "0".."9" | "_" | "-" ;

label         = ingredient-label | step-label ;
ingredient-label = "[" , ( quoted-ingredient | raw-square ) , "]" ;
step-label    = "(" , ( ws , quoted , ws | raw-round ) , ")" ;
quoted-ingredient = ws , [ quantity , [ ws , unit ] , ws ] , quoted , ws ;
raw-square    = { char | "[" , raw-square , "]" } ;   (* balanced [ ] only *)
raw-round     = { char | "(" , raw-round , ")" } ;    (* balanced ( ) only *)

quoted        = '"' , { char-except-quote-and-backslash | '\"' | '\\' | "\" } , '"' ;
quantity      = digits , "/" , digits | digits , [ ( "." | "," ) , digits ] ;
unit          = a word of the unit vocabulary (case-insensitive) ;
ws            = { " " | "\t" } ;
```

Notes:

- `before` is a keyword only when followed by `:`; `before[Beurre]` is a node.
- Inside an **unquoted** label everything is literal up to the matching
  closing delimiter; only the label's own delimiter kind is counted for
  nesting: `[Ail (gousse) [bio]]`, `(Mix (well) & stir --> serve)`. `&`,
  `-->` and `%%` are allowed there.
- A **quoted** label is needed when the text has unbalanced delimiters of the
  label's kind, starts with `"`, or (ingredients) when the name could be read
  as a quantity/unit (`["4 épices"]`, `[3 "g truc"]`). In a quoted string, `\"`
  is a quote and `\\` a backslash; any other backslash is literal.
- In an ingredient label a `"` opens a quoted name only when it is the first
  non-blank character or follows a quantity and an optional **known** unit
  (`[2 kg "Pommes ]["]`). Elsewhere it is a literal character
  (`[Sauce "maison"]`).
- Columns in diagnostics are 1-based UTF-16 code-unit offsets (JS string
  indices, CodeMirror positions).

### 3.2 Ingredient label

Unquoted content, after trimming: `[quantity [unit] ] name`.

- `quantity`: `3`, `1.5`, `1,5`, `1/2`, taken only when followed by a blank,
  a letter or the end of the label (`4-épices` is a name).
- `unit`: the next word (it may be glued: `500g`) if it is in the vocabulary
  **and** a non-empty name follows (`[500 g]` = 500 × "g").
- `name`: the rest, trimmed, required.

Quoted form: the quoted string is the name verbatim (trimmed); the text before
it is `quantity [unit]`.

## 4. From text to model

1. Each line is a statement. `before:` lines append prerequisites in order.
2. `id[label]` defines an ingredient, `id(label)` a step. A node is defined
   **once**; any other occurrence is a bare `id`. Bare ids may refer to nodes
   defined **later** in the document (resolved after reading the whole text).
3. `a & b --> s` makes `a` and `b` inputs of `s`. `a --> s1 --> s2` makes `s1`
   the input of `s2`. Edges into one step may be split across statements;
   inputs are appended in order of appearance (this order is the row order).
   Targets of `-->` must be steps; `-->` cannot fan out (`a --> b & c`).
4. Ingredients are listed in order of first mention, then normalized (§2.3).
5. Steps are ordered **topologically** — a step after the steps it consumes —
   ties broken by order of first mention. The step nobody consumes is the
   final step.
6. Tree rules (§2.1) are then checked against text positions. They are
   skipped while there are syntax or reference errors (`SYNTAX_ERROR`,
   `UNTERMINATED_*`, `FAN_OUT`, `UNDEFINED_NODE`, `REDEFINED_NODE`,
   `INGREDIENT_AS_TARGET`) to avoid cascades.

All diagnostics are reported, sorted by position. A failed parse also returns
a best-effort `partial` recipe for previews.

## 5. Canonical text

`serialize(recipe)` writes the normalized recipe as:

1. one `before: …` line per prerequisite, then a blank line if anything follows;
2. drafts: one ingredient definition per line, in order;
3. otherwise one line per step, in step order:
   `input & input --> key(text)`, where each ingredient is defined inline at its
   (single) use and earlier steps appear as bare ids. When the next step's only
   input is the current step, it is appended as a chain:
   `… --> a(x) --> b(y)`;
4. (invalid recipes only) ingredients never used, as standalone definitions.

Labels are quoted only when the unquoted form would not read back
identically. Quantities are written losslessly with the chosen decimal
separator (`.` by default; `,` allowed). The file ends with a newline (the
empty recipe is the empty string).

Invariant: for every valid recipe `r` whose units are in the vocabulary,
`parse(serialize(r)).recipe` deep-equals `normalize(r)`, and
`serialize(parse(serialize(r)).recipe) === serialize(r)`.

## 6. Layout algorithm

Input: a normalized valid recipe. Output: `{ valid, columnCount, banners, rows }`.

- `depth(ingredient) = 0`; `depth(step) = 1 + max(depth(inputs))`.
- Columns: `0` quantity, `1` ingredient name, `1 + depth(step)` for a step.
  `columnCount = 2 + depth(final step)` (2 for drafts and the empty recipe).
- Row `i` = ingredient `i` (normalized order).
- Step cell: starts at the row of its first leaf ingredient, `rowSpan` = number
  of leaf ingredients under it.
- **No empty cells**: a node consumed by a step in column `c` spans up to
  column `c − 1`: ingredient name `colSpan = c − 1`, step
  `colSpan = c − column(step)`. The final step has `colSpan = 1`.
- Quantity cell text = formatted quantity (max 2 decimals by default, chosen
  decimal separator) + space + unit display label; empty when no quantity.
- `rows[r]` lists the cells **starting** on row `r`, left to right — exactly
  what an HTML `<table>` with `rowspan`/`colspan` needs.
- Prerequisites become `banners`, rendered as full-width rows above.
- Invalid recipes: `valid = false`, draft layout (ingredients only).

## 7. Diagnostics

```ts
interface Diagnostic {
  code: DiagnosticCode;
  message: string;
  severity: 'error' | 'warning';
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number; // text (1-based, end exclusive)
  path?: (string | number)[]; // JSON model
  params?: Record<string, string | number>;
}
```

`message` is an English default; translate with `code` + `params`.

| Code                    | Source | Meaning                                         | Params                            | Position                      |
| ----------------------- | ------ | ----------------------------------------------- | --------------------------------- | ----------------------------- |
| `SYNTAX_ERROR`          | text   | Unexpected character or token                   | `expected`, `found`               | offending token / end of line |
| `UNTERMINATED_STRING`   | text   | Quoted string not closed                        | —                                 | from `"` to end of line       |
| `UNTERMINATED_LABEL`    | text   | `[`/`(` not closed on its line                  | `close`                           | from delimiter to end of line |
| `FAN_OUT`               | text   | `&` after `-->`                                 | —                                 | the `&`                       |
| `UNDEFINED_NODE`        | text   | Bare id never defined                           | `key`                             | first occurrence              |
| `REDEFINED_NODE`        | text   | Second definition of an id                      | `key`, `firstLine`                | second definition's id        |
| `INGREDIENT_AS_TARGET`  | text   | `-->` into an ingredient                        | `key`                             | the target                    |
| `CYCLE`                 | text   | Steps consume each other                        | `keys`                            | first step of the cycle       |
| `INVALID_SHAPE`         | JSON   | Wrong type / structure                          | `expected`                        | `path`                        |
| `UNKNOWN_REFERENCE`     | JSON   | Input matches no key                            | `key`                             | `path` of the input           |
| `FORWARD_REFERENCE`     | JSON   | Input is a later (or the same) step             | `key`, `step`                     | `path` of the input           |
| `INVALID_KEY`           | both   | Key not matching the pattern (text: > 40 chars) | `key`                             | id / `path`                   |
| `DUPLICATE_KEY`         | JSON   | Key used twice                                  | `key`                             | `path` of the second          |
| `EMPTY_TEXT`            | both   | Empty name, step text or prerequisite           | —                                 | label / `path`                |
| `INVALID_QUANTITY`      | both   | Quantity ≤ 0 or not finite (`0`, `1/0`)         | `quantity`                        | label / `path`                |
| `UNIT_WITHOUT_QUANTITY` | JSON   | `unit` without `quantity`                       | `unit`                            | `path`                        |
| `UNKNOWN_UNIT`          | JSON   | Unit outside the vocabulary (**warning**)       | `unit`                            | `path`                        |
| `NO_INPUT`              | both   | Step without input                              | `key`                             | step definition / `path`      |
| `MULTIPLE_CONSUMERS`    | both   | Node consumed by more than one step             | `key`, `consumer` (the first one) | the extra use / `path`        |
| `UNCONSUMED`            | both   | Ingredient not used by any step                 | `key`                             | definition / `path`           |
| `MULTIPLE_ROOTS`        | both   | Non-final step consumed by nobody               | `key`, `root`                     | step definition / `path`      |

All are errors except `UNKNOWN_UNIT`.
