import { inkOutline } from "./ink";
import { memo, type PointerEvent } from "react";
import type { Connector, Stroke } from "./model";
export function DrawingLayer({
  strokes,
  connectors,
  selected,
  tool,
  onStroke,
  onConnector,
}: {
  strokes: Stroke[];
  connectors: (Connector & { points: [number, number][] })[];
  selected: Set<string>;
  tool: string;
  onStroke: (event: PointerEvent<SVGPolylineElement>, stroke: Stroke) => void;
  onConnector: (
    event: PointerEvent<SVGPolylineElement>,
    connector: Connector,
  ) => void;
}) {
  return (
    <svg className="drawings" width="5600" height="3600">
      <defs>
        <marker
          id="arrowhead"
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8" fill="context-stroke" />
        </marker>
      </defs>
      {connectors.map((connector) => (
        <g key={connector.id} data-testid="connector">
          <polyline
            className={selected.has(connector.id) ? "selected-stroke" : ""}
            points={connector.points.map((p) => p.join(",")).join(" ")}
            stroke={connector.color}
            strokeWidth={connector.width}
            fill="none"
            markerEnd="url(#arrowhead)"
            style={{ pointerEvents: "none" }}
          />
          <polyline
            data-testid="connector-hit"
            points={connector.points.map((p) => p.join(",")).join(" ")}
            stroke="transparent"
            strokeWidth="16"
            fill="none"
            style={{ pointerEvents: tool === "select" ? "stroke" : "none" }}
            onPointerDown={(event) => onConnector(event, connector)}
          />
        </g>
      ))}
      {strokes.map((stroke) => (
        <g key={stroke.id} data-testid="drawing">
          {!stroke.arrow && (
            <InkPath stroke={stroke} selected={selected.has(stroke.id)} />
          )}
          <polyline
            className={selected.has(stroke.id) ? "selected-stroke" : ""}
            points={stroke.points.map((p) => p.join(",")).join(" ")}
            fill="none"
            stroke={stroke.arrow ? stroke.color : "transparent"}
            strokeWidth={stroke.width ?? 3}
            opacity={stroke.opacity ?? 1}
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd={stroke.arrow ? "url(#arrowhead)" : undefined}
            style={{ pointerEvents: "none" }}
          />
          <polyline
            data-testid="drawing-hit"
            points={stroke.points.map((p) => p.join(",")).join(" ")}
            fill="none"
            stroke="transparent"
            strokeWidth={Math.max(16, stroke.width ?? 3)}
            strokeLinecap="round"
            style={{
              pointerEvents:
                tool === "select" || tool === "erase" ? "stroke" : "none",
            }}
            onPointerDown={(event) => onStroke(event, stroke)}
          />
        </g>
      ))}
    </svg>
  );
}

const InkPath = memo(function InkPath({
  stroke,
  selected,
}: {
  stroke: Stroke;
  selected: boolean;
}) {
  return (
    <path
      data-testid="smooth-ink"
      d={inkOutline(stroke)}
      fill={stroke.color}
      opacity={stroke.opacity ?? 1}
      style={{ pointerEvents: "none" }}
      className={selected ? "selected-stroke" : ""}
    />
  );
});
