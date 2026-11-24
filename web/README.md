# NightSafe — Web Dashboard

The browser-side of NightSafe. A Next.js 15 App Router application that shows live telemetry from the Pi device, displays the alert history timeline, and lets users manage their safety contacts and hardware settings.

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS v4 |
| Real-time | Socket.IO v4 client (`/client` namespace) |
| Maps | Leaflet + react-leaflet |
| Auth | JWT stored in `localStorage`, managed by `AuthContext` |

---

## Pages

| Route | File | Description |
|-------|------|-------------|
| `/` | `app/(app)/dashboard/page.tsx` | Live telemetry: BPM sparkline, heart rate value, device health, GPS map, recent alerts |
| `/alerts` | `app/(app)/alerts/page.tsx` | Paginated alert history timeline with per-alert SMS and sync audit |
| `/contacts` | `app/(app)/contacts/page.tsx` | Safety circle: add, delete, test-SMS for each contact |
| `/settings` | `app/(app)/settings/page.tsx` | Hardware diagnostic strip, BPM alert threshold slider, account info |
| `/pair` | `app/(app)/pair/page.tsx` | Device pairing flow (enter Device ID + secret) |
| `/login` | `app/(auth)/login/page.tsx` | Email + password login |
| `/register` | `app/(auth)/register/page.tsx` | Account registration |

---

## Key Components

### `components/Sparkline.tsx`
SVG chart that renders the live BPM trend. Features:
- **Auto-scaling Y axis** — min/max computed from the readings array
- **Threshold line** — dashed horizontal line at the configured BPM limit
- **Alert zone** — shaded red band above the threshold
- **Trend path** — polyline through up to 40 readings
- **Latest-point blip** — animated circle on the most recent reading

Props: `readings: number[]`, `threshold: number`, `width`, `height`

### `components/LiveMap.tsx`
Leaflet map showing the device's last known GPS position.
- Renders only when latitude and longitude are available
- Uses a custom pin icon
- `RecenterMap` internal component snaps the viewport to new coordinates
- Label shows the GPS source as "SIM808 GNSS"

---

## Key Hooks

### `hooks/useLive.ts`
Subscribes to the Socket.IO `/client` namespace and maintains live state:

| Event received | What it does |
|----------------|-------------|
| `telemetry` | Updates `bpm`, `gpsLat`, `gpsLon`, `micActive`, `ecgActive`; appends BPM to the 40-reading trend array |
| `device:status` | Sets `online` / `offline` |
| `alert` | Prepends new alert to the alert list |
| `alert:updated` | Patches an existing alert in-place (SMS state change) |

Returns the `Live` object: `{ bpm, gpsLat, gpsLon, micActive, ecgActive, online, alerts, trend }`.

### `hooks/useDevice.ts`
Loads device metadata (name, threshold, paired date) from the REST API once on mount. Re-fetches when `refresh()` is called (e.g. after changing the threshold in Settings).

### `hooks/useNow.ts`
Returns `Date.now()` refreshed on a configurable interval. Used by time-ago labels so they update without a page refresh.

---

## Lib Modules

| File | Purpose |
|------|---------|
| `lib/socket.tsx` | `SocketProvider` context + `useSocket()` hook. Creates one Socket.IO client per session. |
| `lib/auth.tsx` | `AuthProvider` context + `useAuth()` hook. Stores JWT, provides `login()`, `logout()`, `request()`. |
| `lib/types.ts` | Shared TypeScript types: `Device`, `Contact`, `AlertItem`, `Telemetry`, `DeviceStatus`, `SmsStatus`. |
| `lib/format.ts` | Pure formatting utilities: `mapsUrl()`, `formatTime()`, `formatDateTime()`, `ago()`, `dayLabel()`, `uptimeLabel()`, `normalizePhone()`, `smsLabel()`. |

---

## WebSocket Events

The web client connects to the `/client` Socket.IO namespace. All events are **received only** (the client never emits to the server except on initial join).

| Event | Payload | Handler |
|-------|---------|---------|
| `telemetry` | `{ bpm, gpsLat, gpsLon, micActive, ecgActive, … }` | `useLive` → updates live state |
| `device:status` | `{ online: boolean }` | `useLive` → sets online flag |
| `alert` | Full alert object | `useLive` → prepends to alert list |
| `alert:updated` | Partial alert (id + changed fields) | `useLive` → patches alert list |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Yes | Base URL of the backend server, e.g. `https://api.example.com` |

---

## Development

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run lint       # ESLint check
```

> Requires Node.js 20+.

---

## Project Links

- [Root README](../README.md)
- [Server README](../server/README.md)
- [Pi README](../pi/README.md)
- [Full Documentation](../DOCUMENTATION.md)
