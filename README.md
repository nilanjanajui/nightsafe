# NightSafe

NightSafe is a wearable distress-detection capstone system. A Raspberry Pi 5 listens for Bangla distress phrases, classifies them in two stages, reads heart rate and GPS coordinates, and texts saved emergency contacts. A Next.js Progressive Web Application (PWA) paired with an Express/Socket.IO/MongoDB backend allows the device owner to pair their hardware unit, monitor live telemetry, review past alerts, and manage emergency contacts.

## Repository Structure

- `server/`: Express 5, Socket.IO, Mongoose, and TypeScript backend API and real-time telemetry relay.
- `web/`: Next.js App Router, Tailwind CSS v4, and TypeScript frontend PWA.
- `pi/`: Python 3.11+ daemon (package `nsd`) running on the Raspberry Pi 5.

## Architectural Facts & Constraints

- **SMS Delivery**: SMS alerts leave the Raspberry Pi 5 via the Textbee HTTPS API; a linked Android phone with its own active SIM card delivers the messages over cellular networks. The SIM808 module on the device is used strictly for GPS location fixes.
- **Audio Privacy**: Audio is processed entirely on-device and is never recorded, stored, or transmitted. Only the matched transcript text, heart rate, and GPS coordinates of actual alert events are stored in MongoDB. Live telemetry is relayed in real time over WebSockets and is not persisted.
- **Transport Security**: Client-server and device communications use standard HTTPS and WSS (TLS). There is no proprietary AES encryption layer, mesh network, Bluetooth connectivity, or battery telemetry.
- **Sensors**: Heart rate measurements originate from a hobbyist ECG sensor for threshold detection, not medical diagnosis.
- **Account Model**: One hardware device per user account.

## Getting Started

### 1. Server Setup

Navigate to the `server/` directory, install dependencies, and configure environment variables:

```bash
cd server
npm install
cp .env.example .env
```

#### Environment Variables (Server)
- `PORT`
- `MONGODB_URI`
- `JWT_SECRET`
- `CORS_ORIGIN`
- `DEVICE_TOKEN`

Start the development server:

```bash
npm run dev
```

### 2. Web Frontend Setup

Navigate to the `web/` directory, install dependencies, and configure environment variables:

```bash
cd web
npm install
cp .env.example .env.local
```

#### Environment Variables (Web)
- `NEXT_PUBLIC_API_URL`

Start the Next.js development server:

```bash
npm run dev
```

### 3. Database Seeding & Mock Device Simulation

From the `server/` directory:

- **Seed a New Device**: Generates a new hardware device with authentication token and 8-character pairing code:
  ```bash
  npm run seed
  ```
- **Inspect Configured Device**: Prints the pairing code and current owner for the configured `DEVICE_TOKEN`:
  ```bash
  npm run device
  ```
- **Run Mock Device Simulator**: Simulates a physical unit emitting live heart rate, GPS coordinates, and sample distress alerts:
  ```bash
  npm run mock
  ```

## Raspberry Pi Daemon

For setup, dependencies, hardware pinouts, and running the `nsd` daemon on the physical Raspberry Pi 5, refer to [pi/README.md](file:///home/nilanjana/Web%20Development/nightsafe/pi/README.md).

