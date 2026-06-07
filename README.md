# Aivory User Dashboard

Aivory User Dashboard — Next.js application for authenticated users to access diagnostic results, blueprints, workflows, and AI console.

## Tech Stack

- Next.js
- React
- TypeScript

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Local Development

```bash
npm install
npm run dev
```

The app runs on [http://localhost:9001](http://localhost:9001).

### Environment Variables

Copy `.env.example` to `.env.local` and fill in the required values.

```bash
cp .env.example .env.local
```

## Docker

```bash
docker build -t avry-user-dashboard .
docker run -p 9001:9001 avry-user-dashboard
```

Or with Docker Compose:

```bash
docker-compose up -d
```

## VPS Deployment

1. SSH into the VPS
2. Pull the latest image or build from source
3. Run via Docker Compose behind the Nginx reverse proxy
4. The service is exposed internally on port 9001 and proxied through Nginx

```bash
docker-compose -f docker-compose.yml up -d --build
```
