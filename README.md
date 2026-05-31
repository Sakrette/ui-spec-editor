# UI Spec Editor

A minimal Vite + TypeScript + vanilla DOM/SVG editor for drafting UI specs with explicit geometric constraints and DOF analysis.

## Install

```bash
npm install
```

## Development

```bash
npm run dev
```

## Build

```bash
npm run build
```

`npm run build` emits two entry files in `dist/`:

- `index.html`: regular Vite output for serving over HTTP.
- `index-local.html`: local-open variant that keeps external assets, removes `crossorigin`, and loads the built script from the end of `body`.

## Current scope

- Vanilla TypeScript only, no React/Vue/Svelte.
- SVG canvas with viewport resize.
- Component creation for rectangle and ellipse.
- Constraint editor for binding layout variables to viewport or another component.
- Axis-level DOF analysis using the 2-of-5 rule per axis.
- JSON export of the current project spec.

## Constraint model

Each component uses two independent DOF groups:

- `x`: choose exactly 2 of `left`, `right`, `width`, `ratio`, `centerX`
- `y`: choose exactly 2 of `top`, `bottom`, `height`, `ratio`, `centerY`

The project reaches `DOF = 0` for a component only when both axes use exactly 2 constraint kinds.

- Fewer than 2 kinds on one axis: missing DOF
- More than 2 kinds on one axis: over-constrained
- Repeating the same kind on one axis: over-constrained
