/**
 * Client-side observability: error tracking, performance monitoring, analytics
 * Integrates Sentry for error tracking and web-vitals for performance metrics
 */

const isProduction = import.meta.env.PROD;
const sentryDSN = import.meta.env.VITE_SENTRY_DSN;

let sentryClient = null;
let analyticsConsent = false;

/**
 * Initialize Sentry for error tracking
 */
export async function initializeSentry() {
  if (!sentryDSN || !isProduction) {
    console.debug('[Observability] Sentry not configured or dev mode');
    return;
  }
  
  try {
    const Sentry = await import('@sentry/browser');
    
    Sentry.init({
      dsn: sentryDSN,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1,
      maxBreadcrumbs: 50,
      integrations: [
        new Sentry.Replay({
          maskAllText: true,
          blockAllMedia: true,
        }),
      ],
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
    });
    
    sentryClient = Sentry;
    setupGlobalErrorHandlers();
    console.debug('[Observability] Sentry initialized');
  } catch (err) {
    console.error('[Observability] Failed to initialize Sentry:', err);
  }
}

/**
 * Capture an error with Sentry
 */
export function captureException(error, context = {}) {
  if (sentryClient) {
    sentryClient.captureException(error, {
      contexts: {
        app: context,
      },
    });
  } else {
    console.error('[Observability] Error captured (Sentry not ready):', error, context);
  }
}

/**
 * Capture a custom message
 */
export function captureMessage(message, level = 'info') {
  if (sentryClient) {
    sentryClient.captureMessage(message, level);
  }
}

/**
 * Track custom event (analytics)
 */
export function trackEvent(name, properties = {}) {
  if (!analyticsConsent) {
    return;
  }
  
  try {
    // Send to backend analytics endpoint
    navigator.sendBeacon('/api/events', JSON.stringify({
      event: name,
      timestamp: new Date().toISOString(),
      properties,
    }));
  } catch (err) {
    console.warn('[Observability] Failed to track event:', err);
  }
}

/**
 * Initialize Web Vitals monitoring
 */
export async function initializeWebVitals() {
  if (!isProduction) {
    return;
  }
  
  try {
    const { getCLS, getFID, getFCP, getLCP, getTTFB } = await import('web-vitals');
    
    // Cumulative Layout Shift
    getCLS(({ value, name }) => {
      reportVital(name, value);
    });
    
    // First Input Delay
    getFID(({ value, name }) => {
      reportVital(name, value);
    });
    
    // First Contentful Paint
    getFCP(({ value, name }) => {
      reportVital(name, value);
    });
    
    // Largest Contentful Paint
    getLCP(({ value, name }) => {
      reportVital(name, value);
    });
    
    // Time to First Byte
    getTTFB(({ value, name }) => {
      reportVital(name, value);
    });
  } catch (err) {
    console.warn('[Observability] Failed to initialize Web Vitals:', err);
  }
}

/**
 * Report vital metric to Sentry and analytics
 */
function reportVital(name, value) {
  const level = getVitalSeverity(name, value);
  
  if (sentryClient) {
    sentryClient.captureMessage(`Web Vital: ${name} = ${value.toFixed(2)}`, level);
  }
  
  // Also track as event
  trackEvent('web_vital', { metric: name, value, level });
}

/**
 * Determine severity of vital metric
 */
function getVitalSeverity(name, value) {
  const thresholds = {
    CLS: { warning: 0.1, error: 0.25 },
    FID: { warning: 100, error: 300 },
    FCP: { warning: 1800, error: 3000 },
    LCP: { warning: 2500, error: 4000 },
    TTFB: { warning: 500, error: 1000 },
  };
  
  const threshold = thresholds[name];
  if (!threshold) return 'info';
  
  if (value >= threshold.error) return 'error';
  if (value >= threshold.warning) return 'warning';
  return 'info';
}

/**
 * Setup global error handlers
 */
function setupGlobalErrorHandlers() {
  // Uncaught errors
  window.addEventListener('error', (event) => {
    captureException(event.error, {
      type: 'uncaught_error',
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });
  
  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    captureException(event.reason, {
      type: 'unhandled_rejection',
    });
  });
}

/**
 * Set analytics consent
 */
export function setAnalyticsConsent(consent) {
  analyticsConsent = consent;
  localStorage.setItem('india-in-time:analytics-consent', JSON.stringify(consent));
}

/**
 * Check if user has consented to analytics
 */
export function getAnalyticsConsent() {
  const saved = localStorage.getItem('india-in-time:analytics-consent');
  return saved ? JSON.parse(saved) : false;
}

/**
 * Initialize observability stack
 */
export async function initializeObservability() {
  // Restore analytics consent from localStorage
  if (getAnalyticsConsent()) {
    setAnalyticsConsent(true);
  }
  
  // Initialize Sentry error tracking
  await initializeSentry();
  
  // Initialize Web Vitals monitoring
  await initializeWebVitals();
  
  console.debug('[Observability] Stack initialized');
}
