"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

const pinIcon = L.divIcon({
    className: "bg-transparent",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;">
        <span style="position:absolute;width:24px;height:24px;border-radius:50%;background:#ef4444;opacity:0.4;"></span>
        <span style="position:relative;width:14px;height:14px;border-radius:50%;border:2px solid #ffffff;background:#dc2626;box-shadow:0 1px 3px rgba(0,0,0,0.3);"></span>
    </div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
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
        <div className="relative h-64 w-full overflow-hidden rounded-xl border border-slate-200">
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
        </div>
    );
}

