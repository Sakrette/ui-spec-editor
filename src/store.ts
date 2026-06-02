import { getAvailableKinds } from "./dof";
import type { AxisKind, ComponentNode, ConstraintSpec, ConstraintKind, ProjectSpec, ShapeKind, SourceAnchor, UnitKind } from "./types";

export class EditorStore {
  private nextId = 1;
  private constraintDrafts = new Map<string, Omit<ConstraintSpec, "id">>();
  private referencePreferences = new Map<string, string>();

  public spec: ProjectSpec = {
    version: "0.1",
    viewport: { width: 960, height: 540 },
    components: {
      root: {
        id: "root",
        name: "Viewport",
        shape: "rect",
        box: { x: 0, y: 0, width: 960, height: 540 },
        parentId: null,
        children: ["panel", "button"],
      },
      panel: {
        id: "panel",
        name: "Panel",
        shape: "rect",
        box: { x: 80, y: 80, width: 320, height: 220 },
        parentId: "root",
        children: [],
      },
      button: {
        id: "button",
        name: "Button",
        shape: "ellipse",
        box: { x: 120, y: 340, width: 180, height: 56 },
        parentId: "root",
        children: [],
      },
    },
    constraints: [
      { id: "panel-x-left", componentId: "panel", axis: "x", kind: "left", sourceComponentId: null, sourceAnchor: "left", value: 80, unit: "px" },
      { id: "panel-x-width", componentId: "panel", axis: "x", kind: "width", sourceComponentId: null, sourceAnchor: "right", value: 320, unit: "px" },
      { id: "panel-y-top", componentId: "panel", axis: "y", kind: "top", sourceComponentId: null, sourceAnchor: "top", value: 80, unit: "px" },
      { id: "panel-y-height", componentId: "panel", axis: "y", kind: "height", sourceComponentId: null, sourceAnchor: "bottom", value: 220, unit: "px" },
      { id: "button-x-center", componentId: "button", axis: "x", kind: "centerX", sourceComponentId: "panel", sourceAnchor: "centerX", value: 0, unit: "px" },
      { id: "button-x-width", componentId: "button", axis: "x", kind: "width", sourceComponentId: null, sourceAnchor: "right", value: 180, unit: "px" },
      { id: "button-y-top", componentId: "button", axis: "y", kind: "top", sourceComponentId: "panel", sourceAnchor: "bottom", value: 40, unit: "px" },
      { id: "button-y-height", componentId: "button", axis: "y", kind: "height", sourceComponentId: null, sourceAnchor: "bottom", value: 56, unit: "px" },
    ],
  };

  public selectedId: string | null = null;

  public constructor() {
    this.seedConstraintDrafts();
    for (const constraint of this.spec.constraints) {
      this.rememberConstraintDraft(constraint);
    }
    this.solveLayout();
  }

  public get components(): ComponentNode[] {
    return Object.values(this.spec.components).filter((component) => component.id !== "root");
  }

  public select(id: string): void {
    this.selectedId = id;
  }

  public clearSelection(): void {
    this.selectedId = null;
  }

  public resizeViewport(width: number, height: number): void {
    this.spec.viewport.width = Math.max(100, Math.round(width));
    this.spec.viewport.height = Math.max(100, Math.round(height));
    this.spec.components.root.box.width = this.spec.viewport.width;
    this.spec.components.root.box.height = this.spec.viewport.height;
    this.solveLayout();
  }

