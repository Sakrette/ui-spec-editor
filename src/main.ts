import "./style.css";
import { analyzeProjectDof, getAvailableKinds, getShapeLabel } from "./dof";
import { EditorStore } from "./store";
import type { AxisKind, Box, ComponentNode, ConstraintKind, ConstraintSpec, SourceAnchor, UnitKind } from "./types";

const store = new EditorStore();
const app = document.querySelector<HTMLDivElement>("#app");

if (!app) throw new Error("#app was not found");

app.innerHTML = `
  <main class="editor-shell">
    <aside class="sidebar">
      <h1>UI Spec Editor</h1>
      <div class="title-actions">
        <button id="open-import-modal" type="button">Import</button>
        <button id="open-export-modal" type="button">Export</button>
      </div>
      <section class="panel">
        <h2>Viewport</h2>
        <div class="field-grid">
          <label class="field">
            <span>Width</span>
            <input id="viewport-width" type="number" min="100" step="1" />
          </label>
          <label class="field">
            <span>Height</span>
            <input id="viewport-height" type="number" min="100" step="1" />
          </label>
        </div>
      </section>
      <section class="panel">
        <h2>Components</h2>
        <div id="component-list"></div>
        <button id="add-component-button" type="button">Add Component</button>
      </section>
    </aside>
    <section class="workspace">
      <div class="workspace-header">
        <div>
          <strong>Canvas</strong>
          <span id="canvas-size"></span>
        </div>
      </div>
      <svg id="canvas" viewBox="0 0 960 540" aria-label="Editor canvas"></svg>
    </section>
    <aside class="inspector-column">
      <section class="panel selected-panel">
        <h2>Selected Component</h2>
        <div id="selected-pane"></div>
      </section>
    </aside>
  </main>
  <div id="export-modal" class="modal-shell" hidden>
    <div class="modal-backdrop" data-close-export-modal="true"></div>
    <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="export-title">
      <div class="modal-head">
        <h2 id="export-title">Export</h2>
        <button id="close-export-modal" class="icon-button" type="button" aria-label="Close export dialog">×</button>
      </div>
      <div class="export-mode">
        <label class="mode-option">
          <input id="export-format-json" type="radio" name="export-format" value="json" checked />
          <span>JSON</span>
        </label>
        <label class="mode-option">
          <input id="export-format-png" type="radio" name="export-format" value="png" />
          <span>PNG</span>
        </label>
      </div>
      <div id="export-json-panel" class="export-panel-body">
        <textarea id="export-output" spellcheck="false"></textarea>
        <div class="field-grid">
          <button id="copy-export-button" type="button">Copy JSON</button>
          <button id="download-json-button" type="button">Download JSON</button>
        </div>
      </div>
      <div id="export-png-panel" class="export-panel-body" hidden>
        <p class="hint">Export the current canvas as a PNG snapshot.</p>
        <button id="download-png-button" type="button">Download PNG</button>
      </div>
    </section>
  </div>
  <div id="import-modal" class="modal-shell" hidden>
    <div class="modal-backdrop" data-close-import-modal="true"></div>
    <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <div class="modal-head">
        <h2 id="import-title">Import</h2>
        <button id="close-import-modal" class="icon-button" type="button" aria-label="Close import dialog">×</button>
      </div>
      <div class="import-panel-body">
        <label class="field">
          <span>JSON File</span>
          <input id="import-file-input" type="file" accept=".json,application/json" />
        </label>
        <label class="field">
          <span>Raw JSON</span>
          <textarea id="import-input" spellcheck="false" placeholder="Paste exported JSON here"></textarea>
        </label>
        <p id="import-error" class="hint import-error" hidden></p>
        <div class="field-grid">
          <button id="apply-import-button" type="button">Apply Import</button>
          <button id="clear-import-button" type="button">Clear</button>
        </div>
      </div>
    </section>
  </div>
`;

const canvas = query<SVGSVGElement>("#canvas");
const sidebar = query<HTMLElement>(".sidebar");
const componentList = query<HTMLDivElement>("#component-list");
const selectedPane = query<HTMLDivElement>("#selected-pane");
selectedPane.setAttribute("data-preserve-selection", "true");
const exportOutput = query<HTMLTextAreaElement>("#export-output");
const importInput = query<HTMLTextAreaElement>("#import-input");
const importFileInput = query<HTMLInputElement>("#import-file-input");
const importError = query<HTMLParagraphElement>("#import-error");
const openImportModalButton = query<HTMLButtonElement>("#open-import-modal");
const openExportModalButton = query<HTMLButtonElement>("#open-export-modal");
const closeImportModalButton = query<HTMLButtonElement>("#close-import-modal");
const closeExportModalButton = query<HTMLButtonElement>("#close-export-modal");
const viewportWidthInput = query<HTMLInputElement>("#viewport-width");
const viewportHeightInput = query<HTMLInputElement>("#viewport-height");
const canvasSize = query<HTMLSpanElement>("#canvas-size");
const addComponentButton = query<HTMLButtonElement>("#add-component-button");
const exportModal = query<HTMLDivElement>("#export-modal");
const importModal = query<HTMLDivElement>("#import-modal");
const exportJsonPanel = query<HTMLDivElement>("#export-json-panel");
const exportPngPanel = query<HTMLDivElement>("#export-png-panel");
const exportFormatJson = query<HTMLInputElement>("#export-format-json");
const exportFormatPng = query<HTMLInputElement>("#export-format-png");
const applyImportButton = query<HTMLButtonElement>("#apply-import-button");
const clearImportButton = query<HTMLButtonElement>("#clear-import-button");
const copyExportButton = query<HTMLButtonElement>("#copy-export-button");
const downloadJsonButton = query<HTMLButtonElement>("#download-json-button");
const downloadPngButton = query<HTMLButtonElement>("#download-png-button");

type ControlHandle = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type DragState =
  | { mode: "move"; id: string; pointerId: number; startClientX: number; startClientY: number; startBox: Box }
  | { mode: "resize"; id: string; pointerId: number; startClientX: number; startClientY: number; startBox: Box; handle: Exclude<ControlHandle, "move"> }
  | { mode: "constraint"; constraintId: string; pointerId: number; startClientX: number; startClientY: number; axis: AxisKind; startValue: number; valueScale: number }
  | { mode: "retarget"; constraintId: string; pointerId: number; axis: AxisKind; candidate: RetargetCandidate | null };

type Vec2 = { x: number; y: number };
type LabelBox = { x: number; y: number; width: number; height: number };
type RetargetCandidate = {
  sourceComponentId: string | null;
  sourceAnchor: SourceAnchor;
  point: Vec2;
  distance: number;
};
type ControlAvailability = {
  canMoveX: boolean;
  canMoveY: boolean;
  canResizeLeft: boolean;
  canResizeRight: boolean;
  canResizeTop: boolean;
  canResizeBottom: boolean;
  canResizeNW: boolean;
  canResizeNE: boolean;
  canResizeSW: boolean;
  canResizeSE: boolean;
  widthFixed: boolean;
  heightFixed: boolean;
};

type LinearTerm = { a: number; b: number };
type OperationDelta = {
  dimensions: 1 | 2;
  dl: LinearTerm;
  dr: LinearTerm;
  dt: LinearTerm;
  db: LinearTerm;
};

const ANNOTATION_FONT_SIZE = 12;
const ANNOTATION_UNIT = ANNOTATION_FONT_SIZE;
const ANNOTATION_ARROW_SIDE = ANNOTATION_UNIT * 0.5;
const ANNOTATION_ARROW_LENGTH = (ANNOTATION_ARROW_SIDE * Math.sqrt(3)) / 2;
const ANNOTATION_LABEL_CENTER_OFFSET = ANNOTATION_UNIT * 0.75;
const ANNOTATION_LINE_GAP = 3 * 1.5;
const ANNOTATION_VIEWPORT_MARGIN = Math.ceil(ANNOTATION_LABEL_CENTER_OFFSET + ANNOTATION_FONT_SIZE);

let dragging: DragState | null = null;
let expandedMethodKey: string | null = null;
let hoveredControlKey: string | null = null;
let hoveredComponentId: string | null = null;
let hoveredPreviewHandle: ControlHandle | null = null;

function render(): void {
  renderViewportControls();
  renderCanvas();
  renderComponentList();
  renderSelectedPane();
  syncExportState();
}

function syncExportState(): void {
  exportOutput.value = store.exportJson();
  syncExportModal();
}

function renderViewportControls(): void {
  viewportWidthInput.value = String(store.spec.viewport.width);
  viewportHeightInput.value = String(store.spec.viewport.height);
  canvasSize.textContent = `${store.spec.viewport.width} x ${store.spec.viewport.height}`;
  canvas.setAttribute("viewBox", `0 0 ${store.spec.viewport.width} ${store.spec.viewport.height}`);
}

function renderCanvas(): void {
  const analysis = analyzeProjectDof(store.spec);
  const horizontalBands: Array<{ y: number; start: number; end: number }> = [];
  const verticalBands: Array<{ x: number; start: number; end: number }> = [];
  const labelBoxes: LabelBox[] = [];
  canvas.innerHTML = "";

  const background = createSvgElement("rect");
  background.setAttribute("x", "0");
  background.setAttribute("y", "0");
  background.setAttribute("width", String(store.spec.viewport.width));
  background.setAttribute("height", String(store.spec.viewport.height));
  background.setAttribute("class", "canvas-background");
  canvas.appendChild(background);
  canvas.appendChild(createViewportOverlay());

  for (const component of store.components) {
    const report = analysis.components.find((item) => item.componentId === component.id);
    canvas.appendChild(createComponentElement(component, report?.status === "under"));
  }

  for (const component of store.components) {
    canvas.appendChild(createConstraintOverlay(component, horizontalBands, verticalBands, labelBoxes));
  }

  const selected = store.selectedId ? store.spec.components[store.selectedId] : null;
  if (selected && selected.shape === "ellipse") {
    const ellipsePreview = createSvgElement("g");
    ellipsePreview.setAttribute("data-component-id", selected.id);
    ellipsePreview.setAttribute("data-preserve-selection", "true");
    ellipsePreview.appendChild(createHandleOutline(selected.box));
    ellipsePreview.appendChild(createHandleOutlineHit(selected.box, selected.id));
    canvas.appendChild(ellipsePreview);
  }

  const previewComponentId = getPreviewComponentId();
  if (previewComponentId) {
    const previewComponent = store.spec.components[previewComponentId];
    if (previewComponent && previewComponent.id !== "root") {
      canvas.appendChild(createResizeHandles(previewComponent, true, getPreviewHandleForRender()));
    }
  }
}

function createViewportOverlay(): SVGGElement {
  const { width, height } = store.spec.viewport;
  const overlay = createSvgElement("g");
  const border = createSvgElement("rect");
  border.setAttribute("x", "0");
  border.setAttribute("y", "0");
  border.setAttribute("width", String(width));
  border.setAttribute("height", String(height));
  border.setAttribute("class", "viewport-boundary");
  overlay.appendChild(border);
  overlay.appendChild(createViewportLabel(16, 18, "viewport (0, 0)", "start"));
  overlay.appendChild(createViewportLabel(width - 16, height - 12, `${width}, ${height}`, "end"));
  return overlay;
}

function createComponentElement(component: ComponentNode, isUnderConstrained: boolean): SVGElement {
  const { box } = component;
  const selected = component.id === store.selectedId;
  const element = createSvgElement(component.shape === "ellipse" ? "ellipse" : "rect");

  if (element instanceof SVGEllipseElement) {
    element.setAttribute("cx", String(box.x + box.width / 2));
    element.setAttribute("cy", String(box.y + box.height / 2));
    element.setAttribute("rx", String(box.width / 2));
    element.setAttribute("ry", String(box.height / 2));
  } else {
    element.setAttribute("x", String(box.x));
    element.setAttribute("y", String(box.y));
    element.setAttribute("width", String(box.width));
    element.setAttribute("height", String(box.height));
  }

  const classes = ["component"];
  if (selected) classes.push("is-selected");
  if (isUnderConstrained) classes.push("is-under");
  element.setAttribute("class", classes.join(" "));
  element.setAttribute("data-preserve-selection", "true");
  element.setAttribute("data-component-id", component.id);
  element.addEventListener("pointerdown", (event) => {
    const pointerEvent = event as PointerEvent;
    if (dragging?.mode === "retarget") return;
    pointerEvent.stopPropagation();
    store.select(component.id);
    hoveredControlKey = getHandleControlKey(component.id, "move");
    hoveredComponentId = null;
    hoveredPreviewHandle = null;
    dragging = {
      mode: "move",
      id: component.id,
      pointerId: pointerEvent.pointerId,
      startClientX: pointerEvent.clientX,
      startClientY: pointerEvent.clientY,
      startBox: cloneBox(component.box),
    };
    canvas.setPointerCapture(pointerEvent.pointerId);
    render();
  });

  return element;
}

