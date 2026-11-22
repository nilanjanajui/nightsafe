export default function Sparkline({ values, threshold }: { values: number[]; threshold: number }) {
    if (values.length < 2) return <div className="h-16 rounded-xl bg-[var(--tint)]" />;
    const w = 300, h = 64;
    const min = Math.min(...values, threshold - 10);
    const max = Math.max(...values, threshold + 10);
    const x = (i: number) => (i / (values.length - 1)) * w;
    const y = (v: number) => h - ((v - min) / (max - min)) * h;
    const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
    return (
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-16 w-full" role="img" aria-label="Heart rate over the last readings">
            <line x1="0" x2={w} y1={y(threshold)} y2={y(threshold)} stroke="#dc2626" strokeOpacity=".5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
            <path d={d} fill="none" stroke="#0f172a" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
    );
}