  public addComponent(shape: ShapeKind): void {
    const id = `${shape}-${this.nextId++}`;
    const component: ComponentNode = {
      id,
      name: `${shape === "rect" ? "Rectangle" : "Ellipse"} ${this.nextId - 1}`,
      shape,
      box: {
        x: 60 + this.components.length * 24,
        y: 60 + this.components.length * 24,
        width: 180,
        height: 96,
      },
      parentId: "root",
      children: [],
    };

    this.spec.components[id] = component;
    this.spec.components.root.children.push(id);
    this.selectedId = id;
    this.addConstraint({
      componentId: id,
      axis: "x",
      kind: "left",
      sourceComponentId: null,
      sourceAnchor: "left",
      value: component.box.x,
      unit: "px",
    });
    this.addConstraint({
      componentId: id,
      axis: "x",
      kind: "width",
      sourceComponentId: null,
      sourceAnchor: "right",
      value: component.box.width,
      unit: "px",
    });
    this.addConstraint({
      componentId: id,
      axis: "y",
      kind: "top",
      sourceComponentId: null,
      sourceAnchor: "top",
      value: component.box.y,
      unit: "px",
    });
    this.addConstraint({
      componentId: id,
      axis: "y",
      kind: "height",
      sourceComponentId: null,
      sourceAnchor: "bottom",
      value: component.box.height,
      unit: "px",
    });
    this.seedConstraintDrafts();
    this.solveLayout();
  }

  public deleteSelectedComponent(): void {
    if (!this.selectedId) return;
    const component = this.spec.components[this.selectedId];
    if (!component || component.id === "root") return;

    delete this.spec.components[component.id];
    this.spec.components.root.children = this.spec.components.root.children.filter((childId) => childId !== component.id);
    this.spec.constraints = this.spec.constraints.filter(
      (constraint) =>
        constraint.componentId !== component.id &&
        constraint.sourceComponentId !== component.id,
    );

    for (const axis of ["x", "y"] as const) {
      for (const kind of getAvailableKinds(axis)) {
        this.constraintDrafts.delete(getConstraintKey(component.id, axis, kind));
      }
    }
    this.referencePreferences.delete(component.id);

    this.selectedId = null;
    this.solveLayout();
  }

  public deleteComponent(componentId: string): void {
    this.select(componentId);
    this.deleteSelectedComponent();
  }

  public updateSelectedShape(shape: ShapeKind): void {
    if (!this.selectedId) return;
    const component = this.spec.components[this.selectedId];
    if (!component || component.id === "root") return;
    component.shape = shape;
    this.solveLayout();
  }

  public updateSelectedBox(property: "x" | "y" | "width" | "height", value: number): void {
    if (!this.selectedId) return;
    const component = this.spec.components[this.selectedId];
    if (!component || component.id === "root") return;
    this.setComponentBox(component.id, {
      x: property === "x" ? value : component.box.x,
      y: property === "y" ? value : component.box.y,
      width: property === "width" ? value : component.box.width,
      height: property === "height" ? value : component.box.height,
    });
  }

  public updateSelectedName(name: string): void {
    if (!this.selectedId) return;
    const component = this.spec.components[this.selectedId];
    if (!component || component.id === "root") return;
    component.name = name || component.name;
  }

  public addConstraint(input: {
    componentId: string;
    axis: "x" | "y";
    kind: ConstraintKind;
    sourceComponentId: string | null;
    sourceAnchor: SourceAnchor;
    value: number;
    unit: UnitKind;
    locked?: boolean;
    ratioParts?: { w: number; h: number };
  }): void {
    const constraint: ConstraintSpec = {
      id: `constraint-${this.nextId++}`,
      ...input,
      value: normalizeConstraintInputValue(input.kind, input.value, input.unit),
      locked: input.locked ?? false,
    };
    this.spec.constraints.push(constraint);
    this.rememberConstraintDraft(constraint);
    this.solveLayout();
  }

  public upsertConstraint(input: {
    componentId: string;
    axis: "x" | "y";
    kind: ConstraintKind;
    sourceComponentId: string | null;
    sourceAnchor: SourceAnchor;
    value: number;
    unit: UnitKind;
    locked?: boolean;
    ratioParts?: { w: number; h: number };
  }): void {
    if (wouldExceedDimensionalPair(this.spec.constraints, input.componentId, input.kind)) {
      return;
    }

    const existing = this.spec.constraints.find(
      (constraint) =>
        constraint.componentId === input.componentId &&
        constraint.axis === input.axis &&
        constraint.kind === input.kind,
    );

    if (existing) {
      existing.sourceComponentId = input.sourceComponentId;
      existing.sourceAnchor = input.sourceAnchor;
      existing.value = normalizeConstraintInputValue(input.kind, input.value, input.unit);
      existing.unit = input.unit;
      existing.locked = input.locked ?? existing.locked ?? false;
      existing.ratioParts = input.ratioParts;
      this.rememberConstraintDraft(existing);
      this.solveLayout();
      return;
    }

    this.addConstraint(input);
  }

