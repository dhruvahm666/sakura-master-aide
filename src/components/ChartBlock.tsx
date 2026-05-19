import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from "recharts";

interface ChartSpec {
  type: "bar" | "line" | "pie";
  title?: string;
  labels: string[];
  datasets: Array<{ label: string; data: number[] }>;
}

const COLORS = ["#f4a7b9", "#e879a8", "#c084fc", "#f0abfc", "#fbcfe8", "#a78bfa"];

export function ChartBlock({ spec }: { spec: ChartSpec }) {
  const data = spec.labels.map((label, i) => {
    const row: Record<string, string | number> = { label };
    spec.datasets.forEach((d) => { row[d.label] = d.data[i] ?? 0; });
    return row;
  });

  return (
    <div className="my-3 rounded-xl border border-border bg-card/60 p-4">
      {spec.title && <div className="mb-2 text-sm font-medium text-foreground">{spec.title}</div>}
      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer>
          {spec.type === "bar" ? (
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff15" />
              <XAxis dataKey="label" stroke="#bbb" fontSize={11} />
              <YAxis stroke="#bbb" fontSize={11} />
              <Tooltip contentStyle={{ background: "#1f1b2d", border: "1px solid #ffffff20", borderRadius: 8 }} />
              <Legend />
              {spec.datasets.map((d, i) => <Bar key={d.label} dataKey={d.label} fill={COLORS[i % COLORS.length]} radius={[6, 6, 0, 0]} />)}
            </BarChart>
          ) : spec.type === "line" ? (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff15" />
              <XAxis dataKey="label" stroke="#bbb" fontSize={11} />
              <YAxis stroke="#bbb" fontSize={11} />
              <Tooltip contentStyle={{ background: "#1f1b2d", border: "1px solid #ffffff20", borderRadius: 8 }} />
              <Legend />
              {spec.datasets.map((d, i) => <Line key={d.label} type="monotone" dataKey={d.label} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />)}
            </LineChart>
          ) : (
            <PieChart>
              <Tooltip contentStyle={{ background: "#1f1b2d", border: "1px solid #ffffff20", borderRadius: 8 }} />
              <Pie data={data} dataKey={spec.datasets[0]?.label ?? "value"} nameKey="label" outerRadius={90} label>
                {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
