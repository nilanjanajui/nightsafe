"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

const pinIcon = L.divIcon({
    className: "bg-transparent",
    html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:36px;height:36px;">
        <span style="position:absolute;width:36px;height:36px;border-radius:50%;background:#af914c;opacity:0.25;animation:ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></span>
        <span style="position:absolute;width:24px;height:24px;border-radius:50%;background:#af914c;opacity:0.4;"></span>
        <span style="position:relative;width:14px;height:14px;border-radius:50%;border:2.5px solid #ffffff;background:#141b09;box-shadow:0 2px 6px rgba(40,48,28,0.35);"></span>
    </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
});

function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
    const map = useMap();
    useEffect(() => {
        map.setView([lat, lng], map.getZoom());
    }, [lat, lng, map]);
    return null;
}

export default function LiveMap({ lat, lng }: { lat: number; lng: number }) {
    return (
        <div className="relative h-[300px] w-full overflow-hidden rounded-xl border border-outline-variant/40 bg-surface-container shadow-inner">
            <MapContainer
                center={[lat, lng]}
                zoom={15}
                scrollWheelZoom={false}
                className="h-full w-full z-0"
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={[lat, lng]} icon={pinIcon} />
                <RecenterMap lat={lat} lng={lng} />
            </MapContainer>

            {/* Tactical Floating Pill Over Map */}
            <div className="pointer-events-none absolute top-3 left-3 z-10 flex items-center gap-2 rounded-lg bg-primary-container/90 px-3 py-1.5 text-xs text-inverse-on-surface shadow-md backdrop-blur-xs border border-primary-fixed-dim/20">
                <span className="h-2 w-2 rounded-full bg-on-tertiary-container animate-pulse" />
                <div>
                    <span className="font-semibold text-surface-bright block">Active GPS Track</span>
                    <span className="font-mono text-[10px] text-primary-fixed-dim">Accuracy ±4m · Sat Lock</span>
                </div>
            </div>

            {/* Tactical Compass Badge */}
            <div className="pointer-events-none absolute bottom-3 right-3 z-10 flex items-center justify-center rounded-lg bg-surface-container-lowest/90 p-1.5 text-on-surface-variant shadow-xs backdrop-blur-xs border border-outline-variant/30">
                <span className="material-symbols-outlined text-[18px]">explore</span>
            </div>
        </div>
    );
}