  public removeConstraintByKind(componentId: string, axis: "x" | "y", kind: ConstraintKind): void {
    const removed = this.spec.constraints.find(
      (constraint) =>
        constraint.componentId === componentId && constraint.axis === axis && constraint.kind === kind,
    );
    if (removed) {
      this.rememberConstraintDraft(removed);
    }
    this.spec.constraints = this.spec.constraints.filter(
      (constraint) =>
        !(constraint.componentId === componentId && constraint.axis === axis && constraint.kind === kind),
    );
    this.solveLayout();
  }

  public removeConstraint(id: string): void {
    const removed = this.spec.constraints.find((constraint) => constraint.id === id);
    if (removed) {
      this.rememberConstraintDraft(removed);
    }
    this.spec.constraints = this.spec.constraints.filter((constraint) => constraint.id !== id);
    this.solveLayout();
  }

  public getConstraintDraft(componentId: string, axis: "x" | "y", kind: ConstraintKind): Omit<ConstraintSpec, "id"> | null {
    return this.constraintDrafts.get(getConstraintKey(componentId, axis, kind)) ?? null;
  }

  public getReferencePreference(componentId: string): string | null {
    return this.referencePreferences.get(componentId) ?? null;
  }

  public setReferencePreference(componentId: string, preference: string): void {
    this.referencePreferences.set(componentId, preference);
  }

  public updateConstraintDraftReference(
    componentId: string,
    axis: AxisKind,
    kind: ConstraintKind,
    sourceComponentId: string | null,
    sourceAnchor: SourceAnchor,
  ): void {
    const key = getConstraintKey(componentId, axis, kind);
    const existing = this.constraintDrafts.get(key) ?? this.createDefaultDraft(componentId, axis, kind);
    this.constraintDrafts.set(key, {
      ...existing,
      componentId,
      axis,
      kind,
      sourceComponentId,
      sourceAnchor,
    });
  }

  public updateConstraintLock(componentId: string, axis: AxisKind, kind: ConstraintKind, locked: boolean): void {
    const active = this.spec.constraints.find(
      (constraint) =>
        constraint.componentId === componentId &&
        constraint.axis === axis &&
        constraint.kind === kind,
    );
    if (active) {
      active.locked = locked;
      this.rememberConstraintDraft(active);
      this.solveLayout();
      return;
    }

    const draft = this.getConstraintDraft(componentId, axis, kind);
    if (!draft) return;
    this.constraintDrafts.set(getConstraintKey(componentId, axis, kind), { ...draft, locked });
  }

  public activateConstraint(componentId: string, axis: AxisKind, kind: ConstraintKind): void {
    const component = this.spec.components[componentId];
    if (!component || component.id === "root") return;
    if (wouldExceedDimensionalPair(this.spec.constraints, componentId, kind)) return;
    const draft = this.getConstraintDraft(componentId, axis, kind) ?? this.createDefaultDraft(componentId, axis, kind);
    const measured = this.measureDraftConstraint({
      componentId: draft.componentId,
      axis: draft.axis,
      kind: draft.kind,
      sourceComponentId: draft.sourceComponentId,
      sourceAnchor: draft.sourceAnchor,
      unit: draft.unit,
    });
    const shouldSeedRatioFromGeometry =
      kind === "ratio" &&
      draft.ratioParts !== undefined &&
      draft.ratioParts.w === 1 &&
      draft.ratioParts.h === 1 &&
      draft.value === 0;
    const ratioParts = shouldSeedRatioFromGeometry
      ? {
          w: Math.max(1, Math.round(Math.abs(component.box.width))),
          h: Math.max(1, Math.round(Math.abs(component.box.height))),
        }
      : draft.ratioParts;

    this.upsertConstraint({
      ...draft,
      value: measured !== null && Number.isFinite(measured) ? roundConstraintValue(measured, draft.unit) : draft.value,
      locked: draft.locked,
      ratioParts,
    });
  }

