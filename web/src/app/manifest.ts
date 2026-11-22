import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "NightSafe",
        short_name: "NightSafe",
        description: "Personal safety device dashboard",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#f5f7fd",
        theme_color: "#0f172a",
        icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
    };
}