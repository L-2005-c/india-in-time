# India In-Time: FAANG-Grade Engineering Standards

## Executive Summary

India In-Time is architected as a **production-grade GeoAI platform** meeting FAANG-level standards for scalability, reliability, security, and developer experience. This document outlines the engineering excellence framework.

---

## 1. Architecture & System Design

### 1.1 Microservices-Ready Monolith
```
Current: Node.js Express monolith with clear service boundaries
Target: Service mesh ready (Istio/linkerd compatible)

Services:
├── API Gateway (request routing, rate limiting)
├── Places Discovery (AI-powered place detection)
├── Itinerary Optimizer (smart route planning)
├── Time Intelligence (predictive analytics)
├── Travel Data (festivals, weather, crowds)
├── GeoAI Engine (Gemini + deterministic models)
└── Analytics Pipeline (event streaming)
```

### 1.2 Data Architecture
- **Primary Store**: PostgreSQL 16 (Neon serverless)
- **Cache Layer**: Redis (write-through LRU)
- **Search Index**: Ready for Elasticsearch integration
- **Analytics**: Event streaming to data warehouse
- **Realtime**: WebSocket support (via ws library)

### 1.3 Observability Stack (OTEL-Compatible)
```
┌─────────────────────────────────────┐
│   Application (Express, Node.js)    │
├─────────────────────────────────────┤
│ OpenTelemetry Instrumentation       │
│ ├─ Traces (jaeger-compatible)       │
│ ├─ Metrics (prometheus-compatible)  │
│ └─ Logs (structured JSON)           │
├─────────────────────────────────────┤
│ Tracing: Jaeger / Datadog           │
│ Metrics: Prometheus / Grafana       │
│ Logs: ELK / Splunk                  │
│ Errors: Sentry / Bugsnag            │
└─────────────────────────────────────┘
```

---

## 2. Code Quality & Development

### 2.1 Testing Strategy (70%+ Coverage Target)
```javascript
// Unit tests (Jest)
__tests__/
├── unit/          // Services, utilities
├── integration/   // API routes, DB queries
├── e2e/           // Playwright accessibility + performance
├── load/          // Artillery/k6 performance tests
└── fixtures/      // Test data, factories

// Coverage Thresholds (enforced in CI)
Statements:  70%+
Branches:    60%+
Functions:   70%+
Lines:       70%+
```

### 2.2 Linting & Code Standards
```bash
# ESLint configuration (airbnb-style)
npm run lint          # Enforce standards
npm run lint:fix      # Auto-fix violations

# Prettier (auto-formatting)
prettier --write '**/*.js'

# Architecture validation
npm run check:architecture  # Dependency rules

# Security audit
npm run security:audit      # High/critical CVEs
```

### 2.3 CI/CD Pipeline
```yaml
# GitHub Actions Workflow
On: [push, pull_request]

Jobs:
  1. Lint (2 min)
     - ESLint
     - Prettier check
  
  2. Test (8 min)
     - Unit tests (70% coverage)
     - Integration tests
  
  3. Security (3 min)
     - npm audit
     - Dependency scanning
  
  4. Build (5 min)
     - Frontend Vite build
     - Bundle size check
  
  5. E2E (10 min)
     - Playwright accessibility
     - Performance testing
  
  6. Deploy (5 min)
     - Docker build
     - Staging deployment
     - Smoke tests
```

### 2.4 Code Review Standards
- **Minimum 2 approvals** for main branch
- **CODEOWNERS** enforced (architecture, security, frontend)
- **Semantic commit messages** (conventional commits)
- **Changeset tracking** for release notes

---

## 3. Scalability & Performance

### 3.1 Performance Targets (FAANG-Grade)
```
API Response Times:
├── p50:   < 100ms   (median)
├── p95:   < 500ms   (95th percentile)
├── p99:   < 1.5s    (99th percentile)
└── p100:  < 5s      (maximum)

Throughput:
├── 1,000 req/sec sustained (single instance)
├── 10,000 concurrent users (with autoscaling)
└── 100+ places/query optimized

Availability:
├── 99.95% uptime SLA (4.38 hours/year downtime)
├── <30s RTO (Recovery Time Objective)
└── <5min RPO (Recovery Point Objective)
```

### 3.2 Caching Strategy (3-Tier)
```javascript
// L1: In-Memory LRU (Node.js process)
const placesCache = new LRUCache({
  max: 500,
  ttl: 30 * 60 * 1000,  // 30 minutes
  updateAgeOnGet: true
});

// L2: Redis (shared across workers)
await redis.set(key, JSON.stringify(data), 'EX', 1800);

// L3: Database (source of truth)
// PostgreSQL with prepared statements
```

### 3.3 Database Optimization
```sql
-- Indexes for common queries
CREATE INDEX idx_places_city_coords ON places(city, coords);
CREATE INDEX idx_itinerary_user_date ON itinerary(user_id, created_at DESC);
CREATE INDEX idx_analytics_timestamp ON analytics(timestamp DESC);

-- Partitioning for large tables
CREATE TABLE analytics_2024_q1 PARTITION OF analytics
  FOR VALUES FROM ('2024-01-01') TO ('2024-04-01');

-- Connection pooling (pgBouncer)
pool_mode = transaction  // Min latency
default_pool_size = 25
reserve_pool_size = 5
```