  public measureDraftConstraint(input: {
    componentId: string;
    axis: "x" | "y";
    kind: ConstraintKind;
    sourceComponentId: string | null;
    sourceAnchor: SourceAnchor;
    unit: UnitKind;
  }): number | null {
    const component = this.spec.components[input.componentId];
    if (!component || component.id === "root") return null;

    return this.measureConstraintValue(component, {
      id: "draft",
      componentId: input.componentId,
      axis: input.axis,
      kind: input.kind,
      sourceComponentId: input.sourceComponentId,
      sourceAnchor: input.sourceAnchor,
      value: 0,
      unit: input.unit,
      locked: false,
      ratioParts: undefined,
    });
  }

  public moveSelected(dx: number, dy: number): void {
    if (!this.selectedId) return;
    const component = this.spec.components[this.selectedId];
    if (!component || component.id === "root") return;
    this.setComponentBox(component.id, {
      x: component.box.x + dx,
      y: component.box.y + dy,
      width: component.box.width,
      height: component.box.height,
    });
  }

  public setComponentBox(componentId: string, nextBox: { x: number; y: number; width: number; height: number }): void {
    const component = this.spec.components[componentId];
    if (!component || component.id === "root") return;
    const width = clamp(Math.round(nextBox.width), 1, this.spec.viewport.width);
    const height = clamp(Math.round(nextBox.height), 1, this.spec.viewport.height);
    component.box.width = width;
    component.box.height = height;
    component.box.x = clamp(Math.round(nextBox.x), 0, this.spec.viewport.width - width);
    component.box.y = clamp(Math.round(nextBox.y), 0, this.spec.viewport.height - height);
    this.syncConstraintsFromBox(component.id);
    this.solveLayout();
  }

  public adjustConstraintValue(constraintId: string, deltaPixels: number, baseValue?: number): void {
    const constraint = this.spec.constraints.find((item) => item.id === constraintId);
    if (!constraint || constraint.locked || constraint.kind === "ratio") return;

    const basis = this.getConstraintBasis(constraint);
    const deltaValue = constraint.unit === "percent" ? (basis === 0 ? 0 : (deltaPixels / basis) * 100) : deltaPixels;
    constraint.value = normalizeConstraintInputValue(
      constraint.kind,
      roundConstraintValue((baseValue ?? constraint.value) + deltaValue, constraint.unit),
      constraint.unit,
    );
    this.rememberConstraintDraft(constraint);
    this.solveLayout();
  }

  public solveLayout(): void {
    const components = this.components;

    for (let pass = 0; pass < 3; pass += 1) {
      for (const component of components) {
        this.solveAxis(component, "x");
        this.solveAxis(component, "y");
      }
    }
  }

