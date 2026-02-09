interface BarChartProps {
  data: { label: string; value: number; color?: string }[];
  height?: number;
}

export function BarChart({ data, height = 200 }: BarChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((d, i) => {
        const barHeight = (d.value / maxValue) * 100;
        return (
          <div
            key={i}
            className="flex flex-col items-center flex-1 min-w-0"
          >
            <div
              className={`w-full rounded-t ${d.color ?? "bg-primary/60"} transition-all`}
              style={{ height: `${barHeight}%`, minHeight: d.value > 0 ? 2 : 0 }}
              title={`${d.label}: ${d.value}`}
            />
            <span className="text-[10px] text-muted-foreground mt-1 truncate w-full text-center">
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