### 3.4 Autoscaling Configuration
```yaml
# Kubernetes HPA (Horizontal Pod Autoscaler)
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: india-in-time-app
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: india-in-time
  minReplicas: 3
  maxReplicas: 50
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

---

## 4. Security & Compliance

### 4.1 Security Headers (Production)
```javascript
// Helmet.js configuration
app.use(helmet());

// Headers enforced:
├── Content-Security-Policy: "default-src 'self'"
├── X-Content-Type-Options: nosniff
├── X-Frame-Options: DENY
├── X-XSS-Protection: 1; mode=block
├── Strict-Transport-Security: max-age=31536000; includeSubDomains
└── Referrer-Policy: strict-origin-when-cross-origin
```

### 4.2 Authentication & Authorization
```
├── Firebase Authentication (sign-in/sign-out)
├── Custom JWT for service-to-service communication
├── Role-based Access Control (RBAC)
│  ├─ admin (full access)
│  ├─ moderator (limited write)
│  ├─ user (read-only by default)
│  └─ service (specific endpoint access)
├── API Key management (service accounts)
└── Audit logging (all admin actions)
```

### 4.3 Data Protection
```
├── Encryption at rest (PostgreSQL + Redis)
├── Encryption in transit (TLS 1.3)
├── Secrets management (AWS Secrets Manager / HashiCorp Vault)
├── Database backups (encrypted, daily, offsite)
├── PII handling (tokenization for sensitive fields)
└── GDPR compliance (data deletion, export)
```

### 4.4 Incident Response
```
1. Detection (Sentry, monitoring alerts)
2. Investigation (logs, traces, metrics)
3. Mitigation (feature flags, gradual rollback)
4. Resolution (fix deployment)
5. Postmortem (automated report generation)
```

---

## 5. Monitoring & Observability

### 5.1 Key Metrics (Golden Signals)
```
1. Latency
   ├─ P50, P95, P99 response times
   ├─ Database query times
   └─ External API call times

2. Traffic
   ├─ Requests per second
   ├─ Concurrent users
   └─ Geographic distribution

3. Errors
   ├─ Error rate by endpoint
   ├─ Error type distribution
   └─ Recovery time

4. Saturation
   ├─ CPU utilization
   ├─ Memory usage
   ├─ Disk I/O
   └─ Database connection pool
```

### 5.2 Alerting Strategy
```
Severity Levels:
├─ P1 (Critical): < 60s response (wake up on-call)
├─ P2 (High): < 15 min response (page immediately)
├─ P3 (Medium): < 1 hour response (next day review)
└─ P4 (Low): < 24 hour response (planning)

Alert Examples:
├─ Error rate > 1% → P1
├─ P99 latency > 2s → P2
├─ Database replication lag > 30s → P1
├─ Disk usage > 80% → P2
└─ API rate limit approaching → P3
```

### 5.3 Observability Implementation
```javascript
// OpenTelemetry Instrumentation
import { NodeTracerProvider } from '@opentelemetry/node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';

const provider = new NodeTracerProvider();
const exporter = new JaegerExporter({
  serviceName: 'india-in-time-api',
  endpoint: 'http://jaeger-collector:14268/api/traces',
});
provider.addSpanProcessor(new BatchSpanProcessor(exporter));

// Automatic instrumentation for Express, PostgreSQL, Redis
```

---

## 6. Reliability & Disaster Recovery

### 6.1 High Availability Architecture
```
                  ┌─────────────────────┐
                  │  Load Balancer      │
                  │  (Layer 7, sticky)  │
                  └────────┬────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
    ┌───▼───┐          ┌───▼───┐         ┌───▼───┐
    │ App 1 │          │ App 2 │         │ App 3 │
    └───┬───┘          └───┬───┘         └───┬───┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                                  │
      ┌───▼─────┐                      ┌────▼────┐
      │ Postgres │                     │  Redis  │
      │ Primary  │ ◄─ Replication ──► │ Cluster │
      └────┬─────┘                     └─────────┘
           │
      ┌────▼──────┐
      │ Standby   │
      │ (Failover)│
      └───────────┘
```

### 6.2 Backup Strategy
```
RPO (Recovery Point Objective): 1 hour
RTO (Recovery Time Objective): 30 minutes

Backup Schedule:
├─ Hourly incremental (AWS S3)
├─ Daily full backup (encrypted)
├─ Weekly offsite replication
├─ Monthly archive (Glacier)
└─ Quarterly restore testing (DR drill)

Verification:
npm run backup:verify          # Weekly
npm run backup:restore-verify  # Monthly
```

### 6.3 Circuit Breaker Pattern
```javascript
// External API calls (Gemini, Maps, etc.)
const circuitBreaker = new CircuitBreaker({
  threshold: 0.5,           // Fail if 50%+ errors
  timeout: 10000,           // 10 second timeout
  voltagePeriod: 60000,     // Check every 60 seconds
  onOpen: () => alert('Circuit opened, using fallback'),
  onHalfOpen: () => alert('Testing recovery'),
});

