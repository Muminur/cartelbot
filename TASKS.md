# TASKS.md - CartelBot Development Tasks

## Instructions
- Mark completed tasks with [x]
- Add new tasks as discovered
- Update progress notes in comments
- Follow milestones sequentially

---

## Milestone 1: Project Setup & Foundation ✓ COMPLETED
**Goal**: Establish development environment and basic application structure

### Environment Setup
- [x] Initialize Next.js 14 project with TypeScript and App Router
- [x] Configure TailwindCSS and shadcn/ui
- [x] Setup ESLint and Prettier configurations
- [x] Create folder structure as per PLANNING.md
- [x] Setup Git repository and .gitignore

### Database Setup
- [ ] Create MongoDB Atlas cluster (User needs to do this)
- [x] Setup database connection utility
- [x] Define Mongoose schemas for all collections:
  - [x] User schema
  - [x] Signal schema
  - [x] Trade schema
  - [x] Subscription schema
  - [x] WebSocketSession schema
- [x] Create database indexes for performance
- [x] Setup connection pooling

### Configuration
- [x] Create .env.example with all required variables
- [x] Setup environment validation with Zod
- [x] Configure Next.js for production deployment
- [ ] Setup error boundary components (Defer to Milestone 7)
- [ ] Implement global error handler (Defer to Milestone 7)

---

## Milestone 2: Authentication System ✓ COMPLETED
**Goal**: Implement secure magic link authentication

### Magic Link Authentication
- [x] Setup Resend API integration
- [x] Create auth API endpoints:
  - [x] POST /api/auth/magic-link - Send magic link
  - [x] GET /api/auth/verify - Verify token
  - [x] POST /api/auth/logout - Clear session
  - [x] GET /api/auth/session - Check session
- [x] Implement JWT token generation
- [x] Setup secure HTTP-only cookies
- [x] Create authentication middleware
- [x] Build login/signup page UI
- [x] Add loading states and error handling

### User Management
- [x] Create user profile page (dashboard)
- [x] Implement email verification flow
- [x] Add session management
- [x] Create protected route wrapper (middleware)
- [x] Build user settings interface

---

## Milestone 3: Signal Parser Development
**Goal**: Build robust signal parsing engine for text and images

### Text Signal Parser
- [ ] Create signal parser service
- [ ] Implement pattern recognition for:
  - [ ] Symbol extraction ($NEAR → NEARUSDT)
  - [ ] Entry price parsing (single and range)
  - [ ] Target parsing (percentage and absolute)
  - [ ] Stop loss extraction
  - [ ] CMP (Current Market Price) handling
- [ ] Add support for multiple formats:
  - [ ] Format 1: First/Second buying pattern
  - [ ] Format 2: Entry range pattern
  - [ ] Format 3: Percentage-based targets
- [ ] Create validation rules for parsed data
- [ ] Build error handling for invalid formats

### OCR Integration
- [ ] Setup Tesseract.js
- [ ] Create image upload endpoint
- [ ] Implement image preprocessing
- [ ] Build OCR text extraction
- [ ] Connect OCR output to text parser
- [ ] Add image validation (size, format)
- [ ] Create fallback for OCR failures

### Parser Testing
- [ ] Create unit tests for all signal patterns
- [ ] Test with sample signals from signal_example.md
- [ ] Add edge case handling
- [ ] Performance optimization for parsing

---

## Milestone 4: Binance API Integration
**Goal**: Implement complete Binance REST API and WebSocket integration

### API Client Setup
- [ ] Create Binance service class
- [ ] Implement request signing (HMAC SHA256)
- [ ] Add time synchronization mechanism
- [ ] Setup rate limit tracking
- [ ] Create retry logic with exponential backoff
- [ ] Implement both testnet and mainnet configurations

### REST API Endpoints
- [ ] Implement core endpoints:
  - [ ] GET /api/v3/exchangeInfo - Symbol validation
  - [ ] GET /api/v3/time - Server time sync
  - [ ] GET /api/v3/account - Account info
  - [ ] GET /api/v3/ticker/24hr - Price data
- [ ] Implement trading endpoints:
  - [ ] POST /api/v3/order - MARKET buy orders
  - [ ] POST /api/v3/order/oco - OCO sell orders
  - [ ] GET /api/v3/openOrders - Active orders
  - [ ] GET /api/v3/allOrders - Order history
  - [ ] DELETE /api/v3/order - Cancel order

### Filter Validation
- [ ] Implement symbol filters:
  - [ ] PRICE_FILTER (minPrice, maxPrice, tickSize)
  - [ ] LOT_SIZE (minQty, maxQty, stepSize)
  - [ ] MIN_NOTIONAL
  - [ ] MARKET_LOT_SIZE
- [ ] Create price/quantity formatter utility
- [ ] Add validation before order placement

---

## Milestone 5: WebSocket Integration
**Goal**: Implement real-time trade monitoring via WebSocket

