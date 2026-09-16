const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const timeIntelRouter = require('../routes/time-intelligence');
const itineraryRouter = require('../routes/itinerary-optimizer');
const { isPermanentlyClosedPlace } = require('../services/travelIntelligence/tourismPoi/tourismBlacklist');
const { suggestOpenAlternatives, rankPlacesForDay } = require('../services/travelIntelligence');
const { clusterPlaces, buildMultiDayItinerary } = require('../services/travelIntelligence/multiDayPlanner');
const { getCitySeeds } = require('../data/city-seeds');

function createApp() {
  const a = express();
  a.use(express.json());
  a.use('/api/time-intelligence', timeIntelRouter);
  a.use('/api/itinerary', itineraryRouter);
  return a;
}

// Safely load frontend cities in Jest CJS environment
function loadFrontendCitiesModule() {
  const citiesPath = path.resolve(__dirname, '../frontend/app-src/src/data/cities.js');
  let code = fs.readFileSync(citiesPath, 'utf8');
  code = code.replace(/import\s+[^;]+;\s*/g, '');
  code = code.replace(/export\s*\{[^}]*\};?/, 'module.exports = { CITIES, LOCAL_PLACE_SEEDS, HIDDEN_GEM_SEEDS, getLocalPlaces, getHiddenGems };');
  const mod = { exports: {} };
  const fn = new Function('module', 'exports', 'isPermanentlyClosedPlace', code);
  fn(mod, mod.exports, isPermanentlyClosedPlace);
  return mod.exports;
}

