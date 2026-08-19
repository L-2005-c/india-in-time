'use strict';

const {
  evaluateTourismEligibility,
  filterEligibleTourismCandidates,
  calculateTourismQuality,
  calculatePopularityScore,
  classifyCategory,
  resolveSourceAuthority,
  validateTourismData,
  isBlacklisted,
  isWhitelistedLandmark,
  TOURISM_CATEGORIES,
  NON_TOURISM_CATEGORIES,
  TOURISM_TIERS,
} = require('../services/travelIntelligence/tourismPoi');

describe('Tourism POI Eligibility Engine & Quality Scoring', () => {

  describe('1. Blacklist & Locality Filtering', () => {
    test('strictly rejects known Visakhapatnam/Vizag localities', () => {
      const vizagLocalities = [
        'Marripalem', 'Seethammadhara', 'Dwaraka Nagar', 'Gajuwaka',
        'Madhurawada', 'MVP Colony', 'Siripuram', 'Pendurthi',
        'Akkayyapalem', 'Kurmannapalem', 'NAD Junction', 'Kancharapalem',
      ];

      for (const locality of vizagLocalities) {
        const check = isBlacklisted(locality, { city: 'Visakhapatnam' });
        expect(check.isBlacklisted).toBe(true);
        expect(check.reason).toMatch(/residential|locality|blacklist/i);

        const evaluation = evaluateTourismEligibility({ name: locality, cat: 'scenic', coords: [17.72, 83.30] }, { city: 'Visakhapatnam' });
        expect(evaluation.isEligible).toBe(false);
        expect(evaluation.tier).toBe(TOURISM_TIERS.REJECT);
        expect(evaluation.rejectionReason).toMatch(/locality|residential/i);
      }
    });

    test('rejects generic non-tourist infrastructure and commercial entities', () => {
      const nonTouristEntities = [
        'Apollo Pharmacy', 'State Bank of India ATM', 'Zilla Parishad High School',
        'Care Hospital', 'Central Police Station', 'KSRTC Bus Stand',
        'Sai Residency Apartments', 'Sri Balaji Xerox & Stationery',
      ];

      for (const entity of nonTouristEntities) {
        const check = isBlacklisted(entity);
        expect(check.isBlacklisted).toBe(true);

        const evalResult = evaluateTourismEligibility({ name: entity, coords: [17.72, 83.30] });
        expect(evalResult.isEligible).toBe(false);
        expect(evalResult.tier).toBe(TOURISM_TIERS.REJECT);
      }
    });

    test('allows whitelisted heritage transport landmarks', () => {
      const whitelisted = 'Chhatrapati Shivaji Maharaj Terminus';
      expect(isWhitelistedLandmark(whitelisted)).toBe(true);

      const evalResult = evaluateTourismEligibility({
        name: whitelisted,
        coords: [18.940, 72.835],
        rating: 4.7,
        reviews: 35000,
        ot: '00:00',
        ct: '23:59',
      });
      expect(evalResult.isEligible).toBe(true);
      expect(evalResult.category).toBe(TOURISM_CATEGORIES.HERITAGE_SITE);
    });
  });

  describe('2. Tourism Category Classification', () => {
    test('correctly classifies beaches, museums, viewpoints, temples, and shopping malls', () => {
      expect(classifyCategory({ name: 'Ramakrishna Beach', cat: 'beach' }).category).toBe(TOURISM_CATEGORIES.BEACH);
      expect(classifyCategory({ name: 'INS Kursura Submarine Museum', cat: 'museum' }).category).toBe(TOURISM_CATEGORIES.MUSEUM);
      expect(classifyCategory({ name: 'Kailasagiri Viewpoint', cat: 'scenic' }).category).toBe(TOURISM_CATEGORIES.VIEWPOINT);
      expect(classifyCategory({ name: 'Simhachalam Temple', cat: 'temple' }).category).toBe(TOURISM_CATEGORIES.TEMPLE);
      expect(classifyCategory({ name: 'CMR Central', cat: 'shopping' }).category).toBe(TOURISM_CATEGORIES.SHOPPING_MALL);
      expect(classifyCategory({ name: 'Inorbit Mall Visakhapatnam', cat: 'shopping' }).category).toBe(TOURISM_CATEGORIES.SHOPPING_MALL);
      expect(classifyCategory({ name: 'Venkatadri Vantillu', cat: 'food' }).category).toBe(TOURISM_CATEGORIES.FOOD_DESTINATION);
    });

    test('classifies unverified non-tourist map entities as invalid', () => {
      const commercial = classifyCategory({ name: 'Generic Commercial Complex 123' });
      expect(commercial.isTourismValid).toBe(false);
      expect(commercial.category).toBe(NON_TOURISM_CATEGORIES.GENERIC_COMMERCIAL_AREA);

      const unknown = classifyCategory({ name: 'Unspecified Map Feature Point' });
      expect(unknown.isTourismValid).toBe(false);
      expect(unknown.category).toBe(NON_TOURISM_CATEGORIES.UNKNOWN_MAP_ENTITY);
    });
  });

  describe('3. Bayesian Popularity & Quality Scoring', () => {
    test('ensures high review volume with good rating outranks low review volume with slightly higher rating', () => {
      // 4.6 with 8,000 reviews vs 4.8 with 10 reviews
      const highVolumeScore = calculatePopularityScore(4.6, 8000);
      const lowVolumeScore = calculatePopularityScore(4.8, 10);

      expect(highVolumeScore).toBeGreaterThan(lowVolumeScore);
    });

    test('assigns TIER S to iconic signature attractions and TIER A to major attractions', () => {
      const rkBeach = {
        name: 'Ramakrishna Beach',
        cat: 'beach',
        coords: [17.7142, 83.3237],
        rating: 4.6,
        reviews: 24500,
        importance: 'must_see',
        isCurated: true,
        ot: '05:30',
        ct: '21:00',
        vt: 90,
      };
      const classification = classifyCategory(rkBeach);
      const quality = calculateTourismQuality(rkBeach, classification);

      expect(quality.qualityScore).toBeGreaterThanOrEqual(90);
      expect(quality.tier).toBe(TOURISM_TIERS.TIER_S);
    });

    test('assigns REJECT tier to non-tourist or blacklisted candidates', () => {
      const locality = {
        name: 'Marripalem',
        cat: 'scenic',
        coords: [17.75, 83.25],
      };
      const classification = classifyCategory(locality, { city: 'Visakhapatnam' });
      const quality = calculateTourismQuality(locality, classification);

      expect(quality.tier).toBe(TOURISM_TIERS.REJECT);
      expect(quality.qualityScore).toBe(0);
    });
  });

  describe('4. Data Source Hierarchy & Provenance', () => {
    test('curated internal sources receive higher weight than unverified LLM discoveries', () => {
      const curated = resolveSourceAuthority({ isCurated: true });
      const llm = resolveSourceAuthority({ source: 'llm_discovery' });

      expect(curated.weight).toBeGreaterThan(llm.weight);
      expect(curated.isCuratedOrOfficial).toBe(true);
      expect(llm.isCuratedOrOfficial).toBe(false);
    });
  });

  describe('5. Data Validator', () => {
    test('flags invalid coordinates, times, or durations', () => {
      expect(validateTourismData({ name: 'X' }).isValid).toBe(false);
      expect(validateTourismData({ name: 'Valid Place', coords: [95, 200] }).isValid).toBe(false);
      expect(validateTourismData({ name: 'Valid Place', coords: [17.7, 83.3], ot: '25:00' }).isValid).toBe(false);
      expect(validateTourismData({ name: 'Valid Place', coords: [17.7, 83.3], vt: 1000 }).isValid).toBe(false);
      expect(validateTourismData({ name: 'Valid Place', coords: [17.7, 83.3], ot: '09:00', ct: '18:00', vt: 60 }).isValid).toBe(true);
    });
  });

  describe('6. Candidate Filtering Orchestration', () => {
    test('filters out all localities and non-tourist candidates from mixed input array', () => {
      const candidates = [
        { name: 'Ramakrishna Beach', cat: 'beach', coords: [17.7142, 83.3237], rating: 4.6, reviews: 24000, ot: '05:30', ct: '21:00', vt: 90, isCurated: true },
        { name: 'Marripalem', cat: 'scenic', coords: [17.75, 83.25], ot: '06:00', ct: '20:00' },
        { name: 'INS Kursura Submarine Museum', cat: 'scenic', coords: [17.7172, 83.3301], rating: 4.7, reviews: 18000, ot: '10:00', ct: '20:00', vt: 60, isCurated: true },
        { name: 'Seethammadhara', cat: 'scenic', coords: [17.74, 83.31] },
        { name: 'CMR Central', cat: 'shopping', coords: [17.7265, 83.3155], rating: 4.4, reviews: 14000, ot: '10:30', ct: '22:00', vt: 75, isCurated: true },
        { name: 'Dwaraka Nagar Colony', cat: 'scenic', coords: [17.73, 83.31] },
      ];

      const { eligible, rejected, stats } = filterEligibleTourismCandidates(candidates, { city: 'Visakhapatnam' });

      expect(eligible.length).toBe(3);
      expect(rejected.length).toBe(3);
      expect(stats.eligibleCount).toBe(3);
      expect(stats.rejectedCount).toBe(3);

      const eligibleNames = eligible.map((p) => p.name);
      expect(eligibleNames).toContain('Ramakrishna Beach');
      expect(eligibleNames).toContain('INS Kursura Submarine Museum');
      expect(eligibleNames).toContain('CMR Central');

      expect(eligibleNames).not.toContain('Marripalem');
      expect(eligibleNames).not.toContain('Seethammadhara');
      expect(eligibleNames).not.toContain('Dwaraka Nagar Colony');

      const rejectedNames = rejected.map((r) => r.name);
      expect(rejectedNames).toContain('Marripalem');
      expect(rejectedNames).toContain('Seethammadhara');
      expect(rejectedNames).toContain('Dwaraka Nagar Colony');
    });
  });

});