function createResizeHandles(component: ComponentNode, preview = false, previewHandle: ControlHandle | null = null): SVGGElement {
  const group = createSvgElement("g");
  group.setAttribute("class", "resize-handles");
  group.setAttribute("data-preserve-selection", "true");
  group.setAttribute("data-component-id", component.id);
  const availability = getControlAvailability(component.id);

  if (component.shape === "ellipse" && !preview) {
    group.appendChild(createHandleOutline(component.box));
  }

  for (const { handle, x, y, cursor } of getResizeHandlePoints(component.box)) {
    if (isResizeHandleHidden(handle, availability, preview, previewHandle)) continue;
    const key = getHandleControlKey(component.id, handle);
    if (shouldHideOtherControls(key)) continue;
    const node = createControlHandle(component, handle, x, y, cursor);
    group.appendChild(node);
  }

  return group;
}

function isHandleAvailable(handle: ControlHandle, availability: ControlAvailability): boolean {
  if (handle === "move") return availability.canMoveX || availability.canMoveY;
  if (handle === "w") return availability.canResizeLeft;
  if (handle === "e") return availability.canResizeRight;
  if (handle === "n") return availability.canResizeTop;
  if (handle === "s") return availability.canResizeBottom;
  if (handle === "nw") return availability.canResizeNW;
  if (handle === "ne") return availability.canResizeNE;
  if (handle === "sw") return availability.canResizeSW;
  if (handle === "se") return availability.canResizeSE;
  return false;
}

function isResizeHandleHidden(
  handle: ControlHandle,
  availability: ControlAvailability,
  preview: boolean,
  previewHandle: ControlHandle | null = null,
): boolean {
  if (preview) {
    return handle !== previewHandle;
  }
  return !isHandleAvailable(handle, availability);
}

function createConstraintOverlay(
  component: ComponentNode,
  horizontalBands: Array<{ y: number; start: number; end: number }>,
  verticalBands: Array<{ x: number; start: number; end: number }>,
  labelBoxes: LabelBox[],
): SVGGElement {
  const overlay = createSvgElement("g");
  overlay.setAttribute("class", "constraint-overlay");
  const constraints = store.spec.constraints.filter((constraint) => constraint.componentId === component.id);
  const usesCenter =
    constraints.some(
      (constraint) =>
        constraint.kind === "centerX" ||
        constraint.kind === "centerY" ||
        constraint.sourceAnchor === "centerX" ||
        constraint.sourceAnchor === "centerY",
    ) ||
    store.spec.constraints.some(
      (constraint) =>
        constraint.sourceComponentId === component.id &&
        (constraint.sourceAnchor === "centerX" || constraint.sourceAnchor === "centerY"),
    );

  if (usesCenter) {
    overlay.appendChild(createCenterCross(component));
  }

  const xPositionals = constraints.filter((constraint) => constraint.axis === "x" && constraint.kind !== "width" && constraint.kind !== "ratio");
  const yPositionals = constraints.filter((constraint) => constraint.axis === "y" && constraint.kind !== "height" && constraint.kind !== "ratio");
  const ratioConstraint = constraints.find((constraint) => constraint.kind === "ratio");

  xPositionals.forEach((constraint, index) => {
    overlay.appendChild(createHorizontalDimension(component, constraint, index, horizontalBands, labelBoxes));
  });

  yPositionals.forEach((constraint, index) => {
    overlay.appendChild(createVerticalDimension(component, constraint, index, verticalBands, labelBoxes));
  });

  const widthConstraint = constraints.find((constraint) => constraint.axis === "x" && constraint.kind === "width");
  if (widthConstraint) {
    overlay.appendChild(createSizeDimension(component, widthConstraint, "x", horizontalBands, verticalBands, labelBoxes));
  }

  const heightConstraint = constraints.find((constraint) => constraint.axis === "y" && constraint.kind === "height");
  if (heightConstraint) {
    overlay.appendChild(createSizeDimension(component, heightConstraint, "y", horizontalBands, verticalBands, labelBoxes));
  }

  if (ratioConstraint) {
    overlay.appendChild(createRatioOverlay(component, ratioConstraint, labelBoxes));
  }

  return overlay;
}

function createHorizontalDimension(
  component: ComponentNode,
  constraint: ConstraintSpec,
  index: number,
  horizontalBands: Array<{ y: number; start: number; end: number }>,
  labelBoxes: LabelBox[],
): SVGGElement {
  const group = createSvgElement("g");
  const initialTarget = getTargetAnchorPoint(component, constraint);
  if (!initialTarget) return group;
  const retargeting = getRetargetState(constraint.id);
  const source = retargeting?.candidate?.point ?? getSourceAnchorPoint(constraint, "x", initialTarget.y);
  const target = getTargetAnchorPoint(component, constraint, source?.y);
  if (!target || !source) return group;
  if (Math.abs(source.x - target.x) < 0.5) {
    group.appendChild(createAnnotationGuideLine(source, target));
    return group;
  }

  const proposedY = Math.min(source.y, target.y) - 22 - index * 20;
  const y = reserveHorizontalBand(horizontalBands, proposedY, source.x, target.x);
  const dimSource = { x: source.x, y };
  const dimTarget = { x: target.x, y };
  group.appendChild(
    createStandardAnnotation({
      constraint,
      axis: "x",
      referenceA: source,
      referenceB: target,
      measureA: dimSource,
      measureB: dimTarget,
      label: formatConstraintLabel(constraint),
      labelBoxes,
      isRetargeting: Boolean(retargeting),
    }),
  );
  return group;
}

function createVerticalDimension(
  component: ComponentNode,
  constraint: ConstraintSpec,
  index: number,
  verticalBands: Array<{ x: number; start: number; end: number }>,
  labelBoxes: LabelBox[],
): SVGGElement {
  const group = createSvgElement("g");
  const initialTarget = getTargetAnchorPoint(component, constraint);
  if (!initialTarget) return group;
  const retargeting = getRetargetState(constraint.id);
  const source = retargeting?.candidate?.point ?? getSourceAnchorPoint(constraint, "y", initialTarget.x);
  const target = getTargetAnchorPoint(component, constraint, source?.x);
  if (!target || !source) return group;
  if (Math.abs(source.y - target.y) < 0.5) {
    group.appendChild(createAnnotationGuideLine(source, target));
    return group;
  }

  const proposedX = Math.min(source.x, target.x) - 22 - index * 20;
  const x = reserveVerticalBand(verticalBands, proposedX, source.y, target.y);
  const dimSource = { x, y: source.y };
  const dimTarget = { x, y: target.y };
  group.appendChild(
    createStandardAnnotation({
      constraint,
      axis: "y",
      referenceA: source,
      referenceB: target,
      measureA: dimSource,
      measureB: dimTarget,
      label: formatConstraintLabel(constraint),
      labelBoxes,
      isRetargeting: Boolean(retargeting),
    }),
  );
  return group;
}

function createSizeDimension(
  component: ComponentNode,
  constraint: ConstraintSpec,
  axis: AxisKind,
  horizontalBands: Array<{ y: number; start: number; end: number }>,
  verticalBands: Array<{ x: number; start: number; end: number }>,
  labelBoxes: LabelBox[],
): SVGGElement {
  const group = createSvgElement("g");

  if (axis === "x") {
    const left = getOuterSizeAnchorPoint(component, "left", "x");
    const right = getOuterSizeAnchorPoint(component, "right", "x");
    if (component.shape === "ellipse") {
      const leftTangent = getSizeAnchorPoint(component, "left", "x");
      const rightTangent = getSizeAnchorPoint(component, "right", "x");
      group.appendChild(createDashedExtension(leftTangent, left));
      group.appendChild(createDashedExtension(rightTangent, right));
    }
    const proposedY = Math.max(left.y, right.y) + 24;
    const y = reserveHorizontalBand(horizontalBands, proposedY, left.x, right.x);
    group.appendChild(
      createStandardAnnotation({
        constraint,
        axis: "x",
        referenceA: left,
        referenceB: right,
        measureA: { x: left.x, y },
        measureB: { x: right.x, y },
        label: formatConstraintLabel(constraint),
        labelBoxes,
      }),
    );
    return group;
  }

  const top = getOuterSizeAnchorPoint(component, "top", "y");
  const bottom = getOuterSizeAnchorPoint(component, "bottom", "y");
  if (component.shape === "ellipse") {
    const topTangent = getSizeAnchorPoint(component, "top", "y");
    const bottomTangent = getSizeAnchorPoint(component, "bottom", "y");
    group.appendChild(createDashedExtension(topTangent, top));
    group.appendChild(createDashedExtension(bottomTangent, bottom));
  }
  const proposedX = Math.max(top.x, bottom.x) + 24;
  const x = reserveVerticalBand(verticalBands, proposedX, top.y, bottom.y);
  group.appendChild(
    createStandardAnnotation({
      constraint,
      axis: "y",
      referenceA: top,
      referenceB: bottom,
      measureA: { x, y: top.y },
      measureB: { x, y: bottom.y },
      label: formatConstraintLabel(constraint),
      labelBoxes,
    }),
  );
  return group;
}

function createCenterCross(component: ComponentNode): SVGGElement {
  const group = createSvgElement("g");
  const cx = component.box.x + component.box.width / 2;
  const cy = component.box.y + component.box.height / 2;

  group.appendChild(createExtensionLine(cx - 8, cy, cx + 8, cy));
  group.appendChild(createExtensionLine(cx, cy - 8, cx, cy + 8));
  return group;
}

function createRatioOverlay(component: ComponentNode, ratioConstraint: ConstraintSpec | undefined, labelBoxes: LabelBox[]): SVGGElement {
  const group = createSvgElement("g");
  const center = {
    x: component.box.x + component.box.width / 2,
    y: component.box.y + component.box.height / 2,
  };
  const corner = {
    x: component.box.x + component.box.width,
    y: component.box.y,
  };

  if (component.shape === "ellipse") {
    const right = { x: component.box.x + component.box.width, y: center.y };
    const top = { x: center.x, y: component.box.y };
    group.appendChild(createRatioGuide(right.x, right.y, corner.x, corner.y));
    group.appendChild(createRatioGuide(top.x, top.y, corner.x, corner.y));
  }

  group.appendChild(
    createOneWayAnnotation({
      constraint: ratioConstraint,
      axis: "x",
      start: center,
      end: corner,
      label: formatRatioDisplayLabel(ratioConstraint, component.box.width, component.box.height),
      labelBoxes,
    }),
  );
  return group;
}

function createExtensionLine(x1: number, y1: number, x2: number, y2: number): SVGLineElement {
  const line = createSvgElement("line");
  line.setAttribute("x1", String(x1));
  line.setAttribute("y1", String(y1));
  line.setAttribute("x2", String(x2));
  line.setAttribute("y2", String(y2));
  line.setAttribute("class", "dimension-extension");
  return line;
}

function createDimensionLine(x1: number, y1: number, x2: number, y2: number): SVGLineElement {
  const line = createSvgElement("line");
  line.setAttribute("x1", String(x1));
  line.setAttribute("y1", String(y1));
  line.setAttribute("x2", String(x2));
  line.setAttribute("y2", String(y2));
  line.setAttribute("class", "dimension-line");
  return line;
}

function createAnnotationGuideLine(start: Vec2, end: Vec2): SVGLineElement {
  const line = createSvgElement("line");
  line.setAttribute("x1", String(start.x));
  line.setAttribute("y1", String(start.y));
  line.setAttribute("x2", String(end.x));
  line.setAttribute("y2", String(end.y));
  line.setAttribute("class", "alignment-line");
  return line;
}

function createRatioGuide(x1: number, y1: number, x2: number, y2: number): SVGLineElement {
  const line = createSvgElement("line");
  line.setAttribute("x1", String(x1));
  line.setAttribute("y1", String(y1));
  line.setAttribute("x2", String(x2));
  line.setAttribute("y2", String(y2));
  line.setAttribute("class", "ratio-guide");
  return line;
}

function createRatioLine(x1: number, y1: number, x2: number, y2: number): SVGLineElement {
  const line = createSvgElement("line");
  line.setAttribute("x1", String(x1));
  line.setAttribute("y1", String(y1));
  line.setAttribute("x2", String(x2));
  line.setAttribute("y2", String(y2));
  line.setAttribute("class", "ratio-line");
  return line;
}