describe('Permanently Closed Places Eradication Suite', () => {
  describe('isPermanentlyClosedPlace detection engine', () => {
    it('detects closures across diverse name patterns', () => {
      const closedNames = [
        'Fantasy Land (Permanently Closed)',
        'Appu Ghar (Closed)',
        'Great India Place Water Park (Shut Down)',
        'Old Museum (Closed Down)',
        'Heritage Haveli - Permanently Shut',
        'Historic Fort (Ceased Operations)',
        'Coastal Aquarium (Out of Business)',
        'Former Victoria Public Hall',
        'Abandoned Theme Park',
        'Demolished Cinema Hall',
      ];

      closedNames.forEach((name) => {
        expect(isPermanentlyClosedPlace({ name })).toBe(true);
      });
    });

    it('detects known defunct Indian attractions even without closed in the name', () => {
      const defunctAttractions = [
        { name: 'MGM Selvee Water World', coords: [17.7, 83.3] },
        { name: 'EsselWorld Mumbai', coords: [19.2, 72.8] },
        { name: 'Dash N Splash', coords: [13.0, 80.2] },
        { name: 'Dolphin City Chennai', coords: [12.8, 80.2] },
        { name: 'Coral Reef Aquarium Vizag', coords: [17.7, 83.3] },
      ];

      defunctAttractions.forEach((attraction) => {
        expect(isPermanentlyClosedPlace(attraction)).toBe(true);
      });
    });

    it('detects closures via operational status and boolean flags', () => {
      expect(isPermanentlyClosedPlace({ name: 'Valid Beach', operational_status: 'CLOSED_PERMANENTLY' })).toBe(true);
      expect(isPermanentlyClosedPlace({ name: 'Valid Beach', operational_status: 'CLOSED' })).toBe(true);
      expect(isPermanentlyClosedPlace({ name: 'Valid Beach', isPermanentlyClosed: true })).toBe(true);
      expect(isPermanentlyClosedPlace({ name: 'Valid Beach', permanentlyClosed: true })).toBe(true);
      expect(isPermanentlyClosedPlace({ name: 'Valid Beach', is_closed: true })).toBe(true);
    });

    it('detects closures hidden inside description or notes', () => {
      expect(isPermanentlyClosedPlace({ name: 'Secret Garden', description: 'This park is permanently closed due to construction.' })).toBe(true);
      expect(isPermanentlyClosedPlace({ name: 'Old Library', why: 'Out of business since 2021.' })).toBe(true);
    });

    it('does not falsely flag legitimate open tourist attractions', () => {
      const openPlaces = [
        { name: 'Ramakrishna Beach', cat: 'beach', coords: [17.7142, 83.3237] },
        { name: 'INS Kursura Submarine Museum', cat: 'scenic', coords: [17.7172, 83.3301] },
        { name: 'Kailasagiri', cat: 'scenic', coords: [17.7492, 83.3418] },
        { name: 'Simhachalam Temple', cat: 'temple', coords: [17.7666, 83.2501] },
      ];

      openPlaces.forEach((place) => {
        expect(isPermanentlyClosedPlace(place)).toBe(false);
      });
    });
  });

  describe('suggestOpenAlternatives & rankPlacesForDay', () => {
    const candidates = [
      { name: 'Open Beach A', cat: 'beach', coords: [17.7, 83.3], ot: '06:00', ct: '20:00' },
      { name: 'Open Beach B', cat: 'beach', coords: [17.71, 83.31], ot: '06:00', ct: '20:00' },
      { name: 'Closed Beach (Permanently Closed)', cat: 'beach', coords: [17.72, 83.32], ot: '06:00', ct: '20:00' },
      { name: 'MGM Selvee Water World', cat: 'beach', coords: [17.73, 83.33], ot: '06:00', ct: '20:00' },
    ];

    it('suggestOpenAlternatives never recommends permanently closed places', () => {
      const closedBase = { name: 'Some Closed Spot', cat: 'beach' };
      const now = new Date('2026-06-15T10:00:00+05:30');
      const alts = suggestOpenAlternatives(closedBase, candidates, now);

      expect(alts).toContain('Open Beach A');
      expect(alts).toContain('Open Beach B');
      expect(alts).not.toContain('Closed Beach (Permanently Closed)');
      expect(alts).not.toContain('MGM Selvee Water World');
    });

    it('rankPlacesForDay excludes permanently closed places from results', () => {
      const now = new Date('2026-06-15T10:00:00+05:30');
      const ranked = rankPlacesForDay(candidates, now);
      const names = ranked.map((r) => r.place.name);

      expect(names).toContain('Open Beach A');
      expect(names).toContain('Open Beach B');
      expect(names).not.toContain('Closed Beach (Permanently Closed)');
      expect(names).not.toContain('MGM Selvee Water World');
    });
  });

  describe('multiDayPlanner geographic clustering & itinerary', () => {
    const mixedPlaces = [
      { name: 'Open Spot 1', coords: [17.71, 83.31], cat: 'scenic', vt: 60, ot: '08:00', ct: '18:00' },
      { name: 'Open Spot 2', coords: [17.72, 83.32], cat: 'scenic', vt: 60, ot: '08:00', ct: '18:00' },
      { name: 'Open Spot 3', coords: [17.73, 83.33], cat: 'scenic', vt: 60, ot: '08:00', ct: '18:00' },
      { name: 'Old Park (Permanently Closed)', coords: [17.74, 83.34], cat: 'scenic', vt: 60, ot: '08:00', ct: '18:00' },
      { name: 'EsselWorld', coords: [17.75, 83.35], cat: 'scenic', vt: 60, ot: '08:00', ct: '18:00' },
    ];

    it('clusterPlaces excludes permanently closed places from all clusters', () => {
      const { clusters, withoutCoords } = clusterPlaces(mixedPlaces, 2);
      const allClustered = clusters.flat();

      expect(allClustered.some((p) => p.name.includes('Closed'))).toBe(false);
      expect(allClustered.some((p) => p.name === 'EsselWorld')).toBe(false);
      expect(withoutCoords.some((p) => p.name.includes('Closed'))).toBe(false);
    });

    it('buildMultiDayItinerary never schedules permanently closed places', async () => {
      const plan = await buildMultiDayItinerary(mixedPlaces, {
        startDate: '2026-06-15',
        days: 2,
        originCoords: [17.71, 83.31],
      });

      const scheduledNames = plan.itinerary.flatMap((day) => day.stops.map((s) => s.name));
      expect(scheduledNames).not.toContain('Old Park (Permanently Closed)');
      expect(scheduledNames).not.toContain('EsselWorld');
    });
  });

  describe('Time Intelligence API Endpoints (/api/time-intelligence)', () => {
    const apiCandidates = [
      { name: 'Ramakrishna Beach', cat: 'beach', coords: [17.7142, 83.3237], ot: '05:30', ct: '21:00' },
      { name: 'Kailasagiri', cat: 'scenic', coords: [17.7492, 83.3418], ot: '06:00', ct: '20:00' },
      { name: 'MGM Selvee Water World', cat: 'scenic', coords: [17.7, 83.3], ot: '09:00', ct: '18:00' },
      { name: 'Defunct Museum (Permanently Closed)', cat: 'scenic', coords: [17.72, 83.32], ot: '09:00', ct: '18:00' },
    ];

    it('POST /recommend excludes permanently closed places', async () => {
      const res = await request(createApp())
        .post('/api/time-intelligence/recommend')
        .send({ places: apiCandidates });

      expect(res.status).toBe(200);
      const names = res.body.recommendations.map((r) => r.name);
      expect(names).toContain('Ramakrishna Beach');
      expect(names).toContain('Kailasagiri');
      expect(names).not.toContain('MGM Selvee Water World');
      expect(names).not.toContain('Defunct Museum (Permanently Closed)');
    });

    it('POST /status excludes permanently closed places from results', async () => {
      const res = await request(createApp())
        .post('/api/time-intelligence/status')
        .send({ places: apiCandidates });

      expect(res.status).toBe(200);
      const names = res.body.places.map((p) => p.name);
      expect(names).toContain('Ramakrishna Beach');
      expect(names).not.toContain('MGM Selvee Water World');
      expect(names).not.toContain('Defunct Museum (Permanently Closed)');
    });

    it('POST /advice returns permanently closed status and 0 score for closed place', async () => {
      const res = await request(createApp())
        .post('/api/time-intelligence/advice')
        .send({ place: { name: 'Defunct Park (Permanently Closed)', cat: 'scenic' } });

      expect(res.status).toBe(200);
      expect(res.body.advice).toContain('permanently closed');
      expect(res.body.intel.visitScore).toBe(0);
      expect(res.body.intel.visitLabel).toBe('Permanently Closed');
    });
  });

  describe('Itinerary Optimizer API Endpoints (/api/itinerary)', () => {
    it('POST /cluster excludes permanently closed places', async () => {
      const places = [
        { name: 'Kailasagiri', coords: [17.7492, 83.3418] },
        { name: 'Tenneti Park', coords: [17.7484, 83.3495] },
        { name: 'Defunct Park (Shut Down)', coords: [17.7480, 83.3450] },
      ];

      const res = await request(createApp())
        .post('/api/itinerary/cluster')
        .send({ places, centerCoord: [17.749, 83.345], radiusKm: 2 });

      expect(res.status).toBe(200);
      const foundNames = (res.body.clusters || []).flatMap((c) => [
        c.mainPlace?.name,
        ...(c.nearbyPlaces || []).map((n) => n.place?.name),
      ]).filter(Boolean);

      expect(foundNames).toContain('Kailasagiri');
      expect(foundNames).not.toContain('Defunct Park (Shut Down)');
    });
  });

  describe('Frontend Seed & Hidden Gem Providers', () => {
    const { getLocalPlaces, getHiddenGems } = loadFrontendCitiesModule();

    it('getLocalPlaces returns only open places without any defunct attractions', () => {
      const vizagPlaces = getLocalPlaces('vizag', 'Visakhapatnam');
      expect(vizagPlaces.length).toBeGreaterThan(10);
      vizagPlaces.forEach((p) => {
        expect(isPermanentlyClosedPlace(p)).toBe(false);
      });
    });

    it('getHiddenGems returns only open attractions', () => {
      const vizagGems = getHiddenGems('vizag');
      expect(vizagGems.length).toBeGreaterThan(0);
      vizagGems.forEach((g) => {
        expect(isPermanentlyClosedPlace(g)).toBe(false);
      });
    });
  });
});
