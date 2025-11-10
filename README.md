# CartelBot - Automated Binance Trading Bot

An automated cryptocurrency trading bot that executes trades on Binance Spot market based on user-submitted signals.

## Project Status

Milestone 1: Project Setup & Foundation - COMPLETED

## Tech Stack

- **Framework**: Next.js 14.2 with App Router
- **Language**: TypeScript 5.3
- **Styling**: TailwindCSS 3.4
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: NextAuth.js (planned)
- **Encryption**: AES-256-GCM for API keys
- **API Integration**: Binance Spot API (REST + WebSocket)

## Project Structure

```
cartelbot/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── auth/         # Authentication endpoints
│   │   ├── signals/      # Signal processing
│   │   ├── trades/       # Trade execution
│   │   └── webhooks/     # External webhooks
│   ├── dashboard/        # Dashboard pages
│   ├── signals/          # Signal management
│   ├── settings/         # User settings
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Home page
├── components/            # React components
│   ├── ui/               # shadcn/ui components
│   ├── dashboard/        # Dashboard components
│   └── signals/          # Signal components
├── lib/                   # Core libraries
│   ├── binance/          # Binance API client
│   ├── db/               # Database utilities & models
│   ├── parser/           # Signal parser
│   ├── encryption/       # Security utilities
│   ├── config/           # Environment configuration
│   └── utils/            # Helper functions
├── types/                 # TypeScript type definitions
├── hooks/                 # Custom React hooks
├── styles/               # Global styles
└── public/               # Static assets
```

## MongoDB Schemas

- **User**: User accounts with encrypted API keys
- **Signal**: Parsed trading signals
- **Trade**: Trade execution records with buy/sell orders
- **Subscription**: User subscription management
- **WebSocketSession**: Active WebSocket connections

## Getting Started

### Prerequisites

- Node.js 20 LTS
- npm 10+
- MongoDB Atlas account

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env.local` from `.env.example`:
   ```bash
   cp .env.example .env.local
   ```

4. Update `.env.local` with your credentials:
   - MongoDB connection string
   - Generate encryption keys: `openssl rand -hex 32`
   - Binance API keys (use testnet for development)

### Development

Start the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

### Build

```bash
npm run build
```

### Type Checking

```bash
npm run type-check
```

### Linting

```bash
npm run lint
```

## Environment Variables

See `.env.example` for required environment variables:

- `DATABASE_URL`: MongoDB connection string
- `ENCRYPTION_KEY`: 32-character encryption key for API keys
- `JWT_SECRET`: 32-character secret for JWT tokens
- `NEXTAUTH_SECRET`: 32-character secret for NextAuth
- `BINANCE_API_URL`: Binance API endpoint (testnet for dev)
- `BINANCE_WS_URL`: Binance WebSocket endpoint

## Security Features

- AES-256-GCM encryption for API keys
- PBKDF2 key derivation with salt
- HMAC SHA256 for request signing
- Environment validation with Zod
- Secure database connection pooling

## Next Steps (Milestone 2)

- Implement magic link authentication
- Create user management system
- Build authentication API endpoints
- Setup session management

## Documentation

- See `PLANNING.md` for project architecture
- See `TASKS.md` for development roadmap
- See `CLAUDE.md` for development guidelines

## License

Private - All rights reserved