### WebSocket Manager
- [ ] Create WebSocket connection manager
- [ ] Implement user data stream:
  - [ ] POST /api/v3/userDataStream - Create listen key
  - [ ] PUT /api/v3/userDataStream - Keep alive
  - [ ] DELETE /api/v3/userDataStream - Close stream
- [ ] Setup auto-reconnection logic
- [ ] Implement heartbeat mechanism (30-minute interval)

### Event Handling
- [ ] Handle WebSocket events:
  - [ ] executionReport - Order updates
  - [ ] outboundAccountPosition - Balance changes
  - [ ] listStatus - OCO order updates
- [ ] Create event parser and router
- [ ] Update database on events
- [ ] Emit events to frontend via Server-Sent Events

### Connection Management
- [ ] Implement connection pooling
- [ ] Add connection state monitoring
- [ ] Create fallback for disconnections
- [ ] Build reconnection with backoff

---

## Milestone 6: Trade Execution Engine
**Goal**: Build the core trading engine with proper risk management

### Buy Order Execution
- [ ] Create trade executor service
- [ ] Implement MARKET buy logic
- [ ] Add position sizing calculations:
  - [ ] Fixed USDT amount
  - [ ] Percentage of balance
  - [ ] Risk-based sizing (2% rule)
- [ ] Validate sufficient balance
- [ ] Handle partial fills
- [ ] Store order details in database

### OCO Sell Orders
- [ ] Implement OCO order creation
- [ ] Calculate target distributions (75/15/10 default)
- [ ] Add price adjustment for filters
- [ ] Create multiple OCO orders for targets
- [ ] Link OCO orders to original buy
- [ ] Handle OCO order updates

### Risk Management
- [ ] Implement maximum position size limits
- [ ] Add daily loss limits
- [ ] Create emergency stop functionality
- [ ] Build manual intervention system
- [ ] Add trade approval workflow (for testing)

---

## Milestone 7: User Interface Development
**Goal**: Create intuitive and responsive user interface

### Dashboard
- [ ] Build main dashboard layout
- [ ] Create dashboard widgets:
  - [ ] Active signals card
  - [ ] Open positions table
  - [ ] Account balance display
  - [ ] P&L charts
  - [ ] Recent trades list
- [ ] Add real-time updates via SSE
- [ ] Implement responsive design

### Signal Management
- [ ] Create signal submission page:
  - [ ] Text input form
  - [ ] Image upload with preview
  - [ ] Parsed data display
  - [ ] Confirmation dialog
- [ ] Build signal history page
- [ ] Add signal status tracking
- [ ] Create signal edit/cancel functionality

### Trade Management
- [ ] Build active trades view
- [ ] Create trade history table
- [ ] Add filters and search
- [ ] Implement CSV export
- [ ] Build trade detail modal
- [ ] Add manual close position button

### Settings Pages
- [ ] Create API key management:
  - [ ] Secure input fields
  - [ ] Encryption status indicator
  - [ ] Test connection button
- [ ] Build trade settings:
  - [ ] Default trade amount
  - [ ] Target distributions
  - [ ] Risk parameters
- [ ] Add notification preferences

---

## Milestone 8: Subscription System
**Goal**: Implement subscription tiers and payment verification

### Subscription Management
- [ ] Create subscription tiers logic:
  - [ ] Free tier (1 signal/month)
  - [ ] Premium tier ($3/month)
  - [ ] Pro tier ($10/month)
- [ ] Build subscription status checker
- [ ] Implement usage limits enforcement
- [ ] Add subscription expiry handling

### Payment Processing
- [ ] Create USDT payment interface
- [ ] Build TRC20 transaction verification
- [ ] Add manual payment approval system
- [ ] Implement payment history
- [ ] Create subscription renewal reminders

---

## Milestone 9: Admin Dashboard
**Goal**: Build comprehensive admin interface

### User Management
- [ ] Create admin authentication
- [ ] Build user list with search/filters
- [ ] Add user detail view
- [ ] Implement account suspension
- [ ] Create subscription override controls

### System Monitoring
- [ ] Build system health dashboard
- [ ] Add API rate limit monitor
- [ ] Create WebSocket connection viewer
- [ ] Implement error log viewer
- [ ] Add trade statistics dashboard

### Signal Monitoring
- [ ] Create all signals view
- [ ] Add signal approval system (if needed)
- [ ] Build parsing success metrics
- [ ] Add manual signal override

---

## Milestone 10: Testing & Quality Assurance
**Goal**: Ensure application reliability and performance

### Unit Testing
- [ ] Write tests for signal parser
- [ ] Test Binance API client
- [ ] Test trade executor logic
- [ ] Test database operations
- [ ] Test authentication flow

### Integration Testing
- [ ] Test complete signal flow
- [ ] Test trade execution flow
- [ ] Test WebSocket events
- [ ] Test payment verification
- [ ] Test rate limiting

### End-to-End Testing
- [ ] Setup Playwright/Cypress
- [ ] Test user registration
- [ ] Test signal submission
- [ ] Test trade execution
- [ ] Test subscription flow