  private solveAxis(component: ComponentNode, axis: "x" | "y"): void {
    const constraints = this.spec.constraints.filter((constraint) => constraint.componentId === component.id && constraint.axis === axis);
    const unique = new Map<ConstraintKind, ConstraintSpec>();
    for (const constraint of constraints) {
      unique.set(constraint.kind, constraint);
    }

    if (unique.size !== 2) return;

    const values = new Map<ConstraintKind, number>();
    for (const [kind, constraint] of unique.entries()) {
      const resolved = this.resolveConstraintValue(component, axis, kind, constraint);
      if (resolved === null || Number.isNaN(resolved)) {
        return;
      }
      values.set(kind, resolved);
    }

    if (axis === "x") {
      const resolvedWidth = values.get("width") ?? values.get("ratio");
      if (resolvedWidth !== undefined && Number.isFinite(resolvedWidth)) {
        component.box.width = Math.max(1, Math.round(resolvedWidth));
      }
      const solved = solveHorizontal(values);
      if (!solved) return;
      component.box.x = Math.round(solved.x ?? component.box.x);
      component.box.width = Math.max(1, Math.round(solved.width ?? component.box.width));
      return;
    }

    const resolvedHeight = values.get("height") ?? values.get("ratio");
    if (resolvedHeight !== undefined && Number.isFinite(resolvedHeight)) {
      component.box.height = Math.max(1, Math.round(resolvedHeight));
    }
    const solved = solveVertical(values);
    if (!solved) return;
    component.box.y = Math.round(solved.y ?? component.box.y);
    component.box.height = Math.max(1, Math.round(solved.height ?? component.box.height));
  }

  private resolveConstraintValue(
    component: ComponentNode,
    axis: "x" | "y",
    kind: ConstraintKind,
    constraint: ConstraintSpec,
  ): number | null {
    if (kind === "ratio") {
      const ratio = constraint.value;
      if (axis === "x") {
        return component.box.height * ratio;
      }
      if (ratio === 0) return 0;
      return component.box.width / ratio;
    }

    if (kind === "width") {
      return this.resolveSizeValue(constraint, "x");
    }
    if (kind === "height") {
      return this.resolveSizeValue(constraint, "y");
    }

    const base = this.resolveAnchorValue(constraint.sourceComponentId, constraint.sourceAnchor);
    if (base === null) return null;
    return base + this.resolveOffset(constraint, axis);
  }

  private resolveSizeValue(constraint: ConstraintSpec, axis: "x" | "y"): number | null {
    const viewportSize = axis === "x" ? this.spec.viewport.width : this.spec.viewport.height;

    if (constraint.sourceComponentId === null) {
      if (constraint.unit === "percent") {
        return viewportSize * (constraint.value / 100);
      }
      return constraint.value;
    }

    const source = this.spec.components[constraint.sourceComponentId];
    if (!source) return null;
    const sourceSize = axis === "x" ? source.box.width : source.box.height;
    if (constraint.unit === "percent") {
      return sourceSize * (constraint.value / 100);
    }
    return sourceSize + constraint.value;
  }

  private resolveAnchorValue(sourceComponentId: string | null, anchor: SourceAnchor): number | null {
    const source = sourceComponentId ? this.spec.components[sourceComponentId] : this.spec.components.root;
    if (!source) return null;

    if (source.id === "root") {
      if (anchor === "left" || anchor === "top") return 0;
      if (anchor === "right") return this.spec.viewport.width;
      if (anchor === "bottom") return this.spec.viewport.height;
      if (anchor === "centerX") return this.spec.viewport.width / 2;
      if (anchor === "centerY") return this.spec.viewport.height / 2;
      return null;
    }

    if (anchor === "left") return source.box.x;
    if (anchor === "right") return source.box.x + source.box.width;
    if (anchor === "centerX") return source.box.x + source.box.width / 2;
    if (anchor === "top") return source.box.y;
    if (anchor === "bottom") return source.box.y + source.box.height;
    if (anchor === "centerY") return source.box.y + source.box.height / 2;
    return null;
  }

  private resolveOffset(constraint: ConstraintSpec, axis: "x" | "y"): number {
    const basis = this.getConstraintBasis(constraint, axis);

    if (constraint.unit === "percent") {
      return basis * (constraint.value / 100);
    }

    return constraint.value;
  }

