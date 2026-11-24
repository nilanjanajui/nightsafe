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
    const baseline = 34;

    // Exact detected BPM from the device (prop or last reading)
    const detectedBpm = useMemo(() => {
        if (typeof propBpm === "number" && !isNaN(propBpm) && propBpm > 0) return propBpm;
        if (values && values.length > 0) {
            const last = values[values.length - 1];
            if (typeof last === "number" && !isNaN(last) && last > 0) return last;
        }
        return null;
    }, [propBpm, values]);

    const isElevated = detectedBpm !== null && detectedBpm >= threshold;

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

    const { pathData, latestPeak } = useMemo(() => {
        // If no heart rate is detected, show a flat isoelectric line
        if (detectedBpm === null) {
            return {
                pathData: `M 0 ${baseline} L ${w} ${baseline}`,
                latestPeak: null,
            };
        }

        // Generate authentic Lead I P-Q-R-S-T wave scaled to the EXACT detected BPM
        // Higher BPM = closer cardiac cycles
        const clampedBpm = Math.max(45, Math.min(180, detectedBpm));
        const cycleInterval = Math.max(75, Math.min(170, Math.round(140 * (75 / clampedBpm))));

        const rPeakY = isElevated ? 6 : 8;
        const sDipY = isElevated ? 58 : 52;

        const pts: [number, number][] = [[0, baseline]];
        const peaks: [number, number][] = [];

        let cx = 35;
        while (cx < w - 20) {
            const rX = cx + 22;
            peaks.push([rX, rPeakY]);

            // Isoelectric baseline start
            pts.push([cx, baseline]);
            // P-Wave (atrial depolarization)
            pts.push([cx + 6, baseline - 1.5]);
            pts.push([cx + 10, baseline - 4]);
            pts.push([cx + 14, baseline - 1.5]);
            pts.push([cx + 18, baseline]);

            // PR segment
            pts.push([cx + 20, baseline]);

            // QRS Complex (ventricular depolarization)
            pts.push([cx + 21, baseline + 3.5]); // Q wave
            pts.push([rX, rPeakY]);             // R wave peak
            pts.push([cx + 25, sDipY]);          // S wave plunge

            // ST segment
            pts.push([cx + 28, baseline - 1]);

            // T-Wave (ventricular repolarization)
            pts.push([cx + 34, baseline - 3]);
            pts.push([cx + 40, baseline - 6.5]);
            pts.push([cx + 46, baseline - 3]);
            pts.push([cx + 52, baseline]);

            cx += cycleInterval;
        }

        pts.push([w, baseline]);

        const d = pts
            .map(([px, py], i) => `${i === 0 ? "M" : "L"} ${px.toFixed(1)} ${py.toFixed(1)}`)
            .join(" ");

        const lastPeak = peaks.length > 0 ? peaks[peaks.length - 1] : null;

        return { pathData: d, latestPeak: lastPeak };
    }, [detectedBpm, isElevated]);

    return (
        <div className="relative w-full overflow-hidden select-none">
            <svg
                viewBox={`0 0 ${w} ${h}`}
                preserveAspectRatio="none"
                className="w-full h-16"
                role="img"
                aria-label={
                    detectedBpm !== null
                        ? `Lead I ECG waveform driven by detected heart rate at ${detectedBpm} BPM`
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

                {/* Threshold Alert Boundary Line */}
                <line
                    x1="0"
                    x2={w}
                    y1="12"
                    y2="12"
                    stroke={dark ? "#af914c" : "#ba1a1a"}
                    strokeOpacity={dark ? "0.3" : "0.25"}
                    strokeDasharray="4 4"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                />

                {/* Baseline Guide Line */}
                <line
                    x1="0"
                    x2={w}
                    y1={baseline}
                    y2={baseline}
                    stroke={dark ? "#c1caad" : "#454840"}
                    strokeOpacity="0.08"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                />

                {/* Cardiac Waveform */}
                <path
                    d={pathData}
                    fill="none"
                    stroke={detectedBpm !== null ? strokeColor : dark ? "#575b50" : "#9ca3af"}
                    strokeWidth={detectedBpm !== null ? "2.25" : "1.5"}
                    strokeDasharray={detectedBpm === null ? "4 4" : undefined}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    style={detectedBpm !== null ? { filter: `drop-shadow(0 0 6px ${glowColor})` } : undefined}
                    vectorEffect="non-scaling-stroke"
                />

                {/* Active Cardiac Peak Scanner Blip */}
                {latestPeak && detectedBpm !== null && (
                    <g>
                        <circle
                            cx={latestPeak[0]}
                            cy={latestPeak[1]}
                            r="5"
                            fill={isElevated ? "#ffdad6" : "#ffdf99"}
                            className="animate-ping opacity-60"
                        />
                        <circle
                            cx={latestPeak[0]}
                            cy={latestPeak[1]}
                            r="3"
                            fill={isElevated ? "#ba1a1a" : "#ffdf99"}
                            className="animate-pulse"
                        />
                    </g>
                )}

                {/* Awaiting Signal Notice if no sensor signal */}
                {detectedBpm === null && (
                    <text
                        x={w / 2}
                        y={baseline - 10}
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
