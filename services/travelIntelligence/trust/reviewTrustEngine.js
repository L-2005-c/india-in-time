/**
 * India In-Time v3.0 - Phase 5: Tourist Trust Intelligence
 * Review Trust Engine
 *
 * Evaluates review signals through contextual volume, recency weighting,
 * multi-platform corroboration, and trend-shift detection.
 *
 * Invariants:
 * - NO generic 1-5 star rank ordering.
 * - Low review count != bad business (contextual volume).
 * - Trend shifts are labeled TREND_CHANGE or SERVICE_SHIFT, NEVER "BUSINESS_IS_BAD".
 * - Review clustering/bursts labeled SIGNAL_ANOMALY, NEVER "FAKE REVIEWS" or "FRAUD".
 */

const REVIEW_TRUST_STATES = Object.freeze({
  CONSISTENT_POSITIVE: 'CONSISTENT_POSITIVE',
  STABLE_SUPPORTED: 'STABLE_SUPPORTED',
  RECENT_TREND_CHANGE: 'RECENT_TREND_CHANGE',
  MIXED_SIGNALS: 'MIXED_SIGNALS',
  LIMITED_VOLUME: 'LIMITED_VOLUME',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA'
});

class ReviewTrustEngine {
  constructor(options = {}) {
    this.options = options;
  }

