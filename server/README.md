# NightSafe — Backend Server

Express 5 + Socket.IO 4 backend that:
- Authenticates users and stores device, contact, and alert data in MongoDB
- Receives live telemetry from the Pi daemon over the `/device` Socket.IO namespace
- Relays telemetry and alert events to the browser over the `/client` namespace
- Pushes configuration updates (threshold, contacts) back to the device immediately when changed

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Runtime | Node.js 20+ |
| Framework | Express 5 |
| Real-time | Socket.IO 4 |
| Database | MongoDB via Mongoose |
| Language | TypeScript (strict mode) |
| Auth | JWT (`jsonwebtoken`) |

---

## Source Files

| File | Purpose |
|------|---------|
| `src/index.ts` | App entry: creates Express app, applies CORS, calls `connectDb()` and `initSocket()`, starts HTTP server |
| `src/config.ts` | Reads environment variables; `need()` helper throws if a required variable is missing |
| `src/auth.ts` | `signToken()`, `verifyToken()`, `requireAuth()` Express middleware |
| `src/db.ts` | Mongoose schemas (User, Device, Contact, Alert), `alertPayload()` serializer, `connectDb()` |
| `src/routes.ts` | All REST API endpoints (see table below) |
| `src/socket.ts` | Socket.IO namespace setup, telemetry relay, alert handling, config push |

---

## Database Models

### User
```
email        String  unique
passwordHash String
createdAt    Date
```

### Device
```
owner        ObjectId → User
deviceId     String   unique  (set by user at pairing)
secret       String           (bcrypt hash of device secret)
name         String
bpmThreshold Number   default 100
pairedAt     Date
```

### Contact
```
owner  ObjectId → User
name   String
phone  String
```
Maximum 5 contacts per account (enforced in routes).

### Alert
```
device      ObjectId → Device
clientId    String  (UUID4, idempotency key from Pi)
transcript  String
priority    String  ("HIGH" | "MEDIUM")
bpm         Number | null
gpsLat      Number | null
gpsLon      Number | null
smsStatus   String  ("pending" | "sent" | "suppressed" | "expired" | "failed" | "none")
smsError    String | null
synced      Boolean
createdAt   Date
```

---

## REST API Endpoints

All authenticated routes require `Authorization: Bearer <jwt>` header.

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | No | Create account. Body: `{ email, password }` |
| POST | `/api/auth/login` | No | Sign in. Returns `{ token }` |

### Devices

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/devices` | Yes | List devices owned by the current user |
| POST | `/api/devices/pair` | Yes | Pair a new device. Body: `{ deviceId, secret, name }` |
| GET | `/api/devices/:id/alerts` | Yes | Paginated alert history. Query: `?cursor=<date>&limit=20` |
| PATCH | `/api/devices/:id/settings` | Yes | Update `name` and/or `bpmThreshold`. Triggers config push to device. |
| POST | `/api/devices/:id/test-sms` | Yes | Sends a `test:sms` event to the device over Socket.IO |

### Contacts

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/contacts` | Yes | List contacts for the current user |
| POST | `/api/contacts` | Yes | Create contact. Body: `{ name, phone }`. Max 5 total. |
| DELETE | `/api/contacts/:id` | Yes | Delete a contact. Triggers config push to device. |

---

## Socket.IO Namespaces

### `/device` — Pi daemon connects here

**Authentication middleware:** Validates `auth.deviceId` and `auth.secret` against the Device collection (bcrypt compare).

| Event | Direction | Description |
|-------|-----------|-------------|
| `telemetry` | device → server | Live readings. Relayed to all browser clients watching this device. |
| `alert` | device → server | Alert payload. Saved to MongoDB (idempotent via `clientId`). Acknowledged back to device. Relayed to browsers as `alert`. |
| `alert:status` | device → server | SMS delivery status update. Updates `smsStatus` / `smsError` on the Alert document. Relayed to browsers as `alert:updated`. |
| `config:update` | server → device | Pushed whenever contacts or threshold change. Contains current contacts list and bpmThreshold. |
| `test:sms` | server → device | Triggers an on-device test SMS to all configured contacts. |

### `/client` — Browser connects here

**Authentication middleware:** Validates `auth.token` as a JWT, finds the user's device, and joins the socket to that device's room.

| Event | Direction | Description |
|-------|-----------|-------------|
| `telemetry` | server → browser | Forwarded from device. |
| `device:status` | server → browser | `{ online: true/false }` when device connects or disconnects. |
| `alert` | server → browser | New alert (full payload). |
| `alert:updated` | server → browser | Partial alert update (SMS state change). |

---

## Config Push Flow

Whenever a user:
- Creates or deletes a contact, **or**
- Updates the device's `bpmThreshold`

…the server calls `pushConfig(deviceSocket)`, which immediately emits `config:update` to the device with the full contacts list and current threshold. If the device is offline, the update is applied the next time it connects (the device always requests config on reconnect).

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `4000` | HTTP server port |
| `MONGODB_URI` | Yes | — | MongoDB connection string |
| `JWT_SECRET` | Yes | — | Secret for signing JWTs |
| `CORS_ORIGIN` | Yes | — | Allowed CORS origin(s), comma-separated |

---

## Scripts

```bash
npm run dev      # ts-node-dev with hot reload
npm run build    # tsc compile to dist/
npm start        # node dist/index.js
```

---

## Project Links

- [Root README](../README.md)
- [Web README](../web/README.md)
- [Pi README](../pi/README.md)
- [Full Documentation](../DOCUMENTATION.md)

