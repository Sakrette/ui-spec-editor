import type {
  AxisConstraintStatus,
  AxisKind,
  ComponentDofReport,
  ComponentNode,
  ConstraintKind,
  ConstraintSpec,
  DofAnalysis,
  DofStatus,
  ProjectSpec,
  ShapeKind,
} from "./types";

const X_KINDS: ConstraintKind[] = ["left", "right", "width", "ratio", "centerX"];
const Y_KINDS: ConstraintKind[] = ["top", "bottom", "height", "ratio", "centerY"];

export function analyzeProjectDof(spec: ProjectSpec): DofAnalysis {
  const components = Object.values(spec.components).filter((component) => component.id !== "root");
  const reports = components.map((component) => analyzeComponent(component, spec.constraints));

  return {
    components: reports,
    unresolvedComponents: reports.filter((report) => report.missingAxes.length > 0).length,
    overConstrainedComponents: reports.filter((report) => report.overConstrainedAxes.length > 0).length,
    summaryLines: reports.map((report) => {
      if (report.status === "full") {
        return `${report.componentName}: DOF = 0`;
      }
      const missing = report.missingAxes.join(", ");
      const over = report.overConstrainedAxes.join(", ");
      return [missing ? `${report.componentName}: missing ${missing}` : "", over ? `${report.componentName}: over ${over}` : ""]
        .filter(Boolean)
        .join(" | ");
    }),
  };
}

export function getAvailableKinds(axis: AxisKind): ConstraintKind[] {
  return axis === "x" ? X_KINDS : Y_KINDS;
}

export function getShapeLabel(shape: ShapeKind): string {
  return shape === "rect" ? "Rectangle" : "Ellipse";
}

function analyzeComponent(component: ComponentNode, constraints: ConstraintSpec[]): ComponentDofReport {
  const ownConstraints = constraints.filter((constraint) => constraint.componentId === component.id);
  const axes = [analyzeAxis("x", ownConstraints), analyzeAxis("y", ownConstraints)];
  const dimensionalKinds = new Set(
    ownConstraints
      .filter((constraint) => isDimensionalKind(constraint.kind))
      .map((constraint) => constraint.kind),
  );

  if (dimensionalKinds.size > 2) {
    axes.forEach((axis) => {
      axis.status = "over";
      axis.reason = `width/height/ratio uses ${dimensionalKinds.size}/2`;
    });
  }

  const missingAxes = axes.filter((axis) => axis.status === "under").map((axis) => axis.axis);
  const overConstrainedAxes = axes.filter((axis) => axis.status === "over").map((axis) => axis.axis);

  return {
    componentId: component.id,
    componentName: component.name,
    status: summarizeStatus(axes),
    axes,
    missingAxes,
    overConstrainedAxes,
  };
}

function analyzeAxis(axis: AxisKind, constraints: ConstraintSpec[]): AxisConstraintStatus {
  const availableKinds = getAvailableKinds(axis);
  const usedKinds = constraints.filter((constraint) => constraint.axis === axis).map((constraint) => constraint.kind);
  const uniqueKinds = [...new Set(usedKinds)];

  let status: DofStatus = "full";
  let reason = `2 of 5 set: ${uniqueKinds.join(", ")}`;

  if (uniqueKinds.length < 2) {
    status = "under";
    reason = `${uniqueKinds.length}/2 required`;
  } else if (uniqueKinds.length > 2) {
    status = "over";
    reason = `${uniqueKinds.length}/2 used`;
  }

  const duplicateKinds = usedKinds.filter((kind, index) => usedKinds.indexOf(kind) !== index);
  if (duplicateKinds.length > 0) {
    status = "over";
    reason = `duplicate ${[...new Set(duplicateKinds)].join(", ")}`;
  }

  return {
    axis,
    status,
    usedKinds: uniqueKinds,
    availableKinds,
    reason,
  };
}

function summarizeStatus(axes: AxisConstraintStatus[]): DofStatus {
  if (axes.some((axis) => axis.status === "over")) return "over";
  if (axes.some((axis) => axis.status === "under")) return "under";
  return "full";
}

function isDimensionalKind(kind: ConstraintKind): kind is "width" | "height" | "ratio" {
  return kind === "width" || kind === "height" || kind === "ratio";
}