  private syncConstraintsFromBox(componentId: string): void {
    const component = this.spec.components[componentId];
    if (!component || component.id === "root") return;

    const constraints = this.spec.constraints.filter((constraint) => constraint.componentId === componentId);
    for (const constraint of constraints) {
      if (constraint.locked) continue;
      const nextValue = this.measureConstraintValue(component, constraint);
      if (nextValue !== null && Number.isFinite(nextValue)) {
        constraint.value = roundConstraintValue(nextValue, constraint.unit);
        if (constraint.kind === "ratio") {
          constraint.ratioParts = {
            w: Math.max(0, Math.round(component.box.width)),
            h: Math.max(0, Math.round(component.box.height)),
          };
        }
        this.rememberConstraintDraft(constraint);
      }
    }
  }

  private rememberConstraintDraft(constraint: Omit<ConstraintSpec, "id"> | ConstraintSpec): void {
    this.constraintDrafts.set(getConstraintKey(constraint.componentId, constraint.axis, constraint.kind), {
      componentId: constraint.componentId,
      axis: constraint.axis,
      kind: constraint.kind,
      sourceComponentId: constraint.sourceComponentId,
      sourceAnchor: constraint.sourceAnchor,
      value: constraint.value,
      unit: constraint.unit,
      locked: constraint.locked ?? false,
      ratioParts: constraint.ratioParts ? { ...constraint.ratioParts } : undefined,
    });
  }

  private seedConstraintDrafts(): void {
    for (const component of this.components) {
      for (const axis of ["x", "y"] as const) {
        for (const kind of getAvailableKinds(axis)) {
          const key = getConstraintKey(component.id, axis, kind);
          if (!this.constraintDrafts.has(key)) {
            this.constraintDrafts.set(key, this.createDefaultDraft(component.id, axis, kind));
          }
        }
      }
    }
  }

  private createDefaultDraft(componentId: string, axis: AxisKind, kind: ConstraintKind): Omit<ConstraintSpec, "id"> {
    return {
      componentId,
      axis,
      kind,
      sourceComponentId: kind === "ratio" ? componentId : null,
      sourceAnchor: getDefaultSourceAnchor(axis, kind),
      value: 0,
      unit: kind === "ratio" ? "ratio" : "px",
      locked: false,
      ratioParts: kind === "ratio" ? { w: 1, h: 1 } : undefined,
    };
  }

  private measureConstraintValue(component: ComponentNode, constraint: ConstraintSpec): number | null {
    if (constraint.kind === "ratio") {
      if (component.box.height === 0) return 0;
      return component.box.width / component.box.height;
    }

    if (constraint.kind === "width") {
      return this.measureSizeValue(component.box.width, constraint, "x");
    }

    if (constraint.kind === "height") {
      return this.measureSizeValue(component.box.height, constraint, "y");
    }

    const targetAnchor = this.measureTargetAnchor(component, constraint.kind);
    const sourceAnchor = this.resolveAnchorValue(constraint.sourceComponentId, constraint.sourceAnchor);
    if (targetAnchor === null || sourceAnchor === null) return null;
    const delta = targetAnchor - sourceAnchor;

    if (constraint.unit === "percent") {
      const basis = this.getAxisBasis(constraint);
      if (basis === 0) return 0;
      return (delta / basis) * 100;
    }

    return delta;
  }

  private measureSizeValue(size: number, constraint: ConstraintSpec, axis: "x" | "y"): number | null {
    if (constraint.sourceComponentId === null) {
      const viewportSize = axis === "x" ? this.spec.viewport.width : this.spec.viewport.height;
      if (constraint.unit === "percent") {
        if (viewportSize === 0) return 0;
        return (size / viewportSize) * 100;
      }
      return size;
    }

    const source = this.spec.components[constraint.sourceComponentId];
    if (!source) return null;
    const sourceSize = axis === "x" ? source.box.width : source.box.height;
    if (constraint.unit === "percent") {
      if (sourceSize === 0) return 0;
      return (size / sourceSize) * 100;
    }
    return size - sourceSize;
  }

  private measureTargetAnchor(component: ComponentNode, kind: ConstraintKind): number | null {
    if (kind === "left") return component.box.x;
    if (kind === "right") return component.box.x + component.box.width;
    if (kind === "centerX") return component.box.x + component.box.width / 2;
    if (kind === "top") return component.box.y;
    if (kind === "bottom") return component.box.y + component.box.height;
    if (kind === "centerY") return component.box.y + component.box.height / 2;
    return null;
  }