### Performance Testing
- [ ] Load test API endpoints
- [ ] Test WebSocket scaling
- [ ] Database query optimization
- [ ] Frontend performance audit

---

## Milestone 11: Security Hardening
**Goal**: Implement comprehensive security measures

### API Security
- [ ] Implement API key encryption (AES-256-GCM)
- [ ] Add request signing verification
- [ ] Setup rate limiting per endpoint
- [ ] Implement IP whitelisting (optional)
- [ ] Add audit logging

### Application Security
- [ ] Setup CSP headers
- [ ] Implement XSS protection
- [ ] Add CSRF tokens
- [ ] Setup security headers
- [ ] Implement input sanitization
- [ ] Add SQL injection prevention

### Infrastructure Security
- [ ] Configure firewall rules
- [ ] Setup DDoS protection
- [ ] Implement backup strategy
- [ ] Create incident response plan
- [ ] Setup monitoring alerts

---

## Milestone 12: Deployment & DevOps
**Goal**: Deploy application to production

### Docker Setup
- [ ] Create Dockerfile
- [ ] Setup docker-compose
- [ ] Configure environment variables
- [ ] Optimize image size
- [ ] Setup health checks

### Coolify Deployment
- [ ] Configure Coolify application
- [ ] Setup GitHub integration
- [ ] Configure domains
- [ ] Setup SSL certificates
- [ ] Configure auto-deployment
- [ ] Setup resource limits

### Monitoring Setup
- [ ] Configure Sentry error tracking
- [ ] Setup application logging
- [ ] Implement performance monitoring
- [ ] Create uptime monitoring
- [ ] Setup alert notifications

### Production Readiness
- [ ] Run production checklist
- [ ] Perform security audit
- [ ] Complete load testing
- [ ] Create rollback plan
- [ ] Document deployment process

---

## Milestone 13: Documentation
**Goal**: Create comprehensive documentation

### User Documentation
- [ ] Write user guide
- [ ] Create FAQ section
- [ ] Build video tutorials
- [ ] Write API documentation

### Developer Documentation
- [ ] Create API reference
- [ ] Write setup guide
- [ ] Document architecture
- [ ] Create contribution guidelines

### Operations Documentation
- [ ] Write deployment guide
- [ ] Create troubleshooting guide
- [ ] Document backup procedures
- [ ] Write incident response plan

---

## Milestone 14: Launch & Post-Launch
**Goal**: Successfully launch and maintain application

### Pre-Launch
- [ ] Beta testing with limited users
- [ ] Fix critical bugs
- [ ] Performance optimization
- [ ] Final security review

### Launch
- [ ] Deploy to production
- [ ] Monitor system stability
- [ ] Handle user onboarding
- [ ] Gather initial feedback

### Post-Launch
- [ ] Monitor error rates
- [ ] Optimize based on usage
- [ ] Implement user feedback
- [ ] Plan future features

---

## Bug Fixes & Improvements
*Add bugs and improvements here as discovered*

### Bugs
- [x] **MongoDB Connection Timeout in Magic Link Verification** (Fixed: Nov 10, 2025)
  - Issue: Magic link verification failing with "Server selection timed out after 5000 ms"
  - Root Cause: MongoDB server unreachable + insufficient timeout + no retry logic
  - Fixes Applied:
    - Increased `serverSelectionTimeoutMS` from 5000ms to 30000ms
    - Increased `connectTimeoutMS` to 30000ms
    - Added retry logic with exponential backoff (3 attempts: 1s, 2s, 4s delays)
    - Enhanced error handling with user-friendly messages
    - Improved logging for better diagnostics
  - Files Modified:
    - `lib/db/connection.ts` - Connection configuration and retry logic
    - `app/api/auth/verify/route.ts` - Enhanced error handling
  - Documentation: `docs/mongodb-connection-fix.md`
  - Status: Code fixed, but MongoDB server at 66.179.240.208:5999 is still unreachable
  - Action Required: Fix VPS MongoDB connectivity or migrate to MongoDB Atlas

### Performance Improvements
- [x] **Database Connection Resilience** (Nov 10, 2025)
  - Added connection pooling with minPoolSize: 1
  - Implemented heartbeat monitoring (10-second intervals)
  - Enabled retryWrites and retryReads for better reliability

### Feature Requests
- [ ] [New feature from user feedback]

---

## Notes

### Priority Order
1. Core functionality (parsing, trading)
2. Security and reliability
3. User interface polish
4. Advanced features
5. Optimizations

### Testing Protocol
- Always test on Binance Testnet first
- Use small amounts for initial mainnet tests
- Monitor all trades closely during beta

### Critical Paths
- Signal parsing → Trade execution
- Authentication → API key management
- WebSocket connection → Real-time updates

---

**Last Updated**: November 2024
**Current Milestone**: 2 - Authentication System (COMPLETED)
**Next Milestone**: 3 - Signal Parser Development
**Overall Progress**: 33/200 tasks completed (Milestone 1: ✓, Milestone 2: ✓)
