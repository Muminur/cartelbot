# PLANNING.md - CartelBot Project Planning Document

## Project Vision

CartelBot is an automated cryptocurrency trading bot that democratizes professional trading strategies by automatically executing trades on Binance Spot market based on user-submitted signals. The platform bridges the gap between trading signal providers and execution, eliminating manual trade placement and emotion-based decisions.

### Core Value Proposition
- **Automation**: Convert text/image signals into executed trades within seconds
- **Risk Management**: Automatic OCO (One-Cancels-Other) orders for take-profit and stop-loss
- **Accessibility**: Simple interface for non-technical traders
- **Security**: Enterprise-grade encryption for API keys and user data
- **Reliability**: Real-time WebSocket monitoring for trade updates

## System Architecture

### High-Level Architecture
```
┌────────────────────────────────────────────────────────────┐
│                        Users                               │
│                          ↓                                 │
│                   CloudFlare CDN                           │
│                          ↓                                 │
│              Next.js Frontend (App Router)                 │
│                          ↓                                 │
│              Next.js API Routes (Backend)                  │
│                    ↙     ↓     ↘                          │
│         MongoDB    Binance API   WebSocket                 │
│         Atlas      (REST/WS)     Streams                  │
└────────────────────────────────────────────────────────────┘
```

### Component Architecture
```
Frontend Layer
├── Authentication (Magic Link)
├── Dashboard Components
├── Signal Input (Text/OCR)
├── Trade Management UI
└── Settings Interface

API Layer
├── /api/auth/* - Authentication endpoints
├── /api/signals/* - Signal processing
├── /api/trades/* - Trade execution
├── /api/user/* - User management
└── /api/webhooks/* - External integrations

Service Layer
├── BinanceService - API integration
├── SignalParser - Text/image parsing
├── TradeExecutor - Order management
├── WebSocketManager - Real-time updates
└── EncryptionService - Security

Data Layer
├── MongoDB Collections
├── Redis Cache (future)
└── File Storage (images)
```

## Technology Stack

### Core Technologies

| Category | Technology | Version | Purpose |
|----------|------------|---------|---------|
| **Frontend Framework** | Next.js | 14.2+ | React with SSR/SSG, App Router |
| **Language** | TypeScript | 5.3+ | Type safety and IDE support |
| **Styling** | TailwindCSS | 3.4+ | Utility-first CSS |
| **UI Components** | shadcn/ui | Latest | Accessible component library |
| **State Management** | Zustand | 4.5+ | Lightweight state management |
| **Forms** | React Hook Form | 7.50+ | Form validation and handling |
| **Validation** | Zod | 3.22+ | Schema validation |

### Backend Technologies

| Category | Technology | Version | Purpose |
|----------|------------|---------|---------|
| **Runtime** | Node.js | 20 LTS | JavaScript runtime |
| **Database** | MongoDB | 7.0+ | Document database |
| **ODM** | Mongoose | 8.0+ | MongoDB object modeling |
| **Authentication** | NextAuth.js | 5.0+ | Auth abstraction |
| **Email** | Resend | Latest | Transactional emails |
| **Encryption** | crypto (native) | - | AES-256-GCM encryption |
| **WebSocket** | ws | 8.16+ | WebSocket client |
| **HTTP Client** | Axios | 1.6+ | API requests |
| **Queue** | BullMQ | 5.1+ | Job queuing (future) |

### DevOps & Infrastructure

| Category | Technology | Purpose |
|----------|------------|---------|
| **Hosting** | IONOS VPS | Virtual private server |
| **Container** | Docker | Containerization |
| **Orchestration** | Coolify | Self-hosted PaaS |
| **CDN** | CloudFlare | Content delivery & DDoS protection |
| **SSL** | Let's Encrypt | Free SSL certificates |
| **Monitoring** | Sentry | Error tracking |
| **Analytics** | Plausible | Privacy-focused analytics |
| **Logging** | Winston | Application logging |

### External Services

| Service | Purpose | Integration Method |
|---------|---------|-------------------|
| **Binance API** | Trading execution | REST API + WebSocket |
| **Binance Testnet** | Development testing | REST API + WebSocket |
| **MongoDB Atlas** | Managed database | Connection string |
| **Resend** | Magic link emails | API key |
| **Tesseract.js** | OCR processing | NPM package |
| **TronGrid** | USDT payment verification | REST API |

## Required Tools & Setup

### Development Environment

```bash
# Required Software
- Node.js 20 LTS
- npm 10+ or pnpm 8+
- Git 2.40+
- VS Code (recommended)
- MongoDB Compass (GUI)
- Postman/Insomnia (API testing)

# VS Code Extensions
- ESLint
- Prettier
- TypeScript + JavaScript
- Tailwind CSS IntelliSense
- MongoDB for VS Code
- Thunder Client (API testing)
```

### NPM Dependencies

