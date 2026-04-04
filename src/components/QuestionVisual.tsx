import { useMemo } from "react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { MathText } from "@/components/MathText";

interface VisualData {
  function?: string;
  range?: [number, number];
  points?: { x: number; y: number; label?: string }[];
  forces?: { label: string; direction: string }[];
  formula?: string;
  // Velocity/time or position/time graphs
  xLabel?: string;
  yLabel?: string;
  dataPoints?: { x: number; y: number }[];
}

interface QuestionVisualProps {
  visualType: string;
  visualData: VisualData;
}

/**
 * Attempt to parse a math function string and evaluate it.
 * Supports: x^n, sqrt(x), sin(x), cos(x), tan(x), log(x), ln(x), abs(x), e^x, constants
 */
function evaluateFunction(expr: string, x: number): number | null {
  try {
    // Normalize the expression
    let fn = expr
      .replace(/y\s*=\s*/, "")
      .replace(/f\(x\)\s*=\s*/, "")
      .trim();

    // Replace math syntax with JS equivalents
    fn = fn
      .replace(/\^/g, "**")
      .replace(/sqrt\(/g, "Math.sqrt(")
      .replace(/sin\(/g, "Math.sin(")
      .replace(/cos\(/g, "Math.cos(")
      .replace(/tan\(/g, "Math.tan(")
      .replace(/log\(/g, "Math.log10(")
      .replace(/ln\(/g, "Math.log(")
      .replace(/abs\(/g, "Math.abs(")
      .replace(/pi/gi, "Math.PI")
      .replace(/(?<![a-zA-Z])e(?![a-zA-Z(])/g, "Math.E");

    // Handle implicit multiplication: 3x → 3*x, (x)(x) → (x)*(x)
    fn = fn.replace(/(\d)([x(])/g, "$1*$2");
    fn = fn.replace(/\)(\()/g, ")*(");
    fn = fn.replace(/\)(x)/g, ")*$1");
    fn = fn.replace(/([x)])(\d)/g, "$1*$2");

    // Evaluate safely using Function constructor with only x and Math available
    const compute = new Function("x", "Math", `"use strict"; return (${fn});`);
    const result = compute(x, Math);

    if (typeof result !== "number" || !isFinite(result)) return null;
    return result;
  } catch {
    return null;
  }
}

function MathGraph({ visualData }: { visualData: VisualData }) {
  const data = useMemo(() => {
    if (visualData.dataPoints) {
      return visualData.dataPoints.map((p) => ({
        x: p.x,
        y: p.y,
      }));
    }

    if (!visualData.function) return [];

    const [min, max] = visualData.range || [-10, 10];
    const steps = 200;
    const step = (max - min) / steps;
    const points: { x: number; y: number | null }[] = [];

    for (let i = 0; i <= steps; i++) {
      const x = min + i * step;
      const y = evaluateFunction(visualData.function, x);
      points.push({ x: Math.round(x * 1000) / 1000, y });
    }

    return points;
  }, [visualData]);

  const validData = data.filter((p) => p.y !== null) as {
    x: number;
    y: number;
  }[];

  if (validData.length === 0) {
    return (
      <div className="p-4 rounded-lg bg-muted/50 border border-border text-center text-sm text-muted-foreground">
        <p>Could not render graph for: <MathText text={`$${visualData.function}$`} /></p>
      </div>
    );
  }

  // Calculate Y bounds (clamp to avoid extreme values)
  const yValues = validData.map((p) => p.y);
  const rawMin = Math.min(...yValues);
  const rawMax = Math.max(...yValues);
  const yPadding = (rawMax - rawMin) * 0.1 || 1;
  const yMin = Math.max(rawMin - yPadding, -100);
  const yMax = Math.min(rawMax + yPadding, 100);

  const chartConfig = {
    y: { label: visualData.function || "y", color: "hsl(var(--primary))" },
  };

  return (
    <div className="my-4 p-4 rounded-xl bg-muted/30 border border-border">
      {visualData.function && (
        <p className="text-sm font-medium text-muted-foreground mb-2 text-center">
          <MathText text={`$${visualData.function}$`} />
        </p>
      )}
      {(visualData.xLabel || visualData.yLabel) && (
        <p className="text-xs text-muted-foreground mb-1 text-center">
          {visualData.xLabel && <span>x: {visualData.xLabel}</span>}
          {visualData.xLabel && visualData.yLabel && <span> · </span>}
          {visualData.yLabel && <span>y: {visualData.yLabel}</span>}
        </p>
      )}
      <ChartContainer config={chartConfig} className="h-[240px] w-full">
        <LineChart data={validData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
          <XAxis
            dataKey="x"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v) => Number(v).toFixed(1)}
            className="text-xs"
          />
          <YAxis
            domain={[yMin, yMax]}
            tickFormatter={(v) => Number(v).toFixed(1)}
            className="text-xs"
          />
          {/* Axis lines through origin */}
          <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeWidth={1} />
          <ReferenceLine x={0} stroke="hsl(var(--muted-foreground))" strokeWidth={1} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const p = payload?.[0]?.payload;
                  return p ? `x = ${p.x}` : "";
                }}
              />
            }
          />
          <Line
            type="monotone"
            dataKey="y"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
          />
          {/* Render special points if any */}
          {visualData.points?.map((pt, i) => (
            <ReferenceLine
              key={i}
              x={pt.x}
              stroke="hsl(var(--accent))"
              strokeDasharray="4 4"
              label={{ value: pt.label || `(${pt.x}, ${pt.y})`, position: "top" }}
            />
          ))}
        </LineChart>
      </ChartContainer>
    </div>
  );
}

function ForceBodyDiagram({ visualData }: { visualData: VisualData }) {
  const forces = visualData.forces || [];

  const directionToAngle: Record<string, number> = {
    up: -90,
    down: 90,
    left: 180,
    right: 0,
    "up-right": -45,
    "up-left": -135,
    "down-right": 45,
    "down-left": 135,
  };

  return (
    <div className="my-4 p-4 rounded-xl bg-muted/30 border border-border">
      <p className="text-sm font-medium text-muted-foreground mb-3 text-center">Free Body Diagram</p>
      <div className="flex justify-center">
        <svg viewBox="-120 -120 240 240" className="w-[240px] h-[240px]">
          {/* Object */}
          <circle cx="0" cy="0" r="16" fill="hsl(var(--primary))" opacity="0.2" stroke="hsl(var(--primary))" strokeWidth="2" />
          
          {/* Force arrows */}
          {forces.map((force, i) => {
            const angle = directionToAngle[force.direction.toLowerCase()] ?? 0;
            const rad = (angle * Math.PI) / 180;
            const len = 70;
            const endX = Math.cos(rad) * len;
            const endY = Math.sin(rad) * len;
            const startX = Math.cos(rad) * 20;
            const startY = Math.sin(rad) * 20;
            const labelX = Math.cos(rad) * (len + 20);
            const labelY = Math.sin(rad) * (len + 20);

            const colors = [
              "hsl(var(--primary))",
              "hsl(var(--accent))",
              "hsl(var(--secondary))",
              "hsl(var(--destructive))",
            ];
            const color = colors[i % colors.length];

            return (
              <g key={i}>
                <defs>
                  <marker
                    id={`arrowhead-${i}`}
                    markerWidth="8"
                    markerHeight="6"
                    refX="8"
                    refY="3"
                    orient="auto"
                  >
                    <polygon points="0 0, 8 3, 0 6" fill={color} />
                  </marker>
                </defs>
                <line
                  x1={startX}
                  y1={startY}
                  x2={endX}
                  y2={endY}
                  stroke={color}
                  strokeWidth="2.5"
                  markerEnd={`url(#arrowhead-${i})`}
                />
                <text
                  x={labelX}
                  y={labelY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="text-[11px] font-medium fill-foreground"
                >
                  {force.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function MoleculeDisplay({ visualData }: { visualData: VisualData }) {
  if (!visualData.formula) return null;
  return (
    <div className="my-4 p-4 rounded-xl bg-muted/30 border border-border text-center">
      <p className="text-sm font-medium text-muted-foreground mb-2">Molecular Formula</p>
      <p className="text-2xl font-mono font-bold text-foreground">
        <MathText text={`$\\text{${visualData.formula}}$`} />
      </p>
    </div>
  );
}

export const QuestionVisual = ({ visualType, visualData }: QuestionVisualProps) => {
  if (!visualType || visualType === "none" || !visualData) return null;

  switch (visualType) {
    case "graph":
    case "velocity_time_graph":
    case "position_time_graph":
      return <MathGraph visualData={visualData} />;
    case "free_body_diagram":
    case "diagram":
      if (visualData.forces) {
        return <ForceBodyDiagram visualData={visualData} />;
      }
      // Fallback: if it has a function, render as graph
      if (visualData.function || visualData.dataPoints) {
        return <MathGraph visualData={visualData} />;
      }
      return null;
    case "molecule":
    case "structure":
      return <MoleculeDisplay visualData={visualData} />;
    default:
      // Try graph if function data is present
      if (visualData.function || visualData.dataPoints) {
        return <MathGraph visualData={visualData} />;
      }
      return null;
  }
};
