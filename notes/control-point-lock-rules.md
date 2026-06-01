# Control Point Lock Rules

This note records the intended rule model for deciding when control points must be disabled because of locked constraints.

It is a design reference first. Implementation can follow after the rule table is agreed.

## 1. Base Variables

Treat the layout geometry as four base variables:

- `l`: left
- `r`: right
- `u`: top
- `d`: bottom

All other values are derived:

- `x = (l + r) / 2`
- `y = (u + d) / 2`
- `w = r - l`
- `h = u - d`
- `ratio = h / w`

This is the clearest basis for reasoning about locks, because each active constraint is either:

- fixing one base variable directly, or
- fixing a combination of base variables

## 2. Constraint Meaning

### Horizontal

- `left`
  - fixes `l`
- `right`
  - fixes `r`
- `centerX`
  - fixes `l + r`
- `width`
  - fixes `r - l`

### Vertical

- `top`
  - fixes `u`
- `bottom`
  - fixes `d`
- `centerY`
  - fixes `u + d`
- `height`
  - fixes `u - d`

### Ratio

- `ratio`
  - fixes `(u - d) / (r - l)`
  - equivalently fixes `h / w`

`ratio` does not directly lock a single side. It only couples width and height.

## 3. Control Point Meaning

All control points are operations on the base variables.

### Single-axis controls

- `l`
  - changes `l`
- `r`
  - changes `r`
- `u`
  - changes `u`
- `d`
  - changes `d`

### Center move

- `c`
  - horizontal move: changes `l` and `r` by the same amount
  - vertical move: changes `u` and `d` by the same amount

### Corner controls

- `nw`
  - changes `l` and `u`
- `ne`
  - changes `r` and `u`
- `sw`
  - changes `l` and `d`
- `se`
  - changes `r` and `d`

Corner controls are not independent variables. They are just combined single-axis controls.

## 4. DOF Interpretation

For control logic, the effective single-axis DOF are:

- horizontal control basis: `l / x / r`, choose 2
- vertical control basis: `u / y / d`, choose 2

The constraint basis is:

- horizontal constraints: `left / width / centerX / right`, choose 2
- vertical constraints: `top / height / centerY / bottom`, choose 2

`ratio` may substitute for `width` or `height`, but only when the other axis still has size freedom available.

## 5. Direct Lock Effects

When a constraint is locked, the directly corresponding control freedom is unavailable.

### Horizontal

- locked `left`
  - disables direct left-side movement
  - affects: `l`, `nw`, `sw`

- locked `right`
  - disables direct right-side movement
  - affects: `r`, `ne`, `se`

- locked `centerX`
  - disables pure horizontal translation
  - affects `c` horizontally

- locked `width`
  - disables pure horizontal size change
  - affects all horizontal stretch-style controls:
    - `l`
    - `r`
    - `nw`
    - `ne`
    - `sw`
    - `se`

### Vertical

- locked `top`
  - affects: `u`, `nw`, `ne`

- locked `bottom`
  - affects: `d`, `sw`, `se`

- locked `centerY`
  - disables pure vertical translation
  - affects `c` vertically

- locked `height`
  - disables pure vertical size change
  - affects:
    - `u`
    - `d`
    - `nw`
    - `ne`
    - `sw`
    - `se`

## 6. Full Axis Fixing

Each axis has only two independent degrees of freedom.

Therefore, if two independent locked equations exist on the same axis, that axis is fully fixed.

### Horizontal fully fixed examples

Any two of the following active and locked constraints fully determine horizontal geometry:

- `left`
- `right`
- `centerX`
- `width`

Examples:

- `left` + `right`
- `left` + `centerX`
- `right` + `centerX`
- `left` + `width`
- `right` + `width`
- `centerX` + `width`

If horizontal is fully fixed:

- `l`, `r`, horizontal part of `c`
- `nw`, `ne`, `sw`, `se`

all lose horizontal freedom.

### Vertical fully fixed examples

Similarly:

- `top` + `bottom`
- `top` + `centerY`
- `bottom` + `centerY`
- `top` + `height`
- `bottom` + `height`
- `centerY` + `height`

If vertical is fully fixed:

- `u`, `d`, vertical part of `c`
- `nw`, `ne`, `sw`, `se`

all lose vertical freedom.

## 7. Ratio Semantics

`ratio` is different from ordinary single-axis constraints.

It fixes:

- `h / w`

This means:

- changing `w` requires a corresponding legal change to `h`
- changing `h` requires a corresponding legal change to `w`

So `ratio` only acts like a substitute for width or height if the other axis still has size freedom.

### Important rule

- `ratio` does **not** directly lock translation
- `ratio` does **not** directly lock a single side
- `ratio` only constrains width-height coupling

### When ratio effectively locks size

If `ratio` is locked and the other axis size is already fixed, then this axis size also becomes fixed.

Examples:

- locked `ratio` + locked `height`
  - `h` fixed
  - therefore `w` also fixed

- locked `ratio` + locked `width`
  - `w` fixed
  - therefore `h` also fixed

More generally:

- if `ratio` is locked and vertical size is fully fixed, horizontal size becomes fixed too
- if `ratio` is locked and horizontal size is fully fixed, vertical size becomes fixed too

This is the core reason why `ratio` cannot always substitute for `width` or `height`.

## 8. Control Availability Model

Implementation should ideally derive these booleans:

### Horizontal abilities

- `canMoveX`
- `canResizeLeft`
- `canResizeRight`

### Vertical abilities

- `canMoveY`
- `canResizeTop`
- `canResizeBottom`

Then control availability becomes:

- `c`
  - allowed if `canMoveX` or `canMoveY`
- `l`
  - allowed if `canResizeLeft`
- `r`
  - allowed if `canResizeRight`
- `u`
  - allowed if `canResizeTop`
- `d`
  - allowed if `canResizeBottom`
- `nw`
  - allowed if `canResizeLeft` and `canResizeTop`
- `ne`
  - allowed if `canResizeRight` and `canResizeTop`
- `sw`
  - allowed if `canResizeLeft` and `canResizeBottom`
- `se`
  - allowed if `canResizeRight` and `canResizeBottom`

## 9. First-pass Practical Rules

Before building a full symbolic solver, a practical implementation can use these rules:

1. If an axis has two active locked constraints among its ordinary axis constraints, treat that axis as fully fixed.
2. A locked side constraint directly disables that side's stretch controls.
3. A locked center constraint disables move on that axis.
4. A locked size constraint disables stretch on that axis.
5. A locked ratio additionally disables size on the opposite axis if the coupled axis size is already fixed.

This is not the final perfect solver, but it is a clean intermediate model and matches the current editor structure.

## 10. Remaining Work

Still to be formalized:

1. exact `ratio` substitution cases for each constraint pair
2. whether some corner controls should remain usable when only one axis is free
3. whether center move should partially remain if only one axis is available
4. whether hidden controls and disabled controls should share the same UI behavior

## 11. Suggested Next Step

Build a horizontal-only rule table first.

For each active pair:

- `left + width`
- `right + width`
- `left + right`
- `left + centerX`
- `right + centerX`
- `centerX + width`
- `left + ratio`
- `right + ratio`
- `centerX + ratio`

Record:

- which locks fully freeze X
- when `l` remains usable
- when `r` remains usable
- when `c` remains usable

Then mirror the same table for Y.
