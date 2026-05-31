# Annotation Drawing Rules

This note documents the current canvas annotation rules used by the UI spec editor. It is intended as a development reference for future annotation changes.

## Overview

There are only three annotation line types on canvas:

1. Standard dimension line
2. One-way arrow line
3. Dashed guide line

`ratio` uses the one-way arrow form. All non-`ratio` constraints use the standard dimension form. Zero-distance alignment uses only dashed guides.

## Coordinate Conventions

The implementation works in SVG / HTML canvas coordinates:

- `+x`: right
- `+y`: down

For annotation logic, each line uses a local basis:

- `r`: measurement direction, from start point to end point
- `theta`: positive normal direction, defined as 90 degrees counterclockwise from `r` in the intended mathematical sense, mapped to canvas coordinates

Current helper:

- `rotateCcw(r) = (r.y, -r.x)`

## Endpoint Normalization

Before drawing a standard dimension line, endpoints are normalized:

- Prefer left to right
- If `x` is equal, prefer bottom to top in screen coordinates
  - In SVG terms: larger `y` is the start point, smaller `y` is the end point

After normalization:

- `r = normalize(end - start)`
- Text extends along `+r`
- Text offset is applied along `+theta`

This avoids `+r` pointing left and keeps label orientation consistent.

## Unit System

All line geometry is based on the rendered canvas text height.

Current constants:

- `1 unit = annotation font size`
- Font size is currently `12px`

Derived sizes:

- End bar length: `1 unit`
- Arrow triangle side length: `0.5 unit`
- Outer arrow tail: `0.5 unit`
- Label offset from line: text center is shifted `0.75 unit` along `+theta`
  - This makes the text bottom edge sit `0.25 unit` away from the line

## 1. Standard Dimension Line

### Inputs

A standard dimension line is defined by:

- Two reference points
- Two measured points on the dimension line
- Label text

Reference points are the actual geometry anchors on the target and reference objects. Measured points are the projected positions where the dimension line itself is drawn.

### Forms

There are two standard forms:

1. Inner label / inner arrows
   - `|<------->|`
2. Outer label / outer arrows
   - `->|----|<------`

### End Bars

Each endpoint has an end bar:

- Centered on the measured point
- Oriented along `theta`
- Total length is `1 unit`

### Inner Form

Used when there is enough space between the two end bars and no label collision requires moving outside.

Rules:

- The main dimension line runs between the two measured points
- The two arrowheads point inward toward the measured span
- The label is centered along `r`
- The label is shifted only along `+theta`

### Outer Form

Used when:

- The measured span is too short for inner placement, or
- Inner placement would collide with existing labels

Rules:

- The short measured span between the two end bars is still drawn
- The arrows point inward toward the end bars
- Each outer arrow has a `0.5 unit` tail beyond the arrow triangle
- The label is placed outside on one side
- The underline beneath the label extends past the text bounds by `0.5 unit`

Side preference:

- Prefer the positive side first
- If that overflows or collides badly, use the other side

## 2. One-Way Arrow Line

Used only for `ratio`.

### Geometry

- Starts at the component center
- Ends at the upper-right corner of the shape's bounding box
- Uses a start cross marker `+`
- Uses a single arrowhead at the tip

If there is not enough room for inner text, the text moves to the arrow side outside the measured span.

### Ratio for Ellipse

Ellipse has no literal corner on the curve, so:

- The arrow points to the upper-right corner of the ellipse bounding box
- Two dashed guides connect that corner to:
  - the top tangent point
  - the right tangent point

### Ratio Label

The displayed ratio is always produced from continued-fraction approximation.

The value source may come from:

- Active `ratio` constraint value
- Actual rendered `width / height`

But display formatting is unified afterward.

## 3. Dashed Guide Line

Dashed guides are used for:

- Reference-point extension from geometry to measured line
- Zero-distance alignment
- Ellipse ratio corner helpers

No numeric label is drawn for guide-only annotations.

### Zero Distance

When the measured value is effectively zero:

- Do not draw the dimension body
- Do not draw end bars
- Do not draw arrows
- Do not draw label
- Draw only a dashed guide between the two reference points

This represents alignment rather than a usable distance.

## Reference Point Rules

### Center-Based Constraints

If either side uses center:

- `centerX` anchor uses the actual object center `(cx, cy)`
- `centerY` anchor also uses the actual object center `(cx, cy)`

This is true for:

- Rectangle
- Ellipse
- Viewport center

The center anchor is not clamped to the edge.

### Position Constraints

Non-`ratio` position constraints use standard dimension lines.

Examples:

- `left`
- `right`
- `top`
- `bottom`
- `centerX`
- `centerY`

### Size Constraints

#### Rectangle

- `width`: reference points are the lower-left and lower-right corners
- `height`: reference points are the upper-right and lower-right corners

Preferred placement:

- `width` prefers below the shape
- `height` prefers right of the shape

#### Ellipse

- `width`: reference points are the left and right tangent points on the major axis
- `height`: reference points are the top and bottom tangent points on the minor axis

Because the displayed line is outside the ellipse:

- Dashed guides extend from the tangent points to the outer dimension anchors

## Label Placement Rules

### Direction

Labels are placed:

- Centered approximately along `r`
- Offset along `+theta`

They should not be shifted to the `-theta` side.

### Collision Rules

Current priority:

1. Avoid label-label overlap
2. Avoid leaving the viewport
3. Avoid obvious overlap with shape when possible
4. Line crossing is acceptable
5. If parallel lines would visually merge, offset them

### Parallel Line Separation

Current spacing rule:

- Use `3 * lineWidth` additional separation when reserving horizontal / vertical bands

This is intentionally larger than the previous 1-line-width version to avoid merged-looking lines.

## Current Heuristics and Limits

The current implementation is a practical heuristic, not a full constraint-layout solver for annotation placement.

Known characteristics:

- Horizontal and vertical band reservation is still heuristic
- Outer-side choice is simple and not globally optimized
- Label overlap prevention is local, not exhaustive
- Arbitrary angled constraints are partially supported by the vector-based annotation core, but most current anchors are still axis-based because the editor itself is axis-constrained

## Important Source Locations

Main implementation:

- [src/main.ts](../src/main.ts)

Key areas:

- `createStandardAnnotation`
- `createOneWayAnnotation`
- `createHorizontalDimension`
- `createVerticalDimension`
- `createSizeDimension`
- `createRatioOverlay`
- `getBoundaryAnchorPoint`
- `getViewportAnchorPoint`
- `reserveHorizontalBand`
- `reserveVerticalBand`

## When Updating Rules

If annotation behavior changes, update this note together with code, especially when changing:

- local basis definition (`r`, `theta`)
- endpoint normalization
- arrow geometry
- outer-label spacing
- center-anchor behavior
- ratio display behavior