  private getAxisBasis(constraint: ConstraintSpec): number {
    return this.getConstraintBasis(constraint);
  }

  private getConstraintBasis(constraint: ConstraintSpec, forcedAxis?: "x" | "y"): number {
    const axis = forcedAxis ?? constraint.axis;
    if (constraint.sourceComponentId) {
      const source = this.spec.components[constraint.sourceComponentId];
      if (source) {
        return axis === "x" ? source.box.width : source.box.height;
      }
    }
    return axis === "x" ? this.spec.viewport.width : this.spec.viewport.height;
  }

  public exportJson(): string {
    return JSON.stringify(
      {
        ...this.spec,
        constraints: this.spec.constraints.map((constraint) =>
          constraint.kind === "ratio"
            ? {
                ...constraint,
                value: formatRatioForExport(constraint.value),
                ratioParts: undefined,
              }
            : constraint,
        ),
      },
      null,
      2,
    );
  }

  public importJson(json: string): void {
    const parsed = JSON.parse(json) as ProjectSpec;
    this.spec = normalizeImportedSpec(parsed);
    this.selectedId = null;
    this.constraintDrafts.clear();
    this.referencePreferences.clear();
    this.seedConstraintDrafts();
    for (const constraint of this.spec.constraints) {
      this.rememberConstraintDraft(constraint);
    }
    this.nextId = computeNextId(this.spec);
    this.solveLayout();
  }
}

function wouldExceedDimensionalPair(
  constraints: ConstraintSpec[],
  componentId: string,
  kind: ConstraintKind,
): boolean {
  if (!isDimensionalKind(kind)) return false;

  const activeKinds = new Set(
    constraints
      .filter((constraint) => constraint.componentId === componentId && isDimensionalKind(constraint.kind))
      .map((constraint) => constraint.kind),
  );

  if (activeKinds.has(kind)) return false;
  return activeKinds.size >= 2;
}

function isDimensionalKind(kind: ConstraintKind): kind is "width" | "height" | "ratio" {
  return kind === "width" || kind === "height" || kind === "ratio";
}

function solveHorizontal(values: Map<ConstraintKind, number>): { x?: number; width?: number } | null {
  const left = values.get("left");
  const right = values.get("right");
  const width = values.get("width") ?? values.get("ratio");
  const center = values.get("centerX");

  if (left !== undefined && width !== undefined) return { x: left, width };
  if (right !== undefined && width !== undefined) return { x: right - width, width };
  if (center !== undefined && width !== undefined) return { x: center - width / 2, width };
  if (left !== undefined && right !== undefined) return { x: left, width: right - left };
  if (left !== undefined && center !== undefined) return { x: left, width: (center - left) * 2 };
  if (right !== undefined && center !== undefined) return { x: 2 * center - right, width: 2 * (right - center) };
  return null;
}

function solveVertical(values: Map<ConstraintKind, number>): { y?: number; height?: number } | null {
  const top = values.get("top");
  const bottom = values.get("bottom");
  const height = values.get("height") ?? values.get("ratio");
  const center = values.get("centerY");

  if (top !== undefined && height !== undefined) return { y: top, height };
  if (bottom !== undefined && height !== undefined) return { y: bottom - height, height };
  if (center !== undefined && height !== undefined) return { y: center - height / 2, height };
  if (top !== undefined && bottom !== undefined) return { y: top, height: bottom - top };
  if (top !== undefined && center !== undefined) return { y: top, height: (center - top) * 2 };
  if (bottom !== undefined && center !== undefined) return { y: 2 * center - bottom, height: 2 * (bottom - center) };
  return null;
}