```json
{
  "dependencies": {
    // Core
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    
    // UI
    "@radix-ui/react-*": "latest",
    "tailwindcss": "^3.4.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "lucide-react": "^0.400.0",
    
    // Database
    "mongoose": "^8.0.0",
    "mongodb": "^6.3.0",
    
    // Authentication
    "next-auth": "^5.0.0",
    "jsonwebtoken": "^9.0.0",
    
    // API & WebSocket
    "axios": "^1.6.0",
    "ws": "^8.16.0",
    
    // Utilities
    "zod": "^3.22.0",
    "react-hook-form": "^7.50.0",
    "zustand": "^4.5.0",
    "date-fns": "^3.3.0",
    "tesseract.js": "^5.0.0",
    
    // Email
    "resend": "^3.0.0",
    
    // Security
    "bcryptjs": "^2.4.0",
    "crypto-js": "^4.2.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0",
    "eslint": "^8.0.0",
    "prettier": "^3.2.0",
    "@testing-library/react": "^14.0.0",
    "vitest": "^1.2.0"
  }
}
```

### Environment Setup

```bash
# 1. Clone repository
git clone https://github.com/your-org/cartelbot.git
cd cartelbot

# 2. Install dependencies
npm install

# 3. Setup environment variables
cp .env.example .env.local
# Edit .env.local with your credentials

# 4. Setup MongoDB
# Create cluster at mongodb.com/atlas
# Get connection string

# 5. Setup Binance Testnet
# Register at testnet.binance.vision
# Generate API keys

# 6. Run development server
npm run dev

# 7. Access application
# http://localhost:3000
```

## Project Structure

```
cartelbot/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   ├── (auth)/            # Auth pages
│   ├── dashboard/         # Dashboard pages
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Home page
├── components/            # React components
│   ├── ui/               # shadcn/ui components
│   ├── dashboard/        # Dashboard components
│   └── signals/          # Signal components
├── lib/                   # Core libraries
│   ├── binance/          # Binance API client
│   ├── db/               # Database utilities
│   ├── parser/           # Signal parser
│   └── utils/            # Helper functions
├── types/                 # TypeScript types
├── hooks/                 # React hooks
├── styles/               # Global styles
├── public/               # Static assets
├── tests/                # Test files
└── docker/               # Docker configs
```

## Security Considerations

### API Key Management
- Encrypt with AES-256-GCM before storage
- Never log or expose in responses
- Implement key rotation mechanism
- Use separate keys for test/production

### Authentication Flow
```
User Email → Magic Link → JWT Token → Session Cookie
                ↓
          Email Verification
                ↓
          Account Creation
                ↓
          API Key Setup
```

### Rate Limiting Strategy
- Global: 1000 requests/minute/IP
- User: 100 requests/minute/user
- Trading: 5 trades/minute/user
- WebSocket: 5 messages/second

## Deployment Strategy

### Coolify Deployment
1. Push to main branch
2. Coolify webhook triggers
3. Docker build initiated
4. Health check performed
5. Blue-green deployment
6. Old container removed

### Production Checklist
- [ ] Environment variables set
- [ ] SSL certificate active
- [ ] Database indexes created
- [ ] Rate limiting configured
- [ ] Error tracking enabled
- [ ] Backups configured
- [ ] Monitoring active
- [ ] Load testing completed

## Performance Targets

| Metric | Target | Critical |
|--------|--------|----------|
| Page Load | < 2s | < 4s |
| API Response | < 500ms | < 2s |
| Trade Execution | < 1s | < 3s |
| WebSocket Latency | < 100ms | < 500ms |
| Database Query | < 100ms | < 500ms |
| Signal Parsing | < 500ms | < 2s |
| Uptime | 99.9% | 99% |

## Testing Strategy

### Test Coverage Requirements
- Unit Tests: 80% coverage
- Integration Tests: Core flows
- E2E Tests: Critical paths
- Load Tests: 100 concurrent users

### Testing Environments
1. **Local**: Developer machine
2. **Testnet**: Binance Testnet integration
3. **Staging**: Production-like environment
4. **Production**: Live system

## Risk Management

### Technical Risks
- API rate limiting → Implement queuing
- WebSocket disconnection → Auto-reconnect
- Database failure → Replica set
- Service downtime → Health monitoring

### Business Risks
- Regulatory compliance → Legal review
- Fund security → No wallet custody
- Signal accuracy → User responsibility
- Platform abuse → Rate limiting

## Success Metrics

### Technical KPIs
- Response time < 500ms (p95)
- Error rate < 0.1%
- Uptime > 99.9%
- Trade success rate > 95%

### Business KPIs
- User activation rate > 50%
- Monthly active users growth > 20%
- Subscription conversion > 5%
- Churn rate < 10%

## Future Considerations

### Phase 2 Features
- Telegram Bot integration
- Multiple exchange support
- Advanced charting
- Backtesting engine

### Scalability Plans
- Microservices architecture
- Kubernetes deployment
- Global CDN
- Read replicas

## Documentation Requirements

- API documentation (OpenAPI/Swagger)
- User guide
- Admin manual
- Developer onboarding
- Security procedures
- Incident response plan

---

**Remember**: Always prioritize security and accuracy over speed. This is a financial application handling real user funds.
