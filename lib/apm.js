'use strict';
const logger = require('./logger');
const REGION = process.env.REGION || process.env.FLY_REGION || process.env.RENDER_REGION || 'unknown';
const SERVICE = process.env.SERVICE_NAME || 'india-in-time-api';
const RELEASE = process.env.RELEASE_VERSION || '3.3.3';
let sentry = null;
let tried = false;


function validateApmConfig() {
  if (process.env.NODE_ENV === 'production' && process.env.REQUIRE_ERROR_REPORTING === 'true' && !process.env.ERROR_REPORTING_WEBHOOK_URL) {
    throw new Error('REQUIRE_ERROR_REPORTING=true requires ERROR_REPORTING_WEBHOOK_URL');
  }
  return true;
}

function initSentry() {
  if (tried) return sentry;
  tried = true;
  if (!process.env.SENTRY_DSN) return null;
  try {
    const Sentry = require('@sentry/node');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      release: RELEASE,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
      initialScope: { tags: { region: REGION, service: SERVICE } },
    });
    sentry = Sentry;
    logger.info({ module: 'apm' }, 'Sentry initialized');
  } catch (e) {
    logger.warn({ err: e.message }, 'SENTRY_DSN set but @sentry/node missing');
  }
  return sentry;
}

function captureException(err, ctx = {}) {
  logger.error({ err: err?.message, stack: err?.stack, region: REGION, ...ctx }, 'APM exception');
  const S = initSentry();
  if (S) {
    S.withScope((scope) => {
      if (ctx.requestId) scope.setTag('requestId', ctx.requestId);
      if (ctx.userId) scope.setUser({ id: ctx.userId });
      scope.setTag('region', REGION);
      S.captureException(err);
    });
  }
  // NOTE: ERROR_REPORTING_WEBHOOK_URL is intentionally NOT posted to here.
  // middleware/errorHandler.js already POSTs every 5xx error to that same
  // URL (see reportErrorAsync there) before calling captureException — this
  // function used to fire a second, differently-shaped POST to the same
  // endpoint on every single error, which meant any configured Slack/
  // Discord/ingestion webhook received two alerts per incident. Sentry
  // reporting above is unaffected; only the duplicate generic webhook POST
  // was removed.
}

function getApmInfo() {
  return { region: REGION, service: SERVICE, release: RELEASE, sentry: !!process.env.SENTRY_DSN, webhook: !!process.env.ERROR_REPORTING_WEBHOOK_URL };
}

module.exports = { initSentry, captureException, getApmInfo, validateApmConfig, REGION, SERVICE, RELEASE };