function roundConstraintValue(value: number, unit: UnitKind): number {
  if (unit === "percent") {
    return Math.round(value * 100) / 100;
  }
  if (unit === "ratio") {
    return Math.round(value * 1000) / 1000;
  }
  return Math.round(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeConstraintInputValue(kind: ConstraintKind, value: number, unit: UnitKind): number {
  const rounded = roundConstraintValue(value, unit);
  if (kind === "width" || kind === "height") {
    return Math.max(1, rounded);
  }
  return rounded;
}

function getConstraintKey(componentId: string, axis: "x" | "y", kind: ConstraintKind): string {
  return `${componentId}:${axis}:${kind}`;
}

function getDefaultSourceAnchor(axis: AxisKind, kind: ConstraintKind): SourceAnchor {
  if (kind === "ratio") return "ratio";
  if (kind === "left") return "left";
  if (kind === "right") return "right";
  if (kind === "centerX") return "centerX";
  if (kind === "top") return "top";
  if (kind === "bottom") return "bottom";
  if (kind === "centerY") return "centerY";
  if (kind === "width") return "right";
  if (kind === "height") return "bottom";
  return axis === "x" ? "left" : "top";
}

function normalizeImportedSpec(spec: ProjectSpec): ProjectSpec {
  const root = spec.components.root ?? {
    id: "root",
    name: "Viewport",
    shape: "rect",
    box: { x: 0, y: 0, width: spec.viewport.width, height: spec.viewport.height },
    parentId: null,
    children: [],
  };

  root.box.width = spec.viewport.width;
  root.box.height = spec.viewport.height;
  root.parentId = null;
  root.children = Object.values(spec.components)
    .filter((component) => component.id !== "root")
    .map((component) => component.id);

  return {
    version: "0.1",
    viewport: {
      width: Math.max(100, Math.round(spec.viewport.width)),
      height: Math.max(100, Math.round(spec.viewport.height)),
    },
    components: {
      ...spec.components,
      root,
    },
    constraints: spec.constraints.map((constraint) => ({
      ...constraint,
      unit: constraint.kind === "ratio" ? "ratio" : constraint.unit,
      locked: Boolean(constraint.locked),
      ratioParts:
        constraint.kind === "ratio"
          ? constraint.ratioParts ??
            formatRatioPartsFromValue(
              typeof constraint.value === "string" ? parseExportedRatio(constraint.value) : Number(constraint.value),
            )
          : undefined,
      value:
        constraint.kind === "ratio"
          ? typeof constraint.value === "string"
            ? parseExportedRatio(constraint.value)
            : Number(constraint.value)
          : Number(constraint.value),
    })),
  };
}

function parseExportedRatio(input: string): number {
  const match = input.trim().match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (!match) return 1;
  const left = Number(match[1]);
  const right = Number(match[2]);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return 1;
  if (right === 0) return 1000;
  if (left === 0) return 0.001;
  return left / right;
}

function formatRatioPartsFromValue(ratio: number): { w: number; h: number } {
  const absolute = Math.abs(ratio || 1);
  if (absolute >= 1000) return { w: 1, h: 0 };
  if (absolute <= 0.001) return { w: 0, h: 1 };
  const scaledW = Math.max(1, Math.round(absolute * 1000));
  const scaledH = 1000;
  const divisor = gcd(scaledW, scaledH);
  return { w: scaledW / divisor, h: scaledH / divisor };
}

function computeNextId(spec: ProjectSpec): number {
  const ids = [
    ...Object.keys(spec.components),
    ...spec.constraints.map((constraint) => constraint.id),
  ];
  const max = ids.reduce((highest, id) => {
    const match = id.match(/(\d+)$/);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return max + 1;
}

function formatRatioForExport(ratio: number): string {
  const absolute = Math.abs(ratio || 1);
  if (absolute >= 1000) return "1/0";
  if (absolute <= 0.001) return "0/1";

  const scaledW = Math.max(1, Math.round(absolute * 1000));
  const scaledH = 1000;
  const divisor = gcd(scaledW, scaledH);
  return `${scaledW / divisor}/${scaledH / divisor}`;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}