function createStandardAnnotation({
  constraint,
  axis,
  referenceA,
  referenceB,
  measureA,
  measureB,
  label,
  labelBoxes,
  isRetargeting = false,
}: {
  constraint: ConstraintSpec;
  axis: AxisKind;
  referenceA: Vec2;
  referenceB: Vec2;
  measureA: Vec2;
  measureB: Vec2;
  label: string;
  labelBoxes: LabelBox[];
  isRetargeting?: boolean;
}): SVGGElement {
  const group = createSvgElement("g");
  if (isRetargeting) {
    group.setAttribute("class", "annotation-retargeting");
  }
  let start = measureA;
  let end = measureB;
  let refStart = referenceA;
  let refEnd = referenceB;

  if (shouldSwapAnnotationEndpoints(start, end)) {
    start = measureB;
    end = measureA;
    refStart = referenceB;
    refEnd = referenceA;
  }

  const dir = normalize(subtract(end, start));
  const theta = rotateCcw(dir);
  const targetTip = shouldSwapAnnotationEndpoints(measureA, measureB) ? start : end;

  const span = Math.abs(dot(subtract(end, start), dir));
  if (span < 0.5) {
    group.appendChild(createAnnotationGuideLine(referenceA, referenceB));
    return group;
  }

  group.appendChild(createDashedExtension(refStart, start));
  group.appendChild(createDashedExtension(refEnd, end));
  group.appendChild(createEndBar(start, theta));
  group.appendChild(createEndBar(end, theta));

  const labelWidth = estimateLabelWidth(label);
  const innerThreshold = labelWidth + ANNOTATION_UNIT * 1.5;
  const preferOutside = span < innerThreshold;
  const innerPlacement = createInnerLabelPlacement(start, end, dir, theta, labelWidth);
  const outerPlacement = chooseOuterLabelPlacement(start, end, dir, theta, labelWidth);
  const useOuter = preferOutside || collidesWithLabels(innerPlacement.box, labelBoxes);
  const placement = useOuter ? outerPlacement : innerPlacement;

  if (useOuter) {
    const labelSide = placement.side === "positive" ? end : start;
    const sideSign = placement.side === "positive" ? 1 : -1;
    const textExtent = labelWidth + ANNOTATION_UNIT + ANNOTATION_UNIT * 0.5;
    const extensionEnd = add(labelSide, scale(dir, sideSign * textExtent));
    group.appendChild(createDimensionLine(start.x, start.y, end.x, end.y));
    group.appendChild(createDimensionLine(labelSide.x, labelSide.y, extensionEnd.x, extensionEnd.y));
    group.appendChild(createArrowWithTail(start, scale(dir, -1), false));
    group.appendChild(createArrowWithTail(end, dir, false));
  } else {
    group.appendChild(createDimensionLine(start.x, start.y, end.x, end.y));
    group.appendChild(createArrowTriangle(start, dir));
    group.appendChild(createArrowTriangle(end, scale(dir, -1)));
  }

  registerLabelBox(placement.box, labelBoxes);
  group.appendChild(createPlacedLabel(placement.center, dir, label));
  for (const controlSpec of getConstraintControlSpecs(constraint, axis, start, end, dir, targetTip)) {
    const control = createConstraintArrowControl(controlSpec.tip, controlSpec.direction, constraint, axis, false, controlSpec.valueScale);
    if (control) {
      group.appendChild(control);
    }
  }
  const referenceTip = targetTip === start ? end : start;
  const retargetControl = createReferenceRetargetControl(referenceTip, constraint, axis);
  if (retargetControl) {
    group.appendChild(retargetControl);
  }
  return group;
}

function createOneWayAnnotation({
  constraint,
  axis,
  start,
  end,
  label,
  labelBoxes,
}: {
  constraint: ConstraintSpec | undefined;
  axis: AxisKind;
  start: Vec2;
  end: Vec2;
  label: string;
  labelBoxes: LabelBox[];
}): SVGGElement {
  const group = createSvgElement("g");
  const dir = canonicalizeAnnotationDirection(subtract(end, start));
  const theta = rotateCcw(dir);
  const distance = length(subtract(end, start));
  if (distance < 0.5) return group;

  const labelWidth = estimateLabelWidth(label);
  const innerThreshold = labelWidth + ANNOTATION_UNIT * 1.5;
  const innerPlacement = createInnerLabelPlacement(start, end, dir, theta, labelWidth);
  const outerPlacement = createOuterRatioPlacement(end, dir, theta, labelWidth);
  const useOuter = distance < innerThreshold || collidesWithLabels(innerPlacement.box, labelBoxes);
  const placement = useOuter ? outerPlacement : innerPlacement;

  if (useOuter) {
    const extensionEnd = add(end, scale(dir, labelWidth + ANNOTATION_UNIT));
    group.appendChild(createRatioLine(start.x, start.y, extensionEnd.x, extensionEnd.y));
  } else {
    group.appendChild(createRatioLine(start.x, start.y, end.x, end.y));
  }

  group.appendChild(createCrossMarker(start));
  group.appendChild(createArrowWithTail(end, scale(dir, -1), true));
  registerLabelBox(placement.box, labelBoxes);
  group.appendChild(createRatioText(placement.center, dir, label));
  if (constraint) {
    const control = createConstraintArrowControl(end, scale(dir, -1), constraint, axis, true, 1);
    if (control) {
      group.appendChild(control);
    }
  }
  return group;
}

function createInnerLabelPlacement(start: Vec2, end: Vec2, dir: Vec2, theta: Vec2, labelWidth: number): {
  center: Vec2;
  box: LabelBox;
  side: "positive";
} {
  const center = add(midpoint(start, end), scale(theta, ANNOTATION_LABEL_CENTER_OFFSET));
  return {
    center,
    box: getCenteredRotatedLabelBox(center, dir, labelWidth, ANNOTATION_FONT_SIZE),
    side: "positive",
  };
}

function createOuterRatioPlacement(end: Vec2, dir: Vec2, theta: Vec2, labelWidth: number): {
  center: Vec2;
  box: LabelBox;
  side: "positive";
} {
  const center = add(
    end,
    add(
      scale(dir, ANNOTATION_UNIT + labelWidth / 2),
      scale(theta, ANNOTATION_LABEL_CENTER_OFFSET),
    ),
  );
  return {
    center,
    box: getCenteredRotatedLabelBox(center, dir, labelWidth, ANNOTATION_FONT_SIZE),
    side: "positive",
  };
}

function chooseOuterLabelPlacement(start: Vec2, end: Vec2, dir: Vec2, theta: Vec2, labelWidth: number): {
  center: Vec2;
  box: LabelBox;
  side: "positive" | "negative";
} {
  const positive = getOuterLabelPlacement(end, dir, theta, labelWidth, "positive");
  const negative = getOuterLabelPlacement(start, scale(dir, -1), theta, labelWidth, "negative");
  const positiveScore = scoreLabelPlacement(positive.box);
  const negativeScore = scoreLabelPlacement(negative.box);
  return positiveScore <= negativeScore ? positive : negative;
}

function getOuterLabelPlacement(anchor: Vec2, outward: Vec2, theta: Vec2, labelWidth: number, side: "positive" | "negative"): {
  center: Vec2;
  box: LabelBox;
  side: "positive" | "negative";
} {
  const center = add(
    anchor,
    add(
      scale(normalize(outward), ANNOTATION_UNIT + labelWidth / 2),
      scale(theta, ANNOTATION_LABEL_CENTER_OFFSET),
    ),
  );
  return {
    center,
    box: getCenteredRotatedLabelBox(center, normalize(outward), labelWidth, ANNOTATION_FONT_SIZE),
    side,
  };
}

function scoreLabelPlacement(box: LabelBox): number {
  let score = 0;
  if (box.x < 0) score += 1000 + Math.abs(box.x);
  if (box.y < 0) score += 1000 + Math.abs(box.y);
  if (box.x + box.width > store.spec.viewport.width) score += 1000 + (box.x + box.width - store.spec.viewport.width);
  if (box.y + box.height > store.spec.viewport.height) score += 1000 + (box.y + box.height - store.spec.viewport.height);
  return score;
}

function collidesWithLabels(candidate: LabelBox, existing: LabelBox[]): boolean {
  return existing.some((box) => boxesOverlap(candidate, box));
}

function registerLabelBox(candidate: LabelBox, labelBoxes: LabelBox[]): void {
  labelBoxes.push(candidate);
}

function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
  return !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
}

