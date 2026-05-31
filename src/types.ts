export type ShapeKind = "rect" | "ellipse";

export type DofStatus = "under" | "full" | "over";
export type UnitKind = "px" | "percent" | "ratio";
export type AxisKind = "x" | "y";
export type XConstraintKind = "left" | "right" | "width" | "ratio" | "centerX";
export type YConstraintKind = "top" | "bottom" | "height" | "ratio" | "centerY";
export type ConstraintKind = XConstraintKind | YConstraintKind;
export type SourceAnchor = "left" | "right" | "centerX" | "top" | "bottom" | "centerY" | "ratio";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ComponentNode {
  id: string;
  name: string;
  shape: ShapeKind;
  box: Box;
  parentId: string | null;
  children: string[];
}

export interface ConstraintSpec {
  id: string;
  componentId: string;
  axis: AxisKind;
  kind: ConstraintKind;
  sourceComponentId: string | null;
  sourceAnchor: SourceAnchor;
  value: number;
  unit: UnitKind;
  ratioParts?: {
    w: number;
    h: number;
  };
}

export interface ProjectSpec {
  version: "0.1";
  viewport: {
    width: number;
    height: number;
  };
  components: Record<string, ComponentNode>;
  constraints: ConstraintSpec[];
}

export interface AxisConstraintStatus {
  axis: AxisKind;
  status: DofStatus;
  usedKinds: ConstraintKind[];
  availableKinds: ConstraintKind[];
  reason: string;
}

export interface ComponentDofReport {
  componentId: string;
  componentName: string;
  status: DofStatus;
  axes: AxisConstraintStatus[];
  missingAxes: AxisKind[];
  overConstrainedAxes: AxisKind[];
}

export interface DofAnalysis {
  components: ComponentDofReport[];
  unresolvedComponents: number;
  overConstrainedComponents: number;
  summaryLines: string[];
}
