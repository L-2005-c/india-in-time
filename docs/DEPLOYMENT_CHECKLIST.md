# Production Deployment Checklist

## Pre-Deployment (1 Week Before)

### Code Quality
- [ ] All tests passing (70%+ coverage)
- [ ] ESLint zero violations
- [ ] No security vulnerabilities (npm audit)
- [ ] Code review completed (2+ approvals)
- [ ] Changelog updated with features/fixes
- [ ] Database migrations tested locally

### Documentation
- [ ] API documentation updated
- [ ] Deployment guide reviewed
- [ ] Architecture decisions documented
- [ ] Known issues/workarounds noted
- [ ] Rollback procedure documented

### Performance
- [ ] Load testing completed (1000+ req/s)
- [ ] Database query optimization verified
- [ ] Cache configuration validated
- [ ] CDN configuration tested
- [ ] Bundle size within limits

### Security
- [ ] Security headers configured
- [ ] SSL/TLS certificates renewed
- [ ] Secrets rotated (API keys, DB passwords)
- [ ] CORS policy reviewed
- [ ] Rate limiting tested
- [ ] WAF rules updated

---

## Day-Of Deployment

### Pre-Deployment
```bash
# 1. Create deployment branch
git checkout -b deploy/v5.3.0

# 2. Verify staging environment
npm run test:smoke        # Staging smoke tests
npm run test:accessibility  # Playwright tests

# 3. Database backup
npm run backup:verify     # Verify backup completes

# 4. Monitoring setup
# - Ensure all dashboards accessible
# - Set up deployment notification
# - Verify on-call rotation
```

### Deployment
```bash
# 1. Blue-green setup
# Deploy to Green environment (inactive)
docker build -t india-in-time:v5.3.0 .
aws ecr push india-in-time:v5.3.0

# 2. Smoke tests on Green
RUN_ENV=green npm run test:smoke
RUN_ENV=green npm run test:e2e

# 3. Database migrations (if needed)
RUN_ENV=green npm run migrate:up

# 4. Health checks
curl https://green.india-in-time.com/api/health

# 5. Traffic cutover (Blue → Green)
aws elb set-load-balancer-listener-ssl-certificate \
  --load-balancer-name prod-lb \
  --load-balancer-port 443 \
  --instance-port 80 \
  --instance-protocol HTTP \
  --ssl-certificate-id arn:aws:iam::...:green

# 6. Monitor Green (5 minutes)
watch -n 1 'curl -s https://api.india-in-time.com/api/health'
watch -n 1 'aws cloudwatch get-metric-statistics ...'

# 7. Verify no error rate increase
if ERROR_RATE > 0.5%
  then rollback_to_blue
else
  promote_green_to_blue
fi
```

### Post-Deployment
```bash
# 1. Announce in #deployments
echo "🚀 v5.3.0 deployed to production at 2024-08-21T14:30:00Z"

# 2. Run acceptance tests
npm run test:production-config

# 3. Verify all regions
curl https://api.india-in-time.com/api/health
curl https://us-api.india-in-time.com/api/health
curl https://eu-api.india-in-time.com/api/health

# 4. Check key metrics
# - P99 latency < 1.5s
# - Error rate < 0.1%
# - Database replication lag < 5s

# 5. Update status page
echo "✅ All systems operational"
```

---

## Rollback Procedure

### Immediate Rollback (< 5 minutes after deploy)
```bash
# If critical errors detected:

# 1. Trigger immediate rollback
aws codedeploy create-deployment \
  --application-name india-in-time \
  --deployment-group-name production \
  --s3-location s3://deployments/v5.2.2/bundle.zip

# 2. Notify team
echo "🔴 ROLLBACK: v5.3.0 → v5.2.2"

# 3. Investigate (run postmortem)
npm run release:audit
```

### Graceful Rollback (after some traffic)
```bash
# 1. Enable feature flag to fallback
aws dynamodb put-item \
  --table-name feature-flags \
  --item '{"flag":{"S":"useNewOptimizer"},"value":{"BOOL":false}}'

# 2. Monitor error rate (should decrease)
# Wait 5 minutes for error rate to return to normal

# 3. Full rollback if needed
aws codedeploy create-deployment ... # v5.2.2
```

---

## Incident Response

### If Issues Detected
```
1. ASSESS (< 2 min)
   ├─ Error rate > 1%?
   ├─ Response time > 5s (p99)?
   ├─ Database connection errors?
   └─ External API failures?

2. ALERT (immediate)
   ├─ Slack #incidents
   ├─ Page on-call engineer
   ├─ Create incident record
   └─ Start war room (Zoom)

3. MITIGATE (< 15 min)
   ├─ Enable circuit breaker
   ├─ Toggle feature flags to safe defaults
   ├─ Scale up if needed
   ├─ Rollback if necessary
   └─ Clear cache if data issues

4. COMMUNICATE (continuous)
   ├─ Update status page
   ├─ Notify stakeholders
   ├─ Post updates every 5 min
   └─ Provide ETA for resolution

5. RESOLVE (ongoing)
   ├─ Fix root cause
   ├─ Deploy hotfix
   ├─ Verify monitoring
   └─ Schedule postmortem

6. POSTMORTEM (next day)
   ├─ Document timeline
   ├─ Root cause analysis
   ├─ Action items
   └─ Process improvements
```

---

## Monitoring During Deployment

### Key Metrics to Watch
```
✓ P50 latency: ____ ms (target: < 100ms)
✓ P95 latency: ____ ms (target: < 500ms)
✓ P99 latency: ____ ms (target: < 1.5s)
✓ Error rate: ____% (target: < 0.1%)
✓ CPU utilization: ___% (target: < 70%)
✓ Memory usage: ___% (target: < 80%)
✓ Database replication lag: ___ms (target: < 5s)
✓ Cache hit ratio: ___% (target: > 80%)
✓ Concurrent users: _____ (expected: ~500-1000)
✓ Request volume: _____ req/s
```

### Dashboard Links
- Grafana: https://monitoring.india-in-time.com
- Datadog: https://app.datadoghq.com
- CloudWatch: https://console.aws.amazon.com/cloudwatch
- Sentry: https://sentry.io/india-in-time

---

## Sign-Off

Deployment completed: _________________ (Date/Time)
Deployed by: _________________________ (Name)
Reviewed by: _________________________ (Name)
All checks passed: ____ (Initial)