function getCenteredRotatedLabelBox(center: Vec2, dir: Vec2, width: number, height: number): LabelBox {
  const r = normalize(dir);
  const theta = rotateCcw(r);
  const halfHeight = height / 2;
  const halfWidth = width / 2;
  const corners = [
    add(add(center, scale(r, -halfWidth)), scale(theta, -halfHeight)),
    add(add(center, scale(r, -halfWidth)), scale(theta, halfHeight)),
    add(add(center, scale(r, halfWidth)), scale(theta, -halfHeight)),
    add(add(center, scale(r, halfWidth)), scale(theta, halfHeight)),
  ];
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

function createPlacedLabel(center: Vec2, dir: Vec2, text: string): SVGTextElement {
  const label = createSvgElement("text");
  label.setAttribute("x", String(center.x));
  label.setAttribute("y", String(center.y));
  label.setAttribute("text-anchor", "middle");
  label.setAttribute("dominant-baseline", "middle");
  label.setAttribute("class", "dimension-label");
  label.setAttribute("transform", `rotate(${(Math.atan2(dir.y, dir.x) * 180) / Math.PI} ${center.x} ${center.y})`);
  label.textContent = text;
  return label;
}

function createRatioText(center: Vec2, dir: Vec2, text: string): SVGTextElement {
  const label = createPlacedLabel(center, dir, text);
  label.setAttribute("class", "ratio-label");
  return label;
}

function createDashedExtension(from: Vec2, to: Vec2): SVGLineElement {
  const line = createSvgElement("line");
  line.setAttribute("x1", String(from.x));
  line.setAttribute("y1", String(from.y));
  line.setAttribute("x2", String(to.x));
  line.setAttribute("y2", String(to.y));
  line.setAttribute("class", "annotation-guide");
  return line;
}

function createEndBar(center: Vec2, theta: Vec2): SVGLineElement {
  const half = ANNOTATION_UNIT / 2;
  const start = add(center, scale(theta, -half));
  const end = add(center, scale(theta, half));
  return createDimensionLine(start.x, start.y, end.x, end.y);
}

function createArrowTriangle(tip: Vec2, direction: Vec2): SVGPathElement {
  return createArrowTriangleSized(tip, direction, ANNOTATION_ARROW_SIDE);
}

function createArrowTriangleSized(tip: Vec2, direction: Vec2, side: number): SVGPathElement {
  const dir = normalize(direction);
  const theta = rotateCcw(dir);
  const length = (side * Math.sqrt(3)) / 2;
  const baseCenter = add(tip, scale(dir, length));
  const left = add(baseCenter, scale(theta, side / 2));
  const right = add(baseCenter, scale(theta, -side / 2));
  const path = createSvgElement("path");
  path.setAttribute("d", `M ${tip.x} ${tip.y} L ${left.x} ${left.y} L ${right.x} ${right.y} Z`);
  path.setAttribute("class", "dimension-arrow");
  return path;
}

function createArrowWithTail(tip: Vec2, direction: Vec2, ratio = false): SVGGElement {
  const group = createSvgElement("g");
  const dir = normalize(direction);
  const tailStart = add(tip, scale(dir, ANNOTATION_ARROW_LENGTH + ANNOTATION_UNIT * 0.5));
  const tailEnd = add(tip, scale(dir, ANNOTATION_ARROW_LENGTH));
  group.appendChild(ratio ? createRatioLine(tailStart.x, tailStart.y, tailEnd.x, tailEnd.y) : createDimensionLine(tailStart.x, tailStart.y, tailEnd.x, tailEnd.y));
  group.appendChild(createArrowTriangle(tip, direction));
  return group;
}

function createCrossMarker(center: Vec2): SVGGElement {
  const group = createSvgElement("g");
  const half = ANNOTATION_UNIT / 2;
  group.appendChild(createRatioLine(center.x - half, center.y, center.x + half, center.y));
  group.appendChild(createRatioLine(center.x, center.y - half, center.x, center.y + half));
  return group;
}

function createConstraintArrowControl(
  tip: Vec2,
  direction: Vec2,
  constraint: ConstraintSpec,
  axis: AxisKind,
  ratio = false,
  valueScale = 1,
): SVGPathElement | null {
  const availability = getControlAvailability(constraint.componentId);
  if (constraint.locked) return null;
  if (ratio && !availability.canResizeNE) return null;
  if (constraint.kind === "left" && !availability.canResizeLeft) return null;
  if (constraint.kind === "right" && !availability.canResizeRight) return null;
  if (constraint.kind === "centerX" && !availability.canMoveX) return null;
  if (constraint.kind === "top" && !availability.canResizeTop) return null;
  if (constraint.kind === "bottom" && !availability.canResizeBottom) return null;
  if (constraint.kind === "centerY" && !availability.canMoveY) return null;
  const key = getConstraintControlKey(constraint.id);
  if (shouldHideOtherControls(key)) return null;

  const path = createArrowTriangleSized(tip, direction, ANNOTATION_UNIT * 0.75);
  path.setAttribute(
    "class",
    [
      "constraint-arrow-control",
      ratio ? "is-ratio" : "",
      isControlActive(key) ? "is-active" : "",
    ]
      .filter(Boolean)
      .join(" "),
  );
  path.setAttribute("data-preserve-selection", "true");
  path.setAttribute("data-control-key", key);

  path.style.cursor = getDirectionalResizeCursor(direction);
  path.addEventListener("pointerdown", (event) => {
    const pointerEvent = event as PointerEvent;
    if (dragging?.mode === "retarget") return;
    pointerEvent.stopPropagation();
    hoveredControlKey = key;
    hoveredComponentId = null;
    hoveredPreviewHandle = null;
    store.select(constraint.componentId);
    dragging = {
      mode: "constraint",
      constraintId: constraint.id,
      pointerId: pointerEvent.pointerId,
      startClientX: pointerEvent.clientX,
      startClientY: pointerEvent.clientY,
      axis,
      startValue: constraint.value,
      valueScale,
    };
    canvas.setPointerCapture(pointerEvent.pointerId);
    render();
  });

  return path;
}

function createReferenceRetargetControl(
  tip: Vec2,
  constraint: ConstraintSpec,
  axis: AxisKind,
): SVGCircleElement | null {
  if (!isRetargetableConstraint(constraint.kind) || constraint.locked) return null;
  const control = createSvgElement("circle");
  control.setAttribute("cx", String(tip.x));
  control.setAttribute("cy", String(tip.y));
  control.setAttribute("r", "10");
  control.setAttribute("class", "reference-retarget-control");
  control.setAttribute("data-preserve-selection", "true");
  control.style.cursor = "alias";
  control.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  control.addEventListener("dblclick", (event) => {
    const mouseEvent = event as MouseEvent;
    mouseEvent.stopPropagation();
    hoveredControlKey = getRetargetControlKey(constraint.id);
    hoveredComponentId = null;
    hoveredPreviewHandle = null;
    store.select(constraint.componentId);
    dragging = {
      mode: "retarget",
      constraintId: constraint.id,
      pointerId: 1,
      axis,
      candidate: findNearestRetargetCandidate(constraint, getCanvasPoint(mouseEvent)),
    };
    render();
  });
  return control;
}

function getDirectionalResizeCursor(direction: Vec2): string {
  const normalized = normalize(direction);
  const angle = Math.atan2(normalized.y, normalized.x);
  const degrees = ((angle * 180) / Math.PI + 360) % 360;

  if (degrees >= 22.5 && degrees < 67.5) return "nwse-resize";
  if (degrees >= 67.5 && degrees < 112.5) return "ns-resize";
  if (degrees >= 112.5 && degrees < 157.5) return "nesw-resize";
  if (degrees >= 157.5 && degrees < 202.5) return "ew-resize";
  if (degrees >= 202.5 && degrees < 247.5) return "nwse-resize";
  if (degrees >= 247.5 && degrees < 292.5) return "ns-resize";
  if (degrees >= 292.5 && degrees < 337.5) return "nesw-resize";
  return "ew-resize";
}

function getTargetAnchorPoint(
  component: ComponentNode,
  constraint: ConstraintSpec,
  alignedCoordinate?: number,
): { x: number; y: number } | null {
  if (constraint.kind === "left") return getBoundaryAnchorPoint(component, "left", "x", alignedCoordinate);
  if (constraint.kind === "right") return getBoundaryAnchorPoint(component, "right", "x", alignedCoordinate);
  if (constraint.kind === "centerX") return getBoundaryAnchorPoint(component, "centerX", "x", alignedCoordinate);
  if (constraint.kind === "top") return getBoundaryAnchorPoint(component, "top", "y", alignedCoordinate);
  if (constraint.kind === "bottom") return getBoundaryAnchorPoint(component, "bottom", "y", alignedCoordinate);
  if (constraint.kind === "centerY") return getBoundaryAnchorPoint(component, "centerY", "y", alignedCoordinate);
  return null;
}

function getSourceAnchorPoint(
  constraint: ConstraintSpec,
  axis: AxisKind,
  alignedCoordinate?: number,
): { x: number; y: number } | null {
  if (constraint.kind === "ratio") return null;
  const source = constraint.sourceComponentId ? store.spec.components[constraint.sourceComponentId] : store.spec.components.root;
  if (!source) return null;

  if (source.id === "root") {
    return getViewportAnchorPoint(constraint.sourceAnchor, axis, alignedCoordinate);
  }

  if (constraint.sourceAnchor === "left") return getBoundaryAnchorPoint(source, "left", "x", alignedCoordinate);
  if (constraint.sourceAnchor === "right") return getBoundaryAnchorPoint(source, "right", "x", alignedCoordinate);
  if (constraint.sourceAnchor === "centerX") return getBoundaryAnchorPoint(source, "centerX", "x", alignedCoordinate);
  if (constraint.sourceAnchor === "top") return getBoundaryAnchorPoint(source, "top", "y", alignedCoordinate);
  if (constraint.sourceAnchor === "bottom") return getBoundaryAnchorPoint(source, "bottom", "y", alignedCoordinate);
  if (constraint.sourceAnchor === "centerY") return getBoundaryAnchorPoint(source, "centerY", "y", alignedCoordinate);
  return null;
}

function getAnchorPointForCandidate(
  sourceComponentId: string | null,
  sourceAnchor: SourceAnchor,
  axis: AxisKind,
  alignedCoordinate?: number,
): Vec2 | null {
  if (sourceAnchor === "ratio") return null;
  const source = sourceComponentId ? store.spec.components[sourceComponentId] : store.spec.components.root;
  if (!source) return null;
  if (source.id === "root") {
    return getViewportAnchorPoint(sourceAnchor, axis, alignedCoordinate);
  }
  if (sourceAnchor === "left") return getBoundaryAnchorPoint(source, "left", "x", alignedCoordinate);
  if (sourceAnchor === "right") return getBoundaryAnchorPoint(source, "right", "x", alignedCoordinate);
  if (sourceAnchor === "centerX") return getBoundaryAnchorPoint(source, "centerX", "x", alignedCoordinate);
  if (sourceAnchor === "top") return getBoundaryAnchorPoint(source, "top", "y", alignedCoordinate);
  if (sourceAnchor === "bottom") return getBoundaryAnchorPoint(source, "bottom", "y", alignedCoordinate);
  if (sourceAnchor === "centerY") return getBoundaryAnchorPoint(source, "centerY", "y", alignedCoordinate);
  return null;
}

function getRetargetableAnchors(axis: AxisKind): SourceAnchor[] {
  return axis === "x" ? ["left", "right", "centerX"] : ["top", "bottom", "centerY"];
}

function isRetargetableConstraint(kind: ConstraintKind): boolean {
  return kind === "left" || kind === "right" || kind === "top" || kind === "bottom" || kind === "centerX" || kind === "centerY";
}

function componentDependsOn(componentId: string, targetId: string, visited = new Set<string>()): boolean {
  if (componentId === targetId) return true;
  if (visited.has(componentId)) return false;
  visited.add(componentId);
  const dependencies = store.spec.constraints
    .filter((constraint) => constraint.componentId === componentId && constraint.sourceComponentId)
    .map((constraint) => constraint.sourceComponentId)
    .filter((value): value is string => Boolean(value));

  for (const dependencyId of dependencies) {
    if (dependencyId === targetId) return true;
    if (componentDependsOn(dependencyId, targetId, visited)) return true;
  }
  return false;
}

function wouldCreateRetargetCycle(constraint: ConstraintSpec, sourceComponentId: string | null): boolean {
  if (sourceComponentId === null) return false;
  if (sourceComponentId === constraint.componentId) return true;
  return componentDependsOn(sourceComponentId, constraint.componentId);
}

function findNearestRetargetCandidate(constraint: ConstraintSpec, point: Vec2): RetargetCandidate | null {
  const anchors = getRetargetableAnchors(constraint.axis);
  const alignedCoordinate = constraint.axis === "x" ? point.y : point.x;
  const candidates: RetargetCandidate[] = [];

  for (const anchor of anchors) {
    const viewportPoint = getAnchorPointForCandidate(null, anchor, constraint.axis, alignedCoordinate);
    if (viewportPoint) {
      candidates.push({
        sourceComponentId: null,
        sourceAnchor: anchor,
        point: viewportPoint,
        distance: length(subtract(viewportPoint, point)),
      });
    }
  }

  for (const component of store.components) {
    if (wouldCreateRetargetCycle(constraint, component.id)) continue;
    for (const anchor of anchors) {
      const anchorPoint = getAnchorPointForCandidate(component.id, anchor, constraint.axis, alignedCoordinate);
      if (!anchorPoint) continue;
      candidates.push({
        sourceComponentId: component.id,
        sourceAnchor: anchor,
        point: anchorPoint,
        distance: length(subtract(anchorPoint, point)),
      });
    }
  }

  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0] ?? null;
}

function getViewportAnchorPoint(
  anchor: SourceAnchor,
  axis: AxisKind,
  alignedCoordinate?: number,
): { x: number; y: number } | null {
  if (axis === "x") {
    const y = alignedCoordinate ?? store.spec.viewport.height / 2;
    if (anchor === "left") return { x: 0, y };
    if (anchor === "right") return { x: store.spec.viewport.width, y };
    if (anchor === "centerX") {
      const topDistance = Math.abs(y - 0);
      const bottomDistance = Math.abs(store.spec.viewport.height - y);
      return {
        x: store.spec.viewport.width / 2,
        y: topDistance <= bottomDistance ? 0 : store.spec.viewport.height,
      };
    }
  }

  if (axis === "y") {
    const x = alignedCoordinate ?? store.spec.viewport.width / 2;
    if (anchor === "top") return { x, y: 0 };
    if (anchor === "bottom") return { x, y: store.spec.viewport.height };
    if (anchor === "centerY") {
      const leftDistance = Math.abs(x - 0);
      const rightDistance = Math.abs(store.spec.viewport.width - x);
      return {
        x: leftDistance <= rightDistance ? 0 : store.spec.viewport.width,
        y: store.spec.viewport.height / 2,
      };
    }
  }

  return null;
}

