"use client";

import { useMemo } from "react";

interface SparklineProps {
    values: number[];
    threshold: number;
    dark?: boolean;
    bpm?: number;
}

export default function Sparkline({
    values,
    threshold,
    dark = false,
    bpm: propBpm,
}: SparklineProps) {
    const w = 700;
    const h = 76;

    // Use original readings detected from the device
    const activeValues = useMemo(() => {
        const filtered = (values || []).filter((v) => typeof v === "number" && !isNaN(v) && v > 0);
        if (filtered.length === 0 && typeof propBpm === "number" && !isNaN(propBpm) && propBpm > 0) {
            return [propBpm];
        }
        return filtered;
    }, [values, propBpm]);

    const latestVal = activeValues.length > 0 ? activeValues[activeValues.length - 1] : null;
    const isElevated = latestVal !== null && latestVal >= threshold;

    const strokeColor = dark
        ? isElevated
            ? "#ef4444"
            : "#facc15"
        : isElevated
        ? "#dc2626"
        : "#28301c";

    const glowColor = isElevated
        ? "rgba(239,68,68,0.6)"
        : dark
        ? "rgba(250,204,21,0.4)"
        : "rgba(40,48,28,0.25)";

    const { pathData, thresholdY, lastPoint } = useMemo(() => {
        if (activeValues.length === 0) {
            return { pathData: `M 0 ${h / 2} L ${w} ${h / 2}`, thresholdY: 22, lastPoint: null };
        }

        const minVal = Math.min(...activeValues, threshold - 15, 40);
        const maxVal = Math.max(...activeValues, threshold + 15, 120);
        const range = maxVal - minVal || 1;

        const getY = (val: number) => {
            const normalized = (val - minVal) / range;
            return Math.round(h - 14 - normalized * (h - 28));
        };

        const tY = getY(threshold);

        if (activeValues.length === 1) {
            const singleY = getY(activeValues[0]);
            return {
                pathData: `M 0 ${singleY} L ${w} ${singleY}`,
                thresholdY: tY,
                lastPoint: [w - 12, singleY] as [number, number],
            };
        }

        const pts = activeValues.map((v, i) => {
            const x = (i / (activeValues.length - 1)) * (w - 24) + 12;
            const y = getY(v);
            return [x, y] as [number, number];
        });

        const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
        const last = pts[pts.length - 1];

        return { pathData: d, thresholdY: tY, lastPoint: last };
    }, [activeValues, threshold]);

    return (
        <div className="relative w-full overflow-hidden select-none">
            <svg
                viewBox={`0 0 ${w} ${h}`}
                preserveAspectRatio="none"
                className="w-full h-20"
                role="img"
                aria-label={
                    latestVal !== null
                        ? `Heart rate trend showing detected reading at ${latestVal} BPM`
                        : "No heart rate telemetry reported"
                }
            >
                <defs>
                    <pattern id="ecg-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                        <path
                            d="M 20 0 L 0 0 0 20"
                            fill="none"
                            stroke={dark ? "#c1caad" : "#76786f"}
                            strokeWidth="0.5"
                            strokeOpacity={dark ? "0.08" : "0.06"}
                        />
                    </pattern>
                </defs>

                <rect width={w} height={h} fill="url(#ecg-grid)" />

                {/* Elevated Alert Danger Zone (Area above threshold) */}
                <rect
                    x="0"
                    y="0"
                    width={w}
                    height={Math.max(0, thresholdY)}
                    fill={isElevated ? "#ef4444" : "#ba1a1a"}
                    fillOpacity={dark ? "0.12" : "0.06"}
                />

                {/* Threshold Alert Line */}
                <g>
                    <line
                        x1="0"
                        x2={w}
                        y1={thresholdY}
                        y2={thresholdY}
                        stroke={isElevated ? "#ef4444" : "#f59e0b"}
                        strokeOpacity={dark ? "0.85" : "0.75"}
                        strokeDasharray="5 4"
                        strokeWidth="1.5"
                        vectorEffect="non-scaling-stroke"
                    />

                    {/* Integrated Threshold Badge Pill */}
                    <rect
                        x={w - 170}
                        y={Math.max(2, thresholdY - 9)}
                        width="160"
                        height="18"
                        rx="4"
                        fill={dark ? "#1b2512" : "#fef2f2"}
                        stroke={isElevated ? "#ef4444" : "#f59e0b"}
                        strokeWidth="1"
                        strokeOpacity="0.7"
                    />
                    <text
                        x={w - 90}
                        y={Math.max(2, thresholdY - 9) + 12.5}
                        textAnchor="middle"
                        fill={isElevated ? "#fca5a5" : "#fde047"}
                        className="text-[10px] font-mono font-bold tracking-wider uppercase select-none"
                    >
                        Alert Limit: {threshold} BPM
                    </text>
                </g>

                {/* Detected Readings Path */}
                <path
                    d={pathData}
                    fill="none"
                    stroke={latestVal !== null ? strokeColor : dark ? "#575b50" : "#9ca3af"}
                    strokeWidth={latestVal !== null ? "2.5" : "1.5"}
                    strokeDasharray={latestVal === null ? "4 4" : undefined}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    style={latestVal !== null ? { filter: `drop-shadow(0 0 6px ${glowColor})` } : undefined}
                    vectorEffect="non-scaling-stroke"
                />

                {/* Latest Point Indicator */}
                {lastPoint && latestVal !== null && (
                    <g>
                        <circle
                            cx={lastPoint[0]}
                            cy={lastPoint[1]}
                            r="5"
                            fill={isElevated ? "#fca5a5" : "#fef08a"}
                            className="animate-ping opacity-60"
                        />
                        <circle
                            cx={lastPoint[0]}
                            cy={lastPoint[1]}
                            r="3.5"
                            fill={isElevated ? "#ef4444" : "#facc15"}
                            className="animate-pulse"
                        />
                    </g>
                )}

                {/* No Signal Label */}
                {latestVal === null && (
                    <text
                        x={w / 2}
                        y={h / 2 + 4}
                        textAnchor="middle"
                        fill={dark ? "#c1caad" : "#76786f"}
                        fillOpacity="0.6"
                        className="text-[11px] font-mono tracking-wider font-semibold"
                    >
                        AWAITING DETECTED SENSOR SIGNAL
                    </text>
                )}
            </svg>
        </div>
    );
}