// Fallback: Use cached data or deterministic models
```

### 6.4 Graceful Degradation
```javascript
// Feature flags for quick rollback
if (getFlag('enableNewAlgorithm')) {
  // Use new itinerary optimizer
  itinerary = await optimizeWithClustering(places);
} else {
  // Fallback to previous algorithm
  itinerary = await optimizeBasic(places);
}
```

---

## 7. DevOps & Infrastructure

### 7.1 Container Strategy
```dockerfile
# Multi-stage build for minimal image size
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
RUN npm run build:frontend

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/frontend/public ./frontend/public
COPY --from=builder /app/dist ./dist
COPY . .

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

EXPOSE 3000
CMD ["node", "server.js"]
```

### 7.2 Infrastructure as Code (Terraform)
```hcl
# main.tf
resource "aws_ecs_cluster" "production" {
  name = "india-in-time-prod"
}

resource "aws_ecs_service" "app" {
  name            = "india-in-time-app"
  cluster         = aws_ecs_cluster.production.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = 3
  launch_type     = "FARGATE"
  
  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "app"
    container_port   = 3000
  }
  
  auto_scaling_group {
    min_capacity = 3
    max_capacity = 50
    target_cpu_utilization = 70
  }
}
```

### 7.3 Environment Management
```
Development
├─ Local Docker Compose
├─ SQLite / local Redis
├─ Mock external APIs
└─ Hot reload (nodemon)

Staging
├─ AWS ECS (3 instances)
├─ AWS RDS PostgreSQL
├─ AWS ElastiCache Redis
├─ Real APIs (rate-limited)
└─ Smoke tests on deploy

Production
├─ AWS ECS (10+ auto-scaling)
├─ AWS RDS (multi-AZ, backups)
├─ AWS ElastiCache (cluster mode)
├─ CloudFront CDN
├─ WAF (DDoS protection)
└─ Blue-green deployment
```

---

## 8. Product & Analytics

### 8.1 Event-Driven Analytics
```javascript
// Events tracked
├─ user_signup
├─ itinerary_created
├─ place_optimized
├─ route_shared
├─ error_occurred
└─ feature_flag_toggled

// Event payload
{
  event_type: 'itinerary_created',
  user_id: 'uuid',
  timestamp: '2024-08-21T12:00:00Z',
  properties: {
    place_count: 15,
    cluster_count: 5,
    optimization_ms: 234,
    platform: 'web|mobile'
  }
}
```

### 8.2 Metrics & Dashboards
```
Business Metrics:
├─ DAU/MAU (Daily/Monthly Active Users)
├─ Itineraries generated per day
├─ Avg places per itinerary
├─ Share rate
├─ Return rate
└─ Feature adoption

Technical Metrics:
├─ API latency (P50, P95, P99)
├─ Error rate by endpoint
├─ Cache hit ratio
├─ Database query times
├─ External API call times
└─ Cost per request
```

---

## 9. Roadmap (Next 12 Months)

### Phase 1 (Months 1-3): Foundation
- [ ] OpenTelemetry full instrumentation
- [ ] Multi-region failover setup
- [ ] Kubernetes migration from ECS
- [ ] Database performance optimization
- [ ] Load testing (1M+ users)

### Phase 2 (Months 4-6): Scalability
- [ ] GraphQL API (alongside REST)
- [ ] Real-time collaboration (WebSocket)
- [ ] Offline-first mobile app (Service Workers)
- [ ] Event streaming (Kafka/Kinesis)
- [ ] Machine learning pipeline (TensorFlow.js)

### Phase 3 (Months 7-9): Intelligence
- [ ] Predictive personalization
- [ ] Anomaly detection (fraud, bot traffic)
- [ ] Recommendation engine (places based on history)
- [ ] Natural language itinerary generation
- [ ] Multimodal search (text + image)

### Phase 4 (Months 10-12): Enterprise
- [ ] SAML/SSO integration
- [ ] Multi-tenant support
- [ ] White-label API
- [ ] SLA monitoring dashboard
- [ ] Advanced access controls

---

## 10. Success Metrics (OKRs)

### Engineering Excellence
```
O1: Achieve 99.95% uptime SLA
  KR1: < 4 hours downtime per year
  KR2: RTO < 30 minutes
  KR3: RPO < 5 minutes

O2: Maintain code quality standards
  KR1: > 70% test coverage (enforced)
  KR2: < 1% critical CVEs
  KR3: < 2 P1 incidents per quarter

O3: Optimize performance
  KR1: P99 latency < 1.5s (all endpoints)
  KR2: Database queries < 100ms (99th percentile)
  KR3: Support 10,000+ concurrent users
```

---

## References

- [Google SRE Book](https://sre.google/books/)
- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [12-Factor App Methodology](https://12factor.net/)
- [Conventional Commits](https://www.conventionalcommits.org/)