function getBoundaryAnchorPoint(
  component: ComponentNode,
  anchor: "left" | "right" | "centerX" | "top" | "bottom" | "centerY",
  axis: AxisKind,
  alignedCoordinate?: number,
): { x: number; y: number } {
  const cx = component.box.x + component.box.width / 2;
  const cy = component.box.y + component.box.height / 2;

  if (component.shape === "ellipse") {
    if (axis === "x") {
      if (anchor === "left") return { x: component.box.x, y: cy };
      if (anchor === "right") return { x: component.box.x + component.box.width, y: cy };
      return { x: cx, y: cy };
    }

    if (anchor === "top") return { x: cx, y: component.box.y };
    if (anchor === "bottom") return { x: cx, y: component.box.y + component.box.height };
    return { x: cx, y: cy };
  }

  if (axis === "x") {
    if (anchor === "centerX") return { x: cx, y: cy };
    const y = clamp(alignedCoordinate ?? cy, component.box.y, component.box.y + component.box.height);
    if (anchor === "left") return { x: component.box.x, y };
    if (anchor === "right") return { x: component.box.x + component.box.width, y };
    return { x: cx, y: cy };
  }

  if (anchor === "centerY") return { x: cx, y: cy };
  const x = clamp(alignedCoordinate ?? cx, component.box.x, component.box.x + component.box.width);
  if (anchor === "top") return { x, y: component.box.y };
  if (anchor === "bottom") return { x, y: component.box.y + component.box.height };
  return { x: cx, y: cy };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cloneBox(box: Box): Box {
  return { ...box };
}

function getResizeHandlePoints(box: Box): Array<{ handle: ControlHandle; x: number; y: number; cursor: string }> {
  const left = box.x;
  const right = box.x + box.width;
  const top = box.y;
  const bottom = box.y + box.height;
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;

  return [
    { handle: "move", x: centerX, y: centerY, cursor: "move" },
    { handle: "nw", x: left, y: top, cursor: "nwse-resize" },
    { handle: "n", x: centerX, y: top, cursor: "ns-resize" },
    { handle: "ne", x: right, y: top, cursor: "nesw-resize" },
    { handle: "e", x: right, y: centerY, cursor: "ew-resize" },
    { handle: "se", x: right, y: bottom, cursor: "nwse-resize" },
    { handle: "s", x: centerX, y: bottom, cursor: "ns-resize" },
    { handle: "sw", x: left, y: bottom, cursor: "nesw-resize" },
    { handle: "w", x: left, y: centerY, cursor: "ew-resize" },
  ];
}

function getCanvasDelta(
  startClientX: number,
  startClientY: number,
  endClientX: number,
  endClientY: number,
): { dx: number; dy: number } {
  const origin = getSvgPointFromClient(startClientX, startClientY);
  const moved = getSvgPointFromClient(endClientX, endClientY);
  return {
    dx: moved.x - origin.x,
    dy: moved.y - origin.y,
  };
}

function getCanvasPoint(event: MouseEvent | PointerEvent): Vec2 {
  return getSvgPointFromClient(event.clientX, event.clientY);
}

function getSvgPointFromClient(clientX: number, clientY: number): Vec2 {
  const point = canvas.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const matrix = canvas.getScreenCTM();
  if (!matrix) {
    return { x: clientX, y: clientY };
  }
  const transformed = point.matrixTransform(matrix.inverse());
  return { x: transformed.x, y: transformed.y };
}

function getPreviewHandleForPoint(component: ComponentNode, point: Vec2): ControlHandle | null {
  const allowEllipseCorners = store.selectedId === component.id && component.shape === "ellipse";
  const availability = getControlAvailability(component.id);
  return component.shape === "ellipse"
    ? getEllipsePreviewHandle(component.box, point, allowEllipseCorners, availability)
    : getRectPreviewHandle(component.box, point, availability);
}

function getRectPreviewHandle(box: Box, point: Vec2, availability: ControlAvailability): ControlHandle | null {
  const handleHit = findPreviewHandleHit(box, point, ["n", "e", "s", "w", "ne", "nw", "se", "sw"]);
  if (handleHit && isHandleAvailable(handleHit, availability)) return handleHit;
  return isHandleAvailable("move", availability) ? "move" : null;
}

function getEllipsePreviewHandle(
  box: Box,
  point: Vec2,
  allowCorners: boolean,
  availability: ControlAvailability,
): ControlHandle | null {
  const rx = box.width / 2 || 1;
  const ry = box.height / 2 || 1;
  const cx = box.x + rx;
  const cy = box.y + ry;
  const dx = point.x - cx;
  const dy = point.y - cy;
  const distance = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
  const handleHit = findPreviewHandleHit(box, point, allowCorners ? ["n", "e", "s", "w", "ne", "nw", "se", "sw"] : ["n", "e", "s", "w"]);
  if (handleHit && isHandleAvailable(handleHit, availability)) return handleHit;
  if (!allowCorners && Math.abs(1 - distance) <= 0.18) {
    return isHandleAvailable("move", availability) ? "move" : null;
  }
  return isHandleAvailable("move", availability) ? "move" : null;
}

function findPreviewHandleHit(box: Box, point: Vec2, handles: ControlHandle[]): ControlHandle | null {
  const halfSize = 5;
  for (const { handle, x, y } of getResizeHandlePoints(box)) {
    if (!handles.includes(handle)) continue;
    if (
      point.x >= x - halfSize &&
      point.x <= x + halfSize &&
      point.y >= y - halfSize &&
      point.y <= y + halfSize
    ) {
      return handle;
    }
  }
  return null;
}


function getResizedBox(startBox: Box, handle: Exclude<ControlHandle, "move">, dx: number, dy: number): Box {
  const minSize = 1;
  let left = startBox.x;
  let right = startBox.x + startBox.width;
  let top = startBox.y;
  let bottom = startBox.y + startBox.height;

  if (handle.includes("w")) {
    left = Math.min(startBox.x + startBox.width - minSize, startBox.x + dx);
  }
  if (handle.includes("e")) {
    right = Math.max(startBox.x + minSize, startBox.x + startBox.width + dx);
  }
  if (handle.includes("n")) {
    top = Math.min(startBox.y + startBox.height - minSize, startBox.y + dy);
  }
  if (handle.includes("s")) {
    bottom = Math.max(startBox.y + minSize, startBox.y + startBox.height + dy);
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function createControlHandle(
  component: ComponentNode,
  handle: ControlHandle,
  x: number,
  y: number,
  cursor: string,
): SVGElement {
  const key = getHandleControlKey(component.id, handle);
  const node = createSvgElement(handle === "move" ? "circle" : "rect");
  if (node instanceof SVGCircleElement) {
    node.setAttribute("cx", String(x));
    node.setAttribute("cy", String(y));
    node.setAttribute("r", "5");
  } else {
    node.setAttribute("x", String(x - 5));
    node.setAttribute("y", String(y - 5));
    node.setAttribute("width", "10");
    node.setAttribute("height", "10");
    node.setAttribute("rx", "2");
  }
  node.setAttribute(
    "class",
    [handle === "move" ? "move-handle" : "resize-handle", isControlActive(key) ? "is-active" : ""]
      .filter(Boolean)
      .join(" "),
  );
  node.setAttribute("data-preserve-selection", "true");
  node.setAttribute("data-control-key", key);
  node.style.cursor = cursor;
  node.addEventListener("pointerdown", (event) => {
    const pointerEvent = event as PointerEvent;
    if (dragging?.mode === "retarget") return;
    pointerEvent.stopPropagation();
    hoveredControlKey = key;
    hoveredComponentId = null;
    hoveredPreviewHandle = null;
    store.select(component.id);
    dragging =
      handle === "move"
        ? {
            mode: "move",
            id: component.id,
            pointerId: pointerEvent.pointerId,
            startClientX: pointerEvent.clientX,
            startClientY: pointerEvent.clientY,
            startBox: cloneBox(component.box),
          }
        : {
            mode: "resize",
            id: component.id,
            pointerId: pointerEvent.pointerId,
            startClientX: pointerEvent.clientX,
            startClientY: pointerEvent.clientY,
            startBox: cloneBox(component.box),
            handle,
          };
    canvas.setPointerCapture(pointerEvent.pointerId);
    render();
  });
  return node;
}

function getCursorForHandle(handle: ControlHandle | null): string {
  if (handle === null) return "";
  if (handle === "move") return "move";
  if (handle === "w" || handle === "e") return "ew-resize";
  if (handle === "n" || handle === "s") return "ns-resize";
  if (handle === "nw" || handle === "se") return "nwse-resize";
  if (handle === "ne" || handle === "sw") return "nesw-resize";
  return "";
}

function syncCanvasCursor(previewHandle: ControlHandle | null, hoveredControl: string | null): void {
  canvas.style.cursor = hoveredControl ? "" : getCursorForHandle(previewHandle);
}

function createHandleOutline(box: Box): SVGRectElement {
  const outline = createSvgElement("rect");
  outline.setAttribute("x", String(box.x));
  outline.setAttribute("y", String(box.y));
  outline.setAttribute("width", String(box.width));
  outline.setAttribute("height", String(box.height));
  outline.setAttribute("class", "handle-outline");
  return outline;
}

function createHandleOutlineHit(box: Box, componentId: string): SVGRectElement {
  const hit = createSvgElement("rect");
  hit.setAttribute("x", String(box.x));
  hit.setAttribute("y", String(box.y));
  hit.setAttribute("width", String(box.width));
  hit.setAttribute("height", String(box.height));
  hit.setAttribute("class", "handle-outline-hit");
  hit.setAttribute("data-component-id", componentId);
  hit.setAttribute("data-preserve-selection", "true");
  hit.addEventListener("pointerdown", (event) => {
    const pointerEvent = event as PointerEvent;
    const component = store.spec.components[componentId];
    if (!component || component.id === "root") return;
    if (dragging?.mode === "retarget") return;
    pointerEvent.stopPropagation();
    store.select(componentId);
    hoveredControlKey = getHandleControlKey(componentId, "move");
    hoveredComponentId = null;
    hoveredPreviewHandle = null;
    dragging = {
      mode: "move",
      id: componentId,
      pointerId: pointerEvent.pointerId,
      startClientX: pointerEvent.clientX,
      startClientY: pointerEvent.clientY,
      startBox: cloneBox(component.box),
    };
    canvas.setPointerCapture(pointerEvent.pointerId);
    render();
  });
  return hit;
}

function getSizeAnchorPoint(
  component: ComponentNode,
  anchor: "left" | "right" | "top" | "bottom",
  axis: AxisKind,
): { x: number; y: number } {
  if (component.shape === "ellipse") {
    const cx = component.box.x + component.box.width / 2;
    const cy = component.box.y + component.box.height / 2;
    if (anchor === "left") return { x: component.box.x, y: cy };
    if (anchor === "right") return { x: component.box.x + component.box.width, y: cy };
    if (anchor === "top") return { x: cx, y: component.box.y };
      return { x: cx, y: component.box.y + component.box.height };
    }
  if (axis === "x") {
    if (anchor === "left") return { x: component.box.x, y: component.box.y + component.box.height };
    return { x: component.box.x + component.box.width, y: component.box.y + component.box.height };
  }
  if (anchor === "top") return { x: component.box.x + component.box.width, y: component.box.y };
  return { x: component.box.x + component.box.width, y: component.box.y + component.box.height };
}

function getOuterSizeAnchorPoint(
  component: ComponentNode,
  anchor: "left" | "right" | "top" | "bottom",
  axis: AxisKind,
): { x: number; y: number } {
  if (component.shape === "ellipse") {
    if (axis === "x") {
      return anchor === "left"
        ? { x: component.box.x, y: component.box.y + component.box.height }
        : { x: component.box.x + component.box.width, y: component.box.y + component.box.height };
    }

    return anchor === "top"
      ? { x: component.box.x + component.box.width, y: component.box.y }
      : { x: component.box.x + component.box.width, y: component.box.y + component.box.height };
  }

  return getSizeAnchorPoint(component, anchor, axis);
}

function estimateLabelWidth(text: string): number {
  return Math.max(24, text.length * 6);
}

function getHandleControlKey(componentId: string, handle: ControlHandle): string {
  return `handle:${componentId}:${handle}`;
}

function getConstraintControlKey(constraintId: string): string {
  return `constraint:${constraintId}`;
}

function getRetargetControlKey(constraintId: string): string {
  return `retarget:${constraintId}`;
}

function getDraggingControlKey(): string | null {
  if (!dragging) return null;
  if (dragging.mode === "move") return getHandleControlKey(dragging.id, "move");
  if (dragging.mode === "resize") return getHandleControlKey(dragging.id, dragging.handle);
  if (dragging.mode === "retarget") return getRetargetControlKey(dragging.constraintId);
  return getConstraintControlKey(dragging.constraintId);
}

function getActiveControlKey(): string | null {
  return getDraggingControlKey() ?? hoveredControlKey;
}

function getPreviewComponentId(): string | null {
  if (dragging?.mode === "move" || dragging?.mode === "resize") {
    return dragging.id;
  }
  if (dragging?.mode === "constraint" || dragging?.mode === "retarget") {
    return null;
  }
  return hoveredComponentId;
}

function getPreviewHandleForRender(): ControlHandle | null {
  if (dragging?.mode === "move") return "move";
  if (dragging?.mode === "resize") return dragging.handle;
  return hoveredPreviewHandle;
}

function shouldHideOtherControls(controlKey: string): boolean {
  const activeKey = getActiveControlKey();
  return activeKey !== null && activeKey !== controlKey;
}

function isControlActive(controlKey: string): boolean {
  return getActiveControlKey() === controlKey;
}

function getRetargetState(constraintId: string): Extract<DragState, { mode: "retarget" }> | null {
  return dragging?.mode === "retarget" && dragging.constraintId === constraintId ? dragging : null;
}

function getControlAvailability(componentId: string): ControlAvailability {
  const component = store.spec.components[componentId];
  const constraints = store.spec.constraints.filter((constraint) => constraint.componentId === componentId);
  if (!component || component.id === "root") {
    return {
      canMoveX: false,
      canMoveY: false,
      canResizeLeft: false,
      canResizeRight: false,
      canResizeTop: false,
      canResizeBottom: false,
      canResizeNW: false,
      canResizeNE: false,
      canResizeSW: false,
      canResizeSE: false,
      widthFixed: true,
      heightFixed: true,
    };
  }

  const canMoveX = canApplyLockedOperation(component, constraints, createMoveXOperation());
  const canMoveY = canApplyLockedOperation(component, constraints, createMoveYOperation());
  const canResizeLeft = canApplyLockedOperation(component, constraints, createHorizontalResizeOperation("left"));
  const canResizeRight = canApplyLockedOperation(component, constraints, createHorizontalResizeOperation("right"));
  const canResizeTop = canApplyLockedOperation(component, constraints, createVerticalResizeOperation("top"));
  const canResizeBottom = canApplyLockedOperation(component, constraints, createVerticalResizeOperation("bottom"));
  const canResizeNW = canApplyLockedOperation(component, constraints, createCornerResizeOperation("nw"));
  const canResizeNE = canApplyLockedOperation(component, constraints, createCornerResizeOperation("ne"));
  const canResizeSW = canApplyLockedOperation(component, constraints, createCornerResizeOperation("sw"));
  const canResizeSE = canApplyLockedOperation(component, constraints, createCornerResizeOperation("se"));
  const widthFixed = !canResizeLeft && !canResizeRight;
  const heightFixed = !canResizeTop && !canResizeBottom;

  return {
    canMoveX,
    canMoveY,
    canResizeLeft,
    canResizeRight,
    canResizeTop,
    canResizeBottom,
    canResizeNW,
    canResizeNE,
    canResizeSW,
    canResizeSE,
    widthFixed,
    heightFixed,
  };
}

function createLinearTerm(a = 0, b = 0): LinearTerm {
  return { a, b };
}

function createMoveXOperation(): OperationDelta {
  return {
    dimensions: 1,
    dl: createLinearTerm(1),
    dr: createLinearTerm(1),
    dt: createLinearTerm(),
    db: createLinearTerm(),
  };
}

function createMoveYOperation(): OperationDelta {
  return {
    dimensions: 1,
    dl: createLinearTerm(),
    dr: createLinearTerm(),
    dt: createLinearTerm(1),
    db: createLinearTerm(1),
  };
}

function createHorizontalResizeOperation(side: "left" | "right"): OperationDelta {
  return {
    dimensions: 1,
    dl: side === "left" ? createLinearTerm(1) : createLinearTerm(),
    dr: side === "right" ? createLinearTerm(1) : createLinearTerm(),
    dt: createLinearTerm(),
    db: createLinearTerm(),
  };
}

function createVerticalResizeOperation(side: "top" | "bottom"): OperationDelta {
  return {
    dimensions: 1,
    dl: createLinearTerm(),
    dr: createLinearTerm(),
    dt: side === "top" ? createLinearTerm(1) : createLinearTerm(),
    db: side === "bottom" ? createLinearTerm(1) : createLinearTerm(),
  };
}

function createCornerResizeOperation(handle: "nw" | "ne" | "sw" | "se"): OperationDelta {
  return {
    dimensions: 2,
    dl: handle.includes("w") ? createLinearTerm(1, 0) : createLinearTerm(),
    dr: handle.includes("e") ? createLinearTerm(1, 0) : createLinearTerm(),
    dt: handle.includes("n") ? createLinearTerm(0, 1) : createLinearTerm(),
    db: handle.includes("s") ? createLinearTerm(0, 1) : createLinearTerm(),
  };
}

function canApplyLockedOperation(
  component: ComponentNode,
  constraints: ConstraintSpec[],
  operation: OperationDelta,
): boolean {
  const rows = constraints
    .filter((constraint) => constraint.locked)
    .map((constraint) => getLockedConstraintEquation(constraint, component, operation))
    .filter((row): row is [number, number] => row !== null);
  return getEquationRank(rows) < operation.dimensions;
}

function getLockedConstraintEquation(
  constraint: ConstraintSpec,
  component: ComponentNode,
  operation: OperationDelta,
): [number, number] | null {
  const { dl, dr, dt, db } = operation;
  if (constraint.kind === "left") return [dl.a, dl.b];
  if (constraint.kind === "right") return [dr.a, dr.b];
  if (constraint.kind === "centerX") return [dl.a + dr.a, dl.b + dr.b];
  if (constraint.kind === "width") return [dr.a - dl.a, dr.b - dl.b];
  if (constraint.kind === "top") return [dt.a, dt.b];
  if (constraint.kind === "bottom") return [db.a, db.b];
  if (constraint.kind === "centerY") return [dt.a + db.a, dt.b + db.b];
  if (constraint.kind === "height") return [db.a - dt.a, db.b - dt.b];
  if (constraint.kind === "ratio") {
    const width = Math.max(1, component.box.width);
    const height = Math.max(1, component.box.height);
    return [
      height * (dr.a - dl.a) - width * (db.a - dt.a),
      height * (dr.b - dl.b) - width * (db.b - dt.b),
    ];
  }
  return null;
}

function getEquationRank(rows: Array<[number, number]>): 0 | 1 | 2 {
  let basis: [number, number] | null = null;
  for (const [x, y] of rows) {
    if (x === 0 && y === 0) continue;
    if (!basis) {
      basis = [x, y];
      continue;
    }
    if (basis[0] * y !== basis[1] * x) {
      return 2;
    }
  }
  return basis ? 1 : 0;
}

function getConstraintControlSpecs(
  constraint: ConstraintSpec,
  axis: AxisKind,
  start: Vec2,
  end: Vec2,
  dir: Vec2,
  targetTip: Vec2,
): Array<{ tip: Vec2; direction: Vec2; valueScale: number }> {
  const availability = getControlAvailability(constraint.componentId);
  if (constraint.kind === "width") {
    const pairedKinds = store.spec.constraints
      .filter(
        (item) => item.componentId === constraint.componentId && item.axis === axis && item.kind !== "width" && item.id !== constraint.id,
      )
      .map((item) => item.kind);
    const keepsXFixed = pairedKinds.includes("left");
    return keepsXFixed && availability.canResizeRight ? [{ tip: end, direction: scale(dir, -1), valueScale: 1 }] : [];
  }

  if (constraint.kind === "height") {
    const pairedKinds = store.spec.constraints
      .filter(
        (item) => item.componentId === constraint.componentId && item.axis === axis && item.kind !== "height" && item.id !== constraint.id,
      )
      .map((item) => item.kind);
    const keepsYFixed = pairedKinds.includes("top");
    return keepsYFixed && availability.canResizeBottom ? [{ tip: start, direction: dir, valueScale: 1 }] : [];
  }

  if (constraint.kind === "left" && !availability.canResizeLeft) return [];
  if (constraint.kind === "right" && !availability.canResizeRight) return [];
  if (constraint.kind === "centerX" && !availability.canMoveX) return [];
  if (constraint.kind === "top" && !availability.canResizeTop) return [];
  if (constraint.kind === "bottom" && !availability.canResizeBottom) return [];
  if (constraint.kind === "centerY" && !availability.canMoveY) return [];
  if (constraint.kind === "ratio" && !availability.canResizeNE) return [];

  const direction = targetTip === end ? scale(dir, -1) : dir;
  return [{ tip: targetTip, direction, valueScale: 1 }];
}

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

function subtract(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

function scale(vector: Vec2, amount: number): Vec2 {
  return { x: vector.x * amount, y: vector.y * amount };
}

function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

function length(vector: Vec2): number {
  return Math.hypot(vector.x, vector.y);
}

function normalize(vector: Vec2): Vec2 {
  const magnitude = length(vector) || 1;
  return { x: vector.x / magnitude, y: vector.y / magnitude };
}

function canonicalizeAnnotationDirection(vector: Vec2): Vec2 {
  const normalized = normalize(vector);
  if (normalized.x < -1e-6) return scale(normalized, -1);
  if (Math.abs(normalized.x) <= 1e-6 && normalized.y < 0) return scale(normalized, -1);
  return normalized;
}

function shouldSwapAnnotationEndpoints(start: Vec2, end: Vec2): boolean {
  if (start.x > end.x + 1e-6) return true;
  if (Math.abs(start.x - end.x) <= 1e-6 && start.y < end.y - 1e-6) return true;
  return false;
}

function rotateCcw(vector: Vec2): Vec2 {
  return { x: vector.y, y: -vector.x };
}

function midpoint(a: Vec2, b: Vec2): Vec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function reserveHorizontalBand(
  bands: Array<{ y: number; start: number; end: number }>,
  proposedY: number,
  x1: number,
  x2: number,
): number {
  const start = Math.min(x1, x2);
  const end = Math.max(x1, x2);
  const step = 16 + ANNOTATION_LINE_GAP;
  const minY = ANNOTATION_VIEWPORT_MARGIN;
  const maxY = store.spec.viewport.height - ANNOTATION_VIEWPORT_MARGIN;
  const clampedBase = clamp(proposedY, minY, maxY);
  const primaryDirection = proposedY < minY ? 1 : proposedY > maxY ? -1 : proposedY < store.spec.viewport.height / 2 ? -1 : 1;

  const canPlace = (y: number) =>
    !bands.some(
      (band) =>
        Math.abs(band.y - y) < 14 + ANNOTATION_LINE_GAP &&
        !(end < band.start - ANNOTATION_LINE_GAP || start > band.end + ANNOTATION_LINE_GAP),
    );

  let y = clampedBase;
  if (!canPlace(y)) {
    const maxSteps = Math.max(1, Math.ceil(store.spec.viewport.height / step));
    for (let distance = 1; distance <= maxSteps; distance += 1) {
      const candidates = [
        clampedBase + primaryDirection * distance * step,
        clampedBase - primaryDirection * distance * step,
      ].filter((candidate, index, all) => candidate >= minY && candidate <= maxY && all.indexOf(candidate) === index);
      const match = candidates.find(canPlace);
      if (match !== undefined) {
        y = match;
        break;
      }
    }
  }
  y = clamp(y, minY, maxY);
  bands.push({ y, start, end });
  return y;
}

function reserveVerticalBand(
  bands: Array<{ x: number; start: number; end: number }>,
  proposedX: number,
  y1: number,
  y2: number,
): number {
  const start = Math.min(y1, y2);
  const end = Math.max(y1, y2);
  const step = 16 + ANNOTATION_LINE_GAP;
  const minX = ANNOTATION_VIEWPORT_MARGIN;
  const maxX = store.spec.viewport.width - ANNOTATION_VIEWPORT_MARGIN;
  const clampedBase = clamp(proposedX, minX, maxX);
  const primaryDirection = proposedX < minX ? 1 : proposedX > maxX ? -1 : proposedX < store.spec.viewport.width / 2 ? -1 : 1;

  const canPlace = (x: number) =>
    !bands.some(
      (band) =>
        Math.abs(band.x - x) < 14 + ANNOTATION_LINE_GAP &&
        !(end < band.start - ANNOTATION_LINE_GAP || start > band.end + ANNOTATION_LINE_GAP),
    );

  let x = clampedBase;
  if (!canPlace(x)) {
    const maxSteps = Math.max(1, Math.ceil(store.spec.viewport.width / step));
    for (let distance = 1; distance <= maxSteps; distance += 1) {
      const candidates = [
        clampedBase + primaryDirection * distance * step,
        clampedBase - primaryDirection * distance * step,
      ].filter((candidate, index, all) => candidate >= minX && candidate <= maxX && all.indexOf(candidate) === index);
      const match = candidates.find(canPlace);
      if (match !== undefined) {
        x = match;
        break;
      }
    }
  }
  x = clamp(x, minX, maxX);
  bands.push({ x, start, end });
  return x;
}

function formatConstraintLabel(constraint: ConstraintSpec): string {
  if (constraint.unit === "percent") {
    return `${Math.abs(constraint.value)}%`;
  }
  return `${Math.abs(constraint.value)}px`;
}

function formatRatioDisplayLabel(
  ratioConstraint: ConstraintSpec | undefined,
  width: number,
  height: number,
): string {
  return formatRatioFromNumber(ratioConstraint?.kind === "ratio" ? ratioConstraint.value : width / Math.max(1, height));
}

function formatRatioFromNumber(ratio: number): string {
  const absolute = Math.abs(ratio || 1);
  if (absolute >= 1000) return "1:0";
  if (absolute <= 0.001) return "0:1";

  const reduced = approximateRatioParts(absolute, 5);
  const smaller = Math.min(reduced.w, reduced.h);

  if (smaller <= 20) {
    return `${reduced.w}:${reduced.h}`;
  }

  if (absolute >= 1) return `${trimRatio(absolute)}:1`;
  return `1:${trimRatio(1 / absolute)}`;
}

function approximateRatioParts(value: number, maxDepth: number): { w: number; h: number } {
  if (!Number.isFinite(value) || value <= 0) return { w: 1, h: 1 };

  let x = value;
  let hPrev = 0;
  let hCurr = 1;
  let kPrev = 1;
  let kCurr = 0;

  for (let depth = 0; depth < maxDepth; depth += 1) {
    const a = Math.floor(x);
    const hNext = a * hCurr + hPrev;
    const kNext = a * kCurr + kPrev;

    hPrev = hCurr;
    hCurr = hNext;
    kPrev = kCurr;
    kCurr = kNext;

    const fraction = x - a;
    if (fraction <= 1e-9) break;
    x = 1 / fraction;
  }

  return {
    w: Math.max(1, Math.round(hCurr)),
    h: Math.max(1, Math.round(kCurr)),
  };
}

function getRatioNearHint(constraint?: ConstraintSpec): string | null {
  if (!constraint || constraint.kind !== "ratio") return null;

  const raw = constraint.ratioParts ?? formatRatioParts(constraint.value);
  const rawW = Math.max(0, Math.round(Math.abs(raw.w)));
  const rawH = Math.max(0, Math.round(Math.abs(raw.h)));
  if (rawW === 0 || rawH === 0) return null;

  const best = approximateRatioParts(Math.abs(constraint.value || 1), 5);
  if (best.w <= 0 || best.h <= 0) return null;
  if (Math.min(best.w, best.h) > 20) return null;

  const scaleW = rawW / best.w;
  const scaleH = rawH / best.h;
  const nearestScale = Math.max(1, Math.round((scaleW + scaleH) / 2));
  const nearW = best.w * nearestScale;
  const nearH = best.h * nearestScale;

  if (nearW === rawW && nearH === rawH) return null;
  return `${nearW}/${nearH}`;
}

function trimRatio(value: number): string {
  return value.toFixed(3).replace(/\.?0+$/, "");
}

function formatRatioParts(ratio: number): { w: number; h: number } {
  const absolute = Math.abs(ratio || 1);
  if (absolute >= 1000) return { w: 1, h: 0 };
  if (absolute <= 0.001) return { w: 0, h: 1 };

  const scaledW = Math.max(1, Math.round(absolute * 1000));
  const scaledH = 1000;
  const divisor = gcd(scaledW, scaledH);
  return { w: scaledW / divisor, h: scaledH / divisor };
}

function parseRatioParts(wInput: string, hInput: string): number {
  const left = Number(wInput);
  const right = Number(hInput);
  if (!Number.isFinite(left) || !Number.isFinite(right) || left < 0 || right < 0) {
    return 1;
  }
  if (right === 0) return 1000;
  if (left === 0) return 0.001;
  return left / right;
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

function renderComponentList(): void {
  const analysis = analyzeProjectDof(store.spec);
  componentList.innerHTML = "";

  for (const component of store.components) {
    const report = analysis.components.find((item) => item.componentId === component.id);
    if (!report) continue;

    const row = document.createElement("div");
    row.className = [
      "component-row",
      component.id === store.selectedId ? "is-selected" : "",
      report.status === "under" ? "is-under" : "",
    ]
      .filter(Boolean)
      .join(" ");
    row.innerHTML = `
      <button class="component-row-main" type="button" data-preserve-selection="true">
        <strong>${component.name}</strong>
        <span class="row-meta">${getShapeLabel(component.shape)}</span>
      </button>
      <button class="component-delete-button" type="button" aria-label="Delete ${escapeAttribute(component.name)}">×</button>
    `;
    row.querySelector<HTMLButtonElement>(".component-row-main")?.addEventListener("click", () => {
      store.select(component.id);
      render();
    });
    row.querySelector<HTMLButtonElement>(".component-delete-button")?.addEventListener("click", (event) => {
      event.stopPropagation();
      store.deleteComponent(component.id);
      render();
    });
    componentList.appendChild(row);
  }
}

function renderSelectedPane(): void {
  const selected = store.selectedId ? store.spec.components[store.selectedId] : null;
  if (!selected) {
    selectedPane.textContent = "No component selected";
    return;
  }

  const analysis = analyzeProjectDof(store.spec);
  const report = analysis.components.find((item) => item.componentId === selected.id);
  const xStatus = report?.axes.find((axis) => axis.axis === "x");
  const yStatus = report?.axes.find((axis) => axis.axis === "y");

  selectedPane.innerHTML = `
    <div class="selected-head">
      <div>
        <strong>${selected.name}</strong>
        <p class="row-meta">${getShapeLabel(selected.shape)}</p>
      </div>
      <span class="status-chip is-${report?.status ?? "under"}">${formatStatus(report?.status ?? "under")}</span>
    </div>
    <div class="field-grid">
      <label class="field">
        <span>Name</span>
        <input id="selected-name" type="text" value="${escapeAttribute(selected.name)}" />
      </label>
      <label class="field">
        <span>Shape</span>
        <select id="selected-shape">
          <option value="rect" ${selected.shape === "rect" ? "selected" : ""}>Rectangle</option>
          <option value="ellipse" ${selected.shape === "ellipse" ? "selected" : ""}>Ellipse</option>
        </select>
      </label>
    </div>
    <div class="axis-summary">
      <div class="axis-pill is-${xStatus?.status ?? "under"}">x: ${xStatus?.usedKinds.length ?? 0}/2</div>
      <div class="axis-pill is-${yStatus?.status ?? "under"}">y: ${yStatus?.usedKinds.length ?? 0}/2</div>
    </div>
    <div class="constraint-editor">
      ${renderAxisEditor(selected.id, "x")}
      ${renderAxisEditor(selected.id, "y")}
    </div>
  `;

bindSelectedInputs();
  bindConstraintEditors(selected.id);
}

function renderAxisEditor(componentId: string, axis: AxisKind): string {
  const current = store.spec.constraints.filter((constraint) => constraint.componentId === componentId && constraint.axis === axis);
  const currentKinds = new Set(current.map((constraint) => constraint.kind));
  const dimensionalKinds = new Set(
    store.spec.constraints
      .filter((constraint) => constraint.componentId === componentId && isDimensionalKind(constraint.kind))
      .map((constraint) => constraint.kind),
  );
  const available = getAvailableKinds(axis);
  const oppositeAxis = axis === "x" ? "y" : "x";
  const ratioUsedOnOtherAxis = store.spec.constraints.some(
    (constraint) => constraint.componentId === componentId && constraint.axis === oppositeAxis && constraint.kind === "ratio",
  );
  const title = axis === "x" ? "Horizontal constraints" : "Vertical constraints";
  const helper = axis === "x"
    ? "Need exactly 2: left / right / width / ratio / centerX"
    : "Need exactly 2: top / bottom / height / ratio / centerY";
  const axisFull = currentKinds.size >= 2;

  return `
    <section class="axis-editor">
      <div class="axis-editor-head">
        <strong>${title}</strong>
        <span>${currentKinds.size}/2 active</span>
      </div>
      <p class="hint">${helper}</p>
      <div class="method-list">
        ${available
          .map((kind) =>
            renderConstraintMethod(
              componentId,
              axis,
              kind,
              current.find((constraint) => constraint.kind === kind),
              kind === "ratio" && ratioUsedOnOtherAxis,
              axisFull,
              dimensionalKinds,
            ),
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderConstraintMethod(
  componentId: string,
  axis: AxisKind,
  kind: ConstraintKind,
  constraint?: ConstraintSpec,
  ratioLocked = false,
  axisFull = false,
  dimensionalKinds: Set<ConstraintKind> = new Set(),
): string {
  const enabled = Boolean(constraint);
  const isRatio = kind === "ratio";
  const methodKey = getMethodKey(componentId, axis, kind);
  const expanded = enabled && expandedMethodKey === methodKey;
  const dimensionalFull = isDimensionalKind(kind) && !enabled && dimensionalKinds.size >= 2;
  const disabled = !enabled && (ratioLocked || axisFull || dimensionalFull);
  const locked = constraint?.locked ?? store.getConstraintDraft(componentId, axis, kind)?.locked ?? false;
  const sourceValue = constraint?.sourceComponentId ?? "viewport";
  const anchorOptions = getAnchorOptions(axis, kind, sourceValue === "viewport")
    .map((anchor) => `<option value="${anchor}" ${constraint?.sourceAnchor === anchor ? "selected" : ""}>${formatAnchor(anchor)}</option>`)
    .join("");
  const isSizeOnly = kind === "width" || kind === "height";
  const ratioNearHint = isRatio ? getRatioNearHint(constraint) : null;
  const fields = isRatio
      ? `
          <div class="method-fields" ${expanded ? "" : "hidden"}>
            <div class="field-grid ratio-only-grid">
            <label class="field">
              <span>w</span>
              <input
                data-role="ratio-w"
                data-component="${componentId}"
                data-axis="${axis}"
                data-kind="${kind}"
                type="number"
                min="0"
                step="1"
                value="${(constraint?.ratioParts ?? formatRatioParts(constraint?.value ?? 1)).w}"
              />
            </label>
            <label class="field">
              <span>h</span>
              <input
                data-role="ratio-h"
                data-component="${componentId}"
                data-axis="${axis}"
                data-kind="${kind}"
                type="number"
                min="0"
                step="1"
                value="${(constraint?.ratioParts ?? formatRatioParts(constraint?.value ?? 1)).h}"
              />
            </label>
            </div>
          </div>
        `
      : isSizeOnly
        ? `
          <div class="method-fields" ${expanded ? "" : "hidden"}>
            <div class="field-grid">
              <label class="field">
                <span>Value</span>
                <input
                  data-role="value"
                  data-component="${componentId}"
                  data-axis="${axis}"
                  data-kind="${kind}"
                  type="number"
                  step="1"
                  value="${constraint?.value ?? 0}"
                />
              </label>
              <label class="field">
                <span>Unit</span>
                <select data-role="unit" data-component="${componentId}" data-axis="${axis}" data-kind="${kind}">
                  <option value="px" ${constraint?.unit === "px" ? "selected" : ""}>px</option>
                  <option value="percent" ${constraint?.unit === "percent" ? "selected" : ""}>%</option>
                </select>
              </label>
            </div>
          </div>
        `
      : `
          <div class="method-fields" ${expanded ? "" : "hidden"}>
          <div class="field-grid">
            <label class="field">
              <span>Target</span>
              <select data-role="source" data-component="${componentId}" data-axis="${axis}" data-kind="${kind}">
                ${buildSourceOptions(componentId, sourceValue)}
              </select>
            </label>
            <label class="field">
              <span>Reference</span>
              <select data-role="anchor" data-component="${componentId}" data-axis="${axis}" data-kind="${kind}">
                ${anchorOptions}
              </select>
            </label>
          </div>
          <div class="field-grid">
            <label class="field">
              <span>Value</span>
              <input
                data-role="value"
                data-component="${componentId}"
                data-axis="${axis}"
                data-kind="${kind}"
                type="number"
                step="1"
                value="${constraint?.value ?? 0}"
              />
            </label>
            <label class="field">
              <span>Unit</span>
              <select data-role="unit" data-component="${componentId}" data-axis="${axis}" data-kind="${kind}">
                <option value="px" ${constraint?.unit === "px" ? "selected" : ""}>px</option>
                <option value="percent" ${constraint?.unit === "percent" ? "selected" : ""}>%</option>
              </select>
            </label>
          </div>
        </div>
      `;

  return `
    <div class="method-card ${enabled ? "is-enabled" : ""} ${expanded ? "is-expanded" : ""}" data-method-card="${methodKey}">
      <div class="method-head-row">
        <label class="method-toggle" data-method-head="${methodKey}">
          <input
            type="checkbox"
            data-role="toggle"
            data-component="${componentId}"
            data-axis="${axis}"
            data-kind="${kind}"
            ${enabled ? "checked" : ""}
            ${disabled ? "disabled" : ""}
          />
          <span>${kind}</span>
        </label>
        ${ratioNearHint ? `<span class="ratio-near">near: ${ratioNearHint}</span>` : ""}
        ${enabled ? `
          <label class="method-lock">
          <input
            type="checkbox"
            data-role="lock"
            data-component="${componentId}"
            data-axis="${axis}"
            data-kind="${kind}"
            ${locked ? "checked" : ""}
          />
          <span>Lock</span>
        </label>
        ` : ""}
      </div>
      ${enabled ? fields : ""}
    </div>
  `;
}

function buildSourceOptions(componentId: string, selectedValue: string): string {
  return [`<option value="viewport" ${selectedValue === "viewport" ? "selected" : ""}>Viewport</option>`]
    .concat(
      store.components
        .filter((component) => component.id !== componentId)
        .map((component) => `<option value="${component.id}" ${selectedValue === component.id ? "selected" : ""}>${component.name}</option>`),
    )
    .join("");
}

function getAnchorOptions(axis: AxisKind, kind: ConstraintKind, isViewport: boolean): SourceAnchor[] {
  if (kind === "ratio") return ["ratio"];
  if (isViewport) return axis === "x" ? ["left", "right", "centerX"] : ["top", "bottom", "centerY"];
  return axis === "x" ? ["left", "right", "centerX"] : ["top", "bottom", "centerY"];
}

function bindSelectedInputs(): void {
  queryWithin<HTMLInputElement>(selectedPane, "#selected-name").addEventListener("input", (event) => {
    store.updateSelectedName((event.target as HTMLInputElement).value.trim());
    renderComponentList();
    syncExportState();
  });

  queryWithin<HTMLSelectElement>(selectedPane, "#selected-shape").addEventListener("change", (event) => {
    store.updateSelectedShape((event.target as HTMLSelectElement).value as ComponentNode["shape"]);
    renderCanvas();
    renderComponentList();
    syncExportState();
  });

}

function bindConstraintEditors(componentId: string): void {
  for (const head of selectedPane.querySelectorAll<HTMLElement>("[data-method-head]")) {
    head.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target instanceof HTMLInputElement) return;
      const key = head.dataset.methodHead ?? null;
      if (!key) return;
      expandedMethodKey = expandedMethodKey === key ? null : key;
      render();
    });
  }

  for (const checkbox of selectedPane.querySelectorAll<HTMLInputElement>('input[data-role="toggle"]')) {
    checkbox.addEventListener("change", () => {
      const axis = checkbox.dataset.axis as AxisKind;
      const kind = checkbox.dataset.kind as ConstraintKind;
      const methodKey = getMethodKey(componentId, axis, kind);
      if (checkbox.checked) {
        store.activateConstraint(componentId, axis, kind);
        expandedMethodKey = methodKey;
      } else {
        store.removeConstraintByKind(componentId, axis, kind);
        if (expandedMethodKey === methodKey) {
          expandedMethodKey = null;
        }
      }
      render();
    });
  }

  for (const checkbox of selectedPane.querySelectorAll<HTMLInputElement>('input[data-role="lock"]')) {
    checkbox.addEventListener("change", () => {
      const axis = checkbox.dataset.axis as AxisKind;
      const kind = checkbox.dataset.kind as ConstraintKind;
      store.updateConstraintLock(componentId, axis, kind, checkbox.checked);
      render();
    });
  }

  for (const field of selectedPane.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-role]")) {
    const role = field.dataset.role;
    if (!role || role === "toggle" || role === "lock") continue;
    field.addEventListener("input", () => updateConstraintFromRow(componentId, field));
    field.addEventListener("change", () => updateConstraintFromRow(componentId, field));
  }
}

function updateConstraintFromRow(componentId: string, element: HTMLInputElement | HTMLSelectElement): void {
  const axis = element.dataset.axis as AxisKind;
  const kind = element.dataset.kind as ConstraintKind;
  expandedMethodKey = getMethodKey(componentId, axis, kind);
  const source = selectedPane.querySelector<HTMLSelectElement>(`[data-role="source"][data-axis="${axis}"][data-kind="${kind}"]`);
  const anchor = selectedPane.querySelector<HTMLSelectElement>(`[data-role="anchor"][data-axis="${axis}"][data-kind="${kind}"]`);
  const unit = selectedPane.querySelector<HTMLSelectElement>(`[data-role="unit"][data-axis="${axis}"][data-kind="${kind}"]`);
  const value = selectedPane.querySelector<HTMLInputElement>(`[data-role="value"][data-axis="${axis}"][data-kind="${kind}"]`);
  const ratioW = selectedPane.querySelector<HTMLInputElement>(`[data-role="ratio-w"][data-axis="${axis}"][data-kind="${kind}"]`);
  const ratioH = selectedPane.querySelector<HTMLInputElement>(`[data-role="ratio-h"][data-axis="${axis}"][data-kind="${kind}"]`);
  const sourceComponentId = kind === "ratio" ? componentId : source && source.value !== "viewport" ? source.value : null;
  const sourceAnchor = kind === "ratio" ? "ratio" : ((anchor?.value ?? getDefaultAnchor(axis, kind)) as SourceAnchor);
  const resolvedUnit = kind === "ratio" ? "ratio" : ((unit?.value ?? "px") as UnitKind);
  let resolvedValue =
    kind === "ratio"
      ? parseRatioParts(ratioW?.value ?? "1", ratioH?.value ?? "1")
      : Number(value?.value ?? 0);
  const ratioParts =
    kind === "ratio"
      ? {
          w: Math.max(0, Number(ratioW?.value ?? "1")) || 0,
          h: Math.max(0, Number(ratioH?.value ?? "1")) || 0,
        }
      : undefined;
  const locked = selectedPane.querySelector<HTMLInputElement>(`[data-role="lock"][data-axis="${axis}"][data-kind="${kind}"]`)?.checked ?? false;

  if (kind !== "ratio" && (element.dataset.role === "source" || element.dataset.role === "anchor" || element.dataset.role === "unit")) {
    const measured = store.measureDraftConstraint({
      componentId,
      axis,
      kind,
      sourceComponentId,
      sourceAnchor,
      unit: resolvedUnit,
      });
      if (measured !== null && Number.isFinite(measured)) {
        if (value) {
          value.value = String(measured);
        }
        resolvedValue = measured;
      }
    }

  store.upsertConstraint({
    componentId,
    axis,
    kind,
    sourceComponentId,
    sourceAnchor,
    value: resolvedValue,
    unit: resolvedUnit,
    locked,
    ratioParts,
  });

  renderCanvas();
  renderComponentList();
  syncExportState();
}

function commitRetargetConstraint(constraintId: string, candidate: RetargetCandidate | null): void {
  if (!candidate) return;
  const constraint = store.spec.constraints.find((item) => item.id === constraintId);
  if (!constraint) return;
  const measured = store.measureDraftConstraint({
    componentId: constraint.componentId,
    axis: constraint.axis,
    kind: constraint.kind,
    sourceComponentId: candidate.sourceComponentId,
    sourceAnchor: candidate.sourceAnchor,
    unit: constraint.unit,
  });
  store.upsertConstraint({
    componentId: constraint.componentId,
    axis: constraint.axis,
    kind: constraint.kind,
    sourceComponentId: candidate.sourceComponentId,
    sourceAnchor: candidate.sourceAnchor,
    value: measured !== null && Number.isFinite(measured) ? measured : constraint.value,
    unit: constraint.unit,
    locked: constraint.locked,
  });
}

function getDefaultAnchor(axis: AxisKind, kind: ConstraintKind): SourceAnchor {
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

function isDimensionalKind(kind: ConstraintKind): kind is "width" | "height" | "ratio" {
  return kind === "width" || kind === "height" || kind === "ratio";
}

function formatAnchor(anchor: SourceAnchor): string {
  if (anchor === "ratio") return "self other axis";
  return anchor;
}

function getMethodKey(componentId: string, axis: AxisKind, kind: ConstraintKind): string {
  return `${componentId}:${axis}:${kind}`;
}

addComponentButton.addEventListener("click", () => {
  store.addComponent("rect");
  render();
});

viewportWidthInput.addEventListener("input", () => {
  store.resizeViewport(Number(viewportWidthInput.value), store.spec.viewport.height);
  render();
});

viewportHeightInput.addEventListener("input", () => {
  store.resizeViewport(store.spec.viewport.width, Number(viewportHeightInput.value));
  render();
});

canvas.addEventListener("pointermove", (event) => {
  if (!dragging) {
    const target = event.target as Element | null;
    const nextHover = target?.closest<HTMLElement>("[data-control-key]")?.dataset.controlKey ?? null;
    const nextHoveredComponent = nextHover
      ? null
      : target?.closest<HTMLElement>("[data-component-id]")?.dataset.componentId ?? null;
    const nextPreviewHandle =
      nextHoveredComponent
        ? getPreviewHandleForPoint(store.spec.components[nextHoveredComponent], getCanvasPoint(event))
        : null;
    syncCanvasCursor(nextPreviewHandle, nextHover);
    if (
      hoveredControlKey !== nextHover ||
      hoveredComponentId !== nextHoveredComponent ||
      hoveredPreviewHandle !== nextPreviewHandle
    ) {
      hoveredControlKey = nextHover;
      hoveredComponentId = nextHoveredComponent;
      hoveredPreviewHandle = nextPreviewHandle;
      render();
    }
    return;
  }
  const activeDrag = dragging;
  if (activeDrag.mode === "retarget") {
    const constraint = store.spec.constraints.find((item) => item.id === activeDrag.constraintId);
    if (constraint) {
      activeDrag.candidate = findNearestRetargetCandidate(constraint, getCanvasPoint(event));
    }
    render();
    return;
  }
  const { dx, dy } = getCanvasDelta(
    activeDrag.startClientX,
    activeDrag.startClientY,
    event.clientX,
    event.clientY,
  );

  if (activeDrag.mode === "move") {
    store.setComponentBox(activeDrag.id, {
      x: activeDrag.startBox.x + dx,
      y: activeDrag.startBox.y + dy,
      width: activeDrag.startBox.width,
      height: activeDrag.startBox.height,
    });
  } else if (activeDrag.mode === "resize") {
    store.setComponentBox(activeDrag.id, getResizedBox(activeDrag.startBox, activeDrag.handle, dx, dy));
  } else {
    const delta = (activeDrag.axis === "x" ? dx : dy) * activeDrag.valueScale;
    store.adjustConstraintValue(activeDrag.constraintId, delta, activeDrag.startValue);
  }
  render();
});

canvas.addEventListener("pointerdown", (event) => {
  if (dragging?.mode === "retarget") {
    commitRetargetConstraint(dragging.constraintId, dragging.candidate);
    dragging = null;
    hoveredControlKey = null;
    hoveredComponentId = null;
    hoveredPreviewHandle = null;
    syncCanvasCursor(null, null);
    render();
    return;
  }
  const target = event.target as Element | null;
  if (target?.closest("[data-preserve-selection='true']")) return;
  if (store.selectedId === null && expandedMethodKey === null) return;
  dragging = null;
  hoveredControlKey = null;
  hoveredComponentId = null;
  hoveredPreviewHandle = null;
  syncCanvasCursor(null, null);
  store.clearSelection();
  expandedMethodKey = null;
  render();
});

sidebar.addEventListener("pointerdown", (event) => {
  const target = event.target as Element | null;
  if (!target) return;
  if (target.closest(".component-row-main")) return;
  if (store.selectedId === null && expandedMethodKey === null) return;
  dragging = null;
  hoveredControlKey = null;
  hoveredComponentId = null;
  hoveredPreviewHandle = null;
  syncCanvasCursor(null, null);
  store.clearSelection();
  expandedMethodKey = null;
  render();
});

canvas.addEventListener("pointerup", (event) => {
  if (dragging && (dragging.mode === "retarget" || dragging.pointerId === event.pointerId)) {
    if (dragging.mode === "retarget") {
      commitRetargetConstraint(dragging.constraintId, dragging.candidate);
    }
    dragging = null;
    hoveredControlKey = null;
    hoveredComponentId = null;
    hoveredPreviewHandle = null;
    syncCanvasCursor(null, null);
    render();
  }
});

canvas.addEventListener("pointerleave", (event) => {
  if (dragging && dragging.pointerId === event.pointerId) {
    dragging = null;
    hoveredControlKey = null;
    hoveredComponentId = null;
    hoveredPreviewHandle = null;
    syncCanvasCursor(null, null);
    render();
    return;
  }
  if (hoveredControlKey !== null || hoveredComponentId !== null || hoveredPreviewHandle !== null) {
    hoveredControlKey = null;
    hoveredComponentId = null;
    hoveredPreviewHandle = null;
    syncCanvasCursor(null, null);
    render();
  }
});

openExportModalButton.addEventListener("click", () => {
  exportModal.hidden = false;
  syncExportModal();
});

openImportModalButton.addEventListener("click", () => {
  importModal.hidden = false;
  clearImportFeedback();
});

closeExportModalButton.addEventListener("click", () => {
  exportModal.hidden = true;
});

closeImportModalButton.addEventListener("click", () => {
  importModal.hidden = true;
});

for (const closeTarget of document.querySelectorAll<HTMLElement>("[data-close-export-modal='true']")) {
  closeTarget.addEventListener("click", () => {
    exportModal.hidden = true;
  });
}

for (const closeTarget of document.querySelectorAll<HTMLElement>("[data-close-import-modal='true']")) {
  closeTarget.addEventListener("click", () => {
    importModal.hidden = true;
  });
}

exportFormatJson.addEventListener("change", syncExportModal);
exportFormatPng.addEventListener("change", syncExportModal);

importFileInput.addEventListener("change", async () => {
  clearImportFeedback();
  const file = importFileInput.files?.[0];
  if (!file) return;
  try {
    importInput.value = await file.text();
  } catch {
    showImportError("Failed to read the selected file.");
  }
});

clearImportButton.addEventListener("click", () => {
  importInput.value = "";
  importFileInput.value = "";
  clearImportFeedback();
});

applyImportButton.addEventListener("click", () => {
  clearImportFeedback();
  const raw = importInput.value.trim();
  if (!raw) {
    showImportError("Paste JSON or choose a JSON file first.");
    return;
  }

  try {
    store.importJson(raw);
    expandedMethodKey = null;
    importModal.hidden = true;
    render();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed.";
    showImportError(message);
  }
});

copyExportButton.addEventListener("click", async () => {
  exportOutput.select();
  try {
    await navigator.clipboard.writeText(exportOutput.value);
  } catch {
    document.execCommand("copy");
  }
});

downloadJsonButton.addEventListener("click", () => {
  const blob = new Blob([exportOutput.value], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ui-spec-editor.json";
  link.click();
  URL.revokeObjectURL(url);
});

downloadPngButton.addEventListener("click", async () => {
  const blob = await exportCanvasToPng(canvas);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ui-spec-editor.png";
  link.click();
  URL.revokeObjectURL(url);
});

function query<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

function queryWithin<T extends Element>(root: Element, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

function createSvgElement<K extends keyof SVGElementTagNameMap>(tagName: K): SVGElementTagNameMap[K] {
  return document.createElementNS("http://www.w3.org/2000/svg", tagName);
}

function createViewportLabel(x: number, y: number, text: string, anchor: "start" | "middle" | "end"): SVGTextElement {
  const label = createSvgElement("text");
  label.setAttribute("x", String(x));
  label.setAttribute("y", String(y));
  label.setAttribute("text-anchor", anchor);
  label.setAttribute("class", "viewport-label");
  label.textContent = text;
  return label;
}

function formatStatus(status: "under" | "full" | "over"): string {
  if (status === "under") return "Missing";
  if (status === "over") return "Over";
  return "Ready";
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function syncExportModal(): void {
  exportOutput.readOnly = true;
  const jsonMode = exportFormatJson.checked;
  exportJsonPanel.hidden = !jsonMode;
  exportPngPanel.hidden = jsonMode;
}

function clearImportFeedback(): void {
  importError.hidden = true;
  importError.textContent = "";
}

function showImportError(message: string): void {
  importError.hidden = false;
  importError.textContent = message;
}

async function exportCanvasToPng(svg: SVGSVGElement): Promise<Blob> {
  const serializer = new XMLSerializer();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(svg.viewBox.baseVal.width));
  clone.setAttribute("height", String(svg.viewBox.baseVal.height));
  inlineSvgComputedStyles(svg, clone);
  clone.insertBefore(createEmbeddedSvgStyle(), clone.firstChild);
  const svgString = serializer.serializeToString(clone);
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  const image = new Image();
  image.decoding = "async";

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("PNG export failed"));
    image.src = url;
  });

  const rect = svg.viewBox.baseVal;
  const canvasEl = document.createElement("canvas");
  canvasEl.width = rect.width;
  canvasEl.height = rect.height;
  const context = canvasEl.getContext("2d");
  if (!context) {
    URL.revokeObjectURL(url);
    throw new Error("Canvas context unavailable");
  }

  context.drawImage(image, 0, 0, rect.width, rect.height);
  URL.revokeObjectURL(url);

  return await new Promise<Blob>((resolve, reject) => {
    canvasEl.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PNG export failed"));
    }, "image/png");
  });
}

function createEmbeddedSvgStyle(): SVGStyleElement {
  const style = createSvgElement("style");
  style.textContent = collectEmbeddedStyleText();
  return style;
}

function collectEmbeddedStyleText(): string {
  const chunks: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = sheet.cssRules;
      for (const rule of Array.from(rules)) {
        chunks.push(rule.cssText);
      }
    } catch {
      // Ignore stylesheets that cannot be read; only same-origin local styles are needed here.
    }
  }
  return chunks.join("\n");
}

function inlineSvgComputedStyles(sourceRoot: SVGSVGElement, cloneRoot: SVGSVGElement): void {
  const sourceNodes = [sourceRoot, ...Array.from(sourceRoot.querySelectorAll<SVGElement>("*"))];
  const cloneNodes = [cloneRoot, ...Array.from(cloneRoot.querySelectorAll<SVGElement>("*"))];
  const properties = [
    "fill",
    "fill-opacity",
    "stroke",
    "stroke-opacity",
    "stroke-width",
    "stroke-dasharray",
    "stroke-linecap",
    "stroke-linejoin",
    "opacity",
    "font",
    "font-family",
    "font-size",
    "font-weight",
    "letter-spacing",
    "text-anchor",
    "dominant-baseline",
    "paint-order",
    "vector-effect",
    "visibility",
    "display",
  ];

  sourceNodes.forEach((sourceNode, index) => {
    const cloneNode = cloneNodes[index];
    if (!cloneNode) return;
    const computed = getComputedStyle(sourceNode);
    const styleText = properties
      .map((property) => `${property}:${computed.getPropertyValue(property)};`)
      .join("");
    if (styleText) {
      cloneNode.setAttribute("style", styleText);
    }
  });
}

render();
