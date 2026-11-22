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
    // Determine the current heart rate (BPM) from props or trend values
    const currentBpm = useMemo(() => {
        if (typeof propBpm === "number" && !isNaN(propBpm) && propBpm > 0) return propBpm;
        if (values && values.length > 0) {
            const last = values[values.length - 1];
            if (typeof last === "number" && !isNaN(last) && last > 0) return last;
        }
        return 78;
    }, [propBpm, values]);

    const isElevated = currentBpm >= threshold;
    const w = 700;
    const h = 64;
    const baseline = 34;

    // Generate authentic Lead I P-Q-R-S-T electrocardiogram waveform
    const { pathData, latestPeak } = useMemo(() => {
        // Dynamic interval between cardiac cycles (higher BPM = closer spikes)
        // At 60 BPM: ~160px; at 80 BPM: ~125px; at 120 BPM: ~85px
        const clampedBpm = Math.max(45, Math.min(180, currentBpm));
        const cycleInterval = Math.max(75, Math.min(170, Math.round(140 * (75 / clampedBpm))));

        // Height scaling: if elevated, R spike punches higher
        const rPeakY = isElevated ? 6 : 8;
        const sDipY = isElevated ? 58 : 52;

        const pts: [number, number][] = [[0, baseline]];
        const peaks: [number, number][] = [];

        // Distribute beats across the 700px width
        let cx = 35;
        while (cx < w - 20) {
            const rX = cx + 22;
            peaks.push([rX, rPeakY]);

            // Isoelectric start
            pts.push([cx, baseline]);
            // P-Wave (atrial depolarization - small smooth upward curve)
            pts.push([cx + 6, baseline - 1.5]);
            pts.push([cx + 10, baseline - 4]);
            pts.push([cx + 14, baseline - 1.5]);
            pts.push([cx + 18, baseline]);

            // PR segment
            pts.push([cx + 20, baseline]);

            // QRS Complex (ventricular depolarization)
            pts.push([cx + 21, baseline + 3.5]); // Q wave (sharp brief downward dip)
            pts.push([rX, rPeakY]);             // R wave (dramatic tall spike!)
            pts.push([cx + 25, sDipY]);          // S wave (deep downward plunge!)

            // ST segment & J point
            pts.push([cx + 28, baseline - 1]);

            // T-Wave (ventricular repolarization - smooth rounded dome)
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

        const lastPeak = peaks.length > 0 ? peaks[peaks.length - 1] : [560, rPeakY];

        return { pathData: d, peakPoints: peaks, latestPeak: lastPeak };
    }, [currentBpm, isElevated]);

    // Stroke styling: tactical gold for normal dark mode, red if elevated
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

    return (
        <div className="relative w-full overflow-hidden select-none">
            <svg
                viewBox={`0 0 ${w} ${h}`}
                preserveAspectRatio="none"
                className="w-full h-16"
                role="img"
                aria-label={`Lead I ECG electrocardiogram waveform showing active heart rhythm at ${currentBpm} BPM`}
            >
                <defs>
                    {/* ECG Paper Subtle Grid Pattern */}
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

                {/* Background ECG Coordinate Grid */}
                <rect width={w} height={h} fill="url(#ecg-grid)" />

                {/* Upper Threshold Alert Boundary Line */}
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

                {/* Baseline Mid-point Guide */}
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

                {/* Actual P-Q-R-S-T ECG Waveform */}
                <path
                    d={pathData}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth="2.25"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    style={{ filter: `drop-shadow(0 0 6px ${glowColor})` }}
                    vectorEffect="non-scaling-stroke"
                />

                {/* Cardiac Cycle Active Peak Blip (Sweeping Scanner Cursor) */}
                {latestPeak && (
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
            </svg>
        </div>
    );
}
