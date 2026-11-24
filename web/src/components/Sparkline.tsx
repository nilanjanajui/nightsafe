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
    const h = 64;

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
            ? "#ba1a1a"
            : "#af914c"
        : isElevated
        ? "#ba1a1a"
        : "#28301c";

    const glowColor = isElevated
        ? "rgba(186,26,26,0.6)"
        : dark
        ? "rgba(175,145,76,0.45)"
        : "rgba(40,48,28,0.25)";

    const { pathData, thresholdY, lastPoint } = useMemo(() => {
        if (activeValues.length === 0) {
            return { pathData: `M 0 ${h / 2} L ${w} ${h / 2}`, thresholdY: 12, lastPoint: null };
        }

        const minVal = Math.min(...activeValues, threshold - 15, 40);
        const maxVal = Math.max(...activeValues, threshold + 15, 120);
        const range = maxVal - minVal || 1;

        const getY = (val: number) => {
            const normalized = (val - minVal) / range;
            return Math.round(h - 12 - normalized * (h - 24));
        };

        const tY = getY(threshold);

        if (activeValues.length === 1) {
            const singleY = getY(activeValues[0]);
            return {
                pathData: `M 0 ${singleY} L ${w} ${singleY}`,
                thresholdY: tY,
                lastPoint: [w - 10, singleY] as [number, number],
            };
        }

        const pts = activeValues.map((v, i) => {
            const x = (i / (activeValues.length - 1)) * (w - 20) + 10;
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
                className="w-full h-16"
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

                {/* Threshold Alert Line */}
                <line
                    x1="0"
                    x2={w}
                    y1={thresholdY}
                    y2={thresholdY}
                    stroke={dark ? "#af914c" : "#ba1a1a"}
                    strokeOpacity={dark ? "0.35" : "0.3"}
                    strokeDasharray="4 4"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                />

                {/* Detected Readings Path */}
                <path
                    d={pathData}
                    fill="none"
                    stroke={latestVal !== null ? strokeColor : dark ? "#575b50" : "#9ca3af"}
                    strokeWidth={latestVal !== null ? "2.25" : "1.5"}
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
                            fill={isElevated ? "#ffdad6" : "#ffdf99"}
                            className="animate-ping opacity-60"
                        />
                        <circle
                            cx={lastPoint[0]}
                            cy={lastPoint[1]}
                            r="3.5"
                            fill={isElevated ? "#ba1a1a" : "#ffdf99"}
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