  /**
   * Analyzes multi-source review signals for a place or provider.
   * @param {Object} reviewData
   * @param {Array<Object>} [reviewData.reviews] - Individual review items { text, rating, date, platform, authorId }
   * @param {Object} [reviewData.aggregates] - { googleCount, googleScore, tripAdvisorCount, etc. }
   * @param {Object} [context] - Destination and entity context { isRemoteLocation: boolean, category: string }
   * @returns {Object} review trust evaluation
   */
  evaluateReviews(reviewData = {}, context = {}) {
    const reviews = Array.isArray(reviewData.reviews) ? reviewData.reviews : [];
    const totalCount = reviews.length > 0
      ? reviews.length
      : Number(reviewData.totalCount || 0);

    // Contextual volume thresholds: Remote homestay needs fewer reviews to be meaningful
    const isRemote = Boolean(context.isRemoteLocation);
    const minThreshold = isRemote ? 5 : 15;

    if (totalCount === 0) {
      return {
        trustState: REVIEW_TRUST_STATES.INSUFFICIENT_DATA,
        confidence: 0.1,
        summary: 'No review records available for this listing.',
        signals: {
          totalReviews: 0,
          currentSignal: null,
          historicalSignal: null,
          trendShiftDetected: false,
          platformCount: 0
        },
        observations: [],
        contextualNotice: isRemote
          ? 'Independent remote listings typically have few digital reviews. This does not indicate poor service.'
          : null,
        evaluatedAt: new Date().toISOString()
      };
    }

    if (totalCount < minThreshold && reviews.length === 0) {
      return {
        trustState: REVIEW_TRUST_STATES.LIMITED_VOLUME,
        confidence: 0.4,
        summary: `Limited review volume (${totalCount} review(s)). Contextual evaluation applied.`,
        signals: {
          totalReviews: totalCount,
          currentSignal: null,
          historicalSignal: null,
          trendShiftDetected: false,
          platformCount: 1
        },
        observations: [],
        contextualNotice: isRemote
          ? 'Remote location homestays and regional guides typically have few online reviews.'
          : 'Low review volume observed; ratings may reflect isolated visitor experiences.',
        evaluatedAt: new Date().toISOString()
      };
    }

    // Process reviews by recency
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const oneEightyDaysAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

    const recentReviews = [];
    const historicalReviews = [];
    const platforms = new Set();
    const dates = [];

    for (const r of reviews) {
      if (r.platform) platforms.add(r.platform);
      const rDate = r.date ? new Date(r.date) : now;
      dates.push(rDate);

      if (rDate >= ninetyDaysAgo) {
        recentReviews.push(r);
      } else if (rDate < oneEightyDaysAgo) {
        historicalReviews.push(r);
      }
    }

    // Aggregate sentiments / ratings
    const calcAvg = (arr) => {
      if (arr.length === 0) return null;
      const sum = arr.reduce((acc, cur) => acc + Number(cur.rating || cur.sentimentScore || 0), 0);
      return sum / arr.length;
    };

    const recentAvg = calcAvg(recentReviews);
    const historicalAvg = calcAvg(historicalReviews);

    // Detect Trend Shift
    let trendShiftDetected = false;
    let trendShiftDirection = 'STABLE';
    let trendShiftDescription = null;

    if (recentAvg !== null && historicalAvg !== null && recentReviews.length >= 3) {
      const diff = recentAvg - historicalAvg;
      if (diff <= -1.0) {
        trendShiftDetected = true;
        trendShiftDirection = 'DECLINING';
        trendShiftDescription = 'Recent reviews (last 90 days) indicate an operational shift or service change differing from historical performance.';
      } else if (diff >= 1.0) {
        trendShiftDetected = true;
        trendShiftDirection = 'IMPROVING';
        trendShiftDescription = 'Recent reviews show a noticeable positive shift in guest experience compared to older records.';
      }
    }

    // Detect Temporal Burst / Cluster Anomalies
    const observations = [];
    if (reviews.length >= 8) {
      // Check if > 50% of reviews arrived in a 48h window
      const sortedDates = [...dates].sort((a, b) => a - b);
      let maxInWindow = 0;
      for (let i = 0; i < sortedDates.length; i++) {
        let count = 1;
        for (let j = i + 1; j < sortedDates.length; j++) {
          if (sortedDates[j] - sortedDates[i] <= 48 * 60 * 60 * 1000) {
            count++;
          } else {
            break;
          }
        }
        if (count > maxInWindow) maxInWindow = count;
      }

      if (maxInWindow / reviews.length >= 0.60) {
        observations.push({
          type: 'TEMPORAL_BURST_ANOMALY',
          description: `${Math.round((maxInWindow / reviews.length) * 100)}% of total reviews appeared within a single 48-hour window. Temporal clustering noted.`,
          severity: 'WATCH'
        });
      }
    }

    // Determine review trust state
    let trustState = REVIEW_TRUST_STATES.STABLE_SUPPORTED;
    let confidence = 0.75;
    let summary = 'Review signals show stable, consistent visitor feedback across observation periods.';

    if (trendShiftDetected) {
      trustState = REVIEW_TRUST_STATES.RECENT_TREND_CHANGE;
      confidence = 0.80;
      summary = trendShiftDescription;
    } else if (observations.some(o => o.type === 'TEMPORAL_BURST_ANOMALY')) {
      trustState = REVIEW_TRUST_STATES.MIXED_SIGNALS;
      confidence = 0.60;
      summary = 'Review cadence shows concentrated submission patterns. Emphasizing verified longitudinal signals.';
    } else if (totalCount < minThreshold) {
      trustState = REVIEW_TRUST_STATES.LIMITED_VOLUME;
      confidence = 0.50;
      summary = `Limited review volume (${totalCount} review(s)). Contextual evaluation applied.`;
    } else if (recentAvg !== null && recentAvg >= 4.0) {
      trustState = REVIEW_TRUST_STATES.CONSISTENT_POSITIVE;
      confidence = 0.88;
      summary = 'Consistently positive operational signals across recent and historical guest reports.';
    }

    return {
      trustState,
      confidence,
      summary,
      signals: {
        totalReviews: totalCount,
        recentReviewCount: recentReviews.length,
        historicalReviewCount: historicalReviews.length,
        recentAvg: recentAvg !== null ? Number(recentAvg.toFixed(2)) : null,
        historicalAvg: historicalAvg !== null ? Number(historicalAvg.toFixed(2)) : null,
        trendShiftDetected,
        trendShiftDirection,
        platformCount: platforms.size || 1
      },
      observations,
      contextualNotice: totalCount < minThreshold && isRemote
        ? 'Independent remote listings typically have few digital reviews. This does not indicate poor service.'
        : null,
      evaluatedAt: new Date().toISOString()
    };
  }
}

module.exports = {
  ReviewTrustEngine,
  REVIEW_TRUST_STATES
};
