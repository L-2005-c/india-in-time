'use strict';

const {
  parseRequirements,
  filterCandidates,
  candidateMatchesHardRequirements,
  hasUsableCoords,
  isExcludedCategory,
  normalizeCat,
  normalizeMeal,
  placeCost,
  isFoodPlace,
} = require('../services/travelIntelligence/requirementEngine');

describe('requirementEngine — Unit & Branch Coverage Tests', () => {
  describe('normalizeCat', () => {
    it('normalizes known aliases and canonical categories', () => {
      expect(normalizeCat('beaches')).toBe('beach');
      expect(normalizeCat('mandir')).toBe('temple');
      expect(normalizeCat('bazaar')).toBe('market');
      expect(normalizeCat('coffee')).toBe('cafe');
      expect(normalizeCat('cinema')).toBe('entertainment');
    });

    it('handles unknown categories, empty strings, null, and undefined (lines 24-28)', () => {
      expect(normalizeCat('custom_adventure')).toBe('custom_adventure');
      expect(normalizeCat('')).toBeNull();
      expect(normalizeCat(null)).toBeNull();
      expect(normalizeCat(undefined)).toBeNull();
    });
  });

  describe('parseClock and time parsing (lines 36-42)', () => {
    it('accepts numeric minute values directly', () => {
      const req = parseRequirements({ startMin: 540 });
      expect(req.hard.startMin).toBe(540);
    });

    it('parses valid HH:MM strings', () => {
      const req = parseRequirements({ startTime: '08:30', endTime: '18:45' });
      expect(req.hard.startMin).toBe(510);
      expect(req.hard.endMin).toBe(1125);
    });

    it('falls back on invalid time format strings (lines 38-41)', () => {
      const req1 = parseRequirements({ startTime: 'invalid-time', startMin: 'abc' });
      expect(req1.hard.startMin).toBe(540); // default 09:00

      const req2 = parseRequirements({ startTime: '25:00' }); // out of bounds hour
      expect(req2.hard.startMin).toBe(540);

      const req3 = parseRequirements({ startTime: '12:65' }); // out of bounds minute
      expect(req3.hard.startMin).toBe(540);
    });

    it('computes endMin from durationMin when endTime is missing', () => {
      const req = parseRequirements({ startMin: 600, totalDurationMin: 180 });
      expect(req.hard.endMin).toBe(780);
      expect(req.hard.durationMin).toBe(180);
    });
  });

  describe('normalizeMeal (lines 44-49)', () => {
    it('normalizes meal strings and meal objects', () => {
      expect(normalizeMeal('Lunch')).toBe('lunch');
      expect(normalizeMeal({ type: 'Dinner' })).toBe('dinner');
      expect(normalizeMeal({ meal: 'Breakfast' })).toBe('breakfast');
      expect(normalizeMeal({ name: 'Snack' })).toBe('snack');
    });

    it('returns null for empty or invalid meals', () => {
      expect(normalizeMeal(null)).toBeNull();
      expect(normalizeMeal('')).toBeNull();
      expect(normalizeMeal('midnight_feast')).toBeNull();
    });
  });

  describe('isExcludedCategory & keyword matching (lines 51-60)', () => {
    it('excludes places by category alias match', () => {
      expect(isExcludedCategory({ cat: 'temples' }, ['temple'])).toBe(true);
      expect(isExcludedCategory({ cat: 'park' }, ['temple'])).toBe(false);
    });

    it('detects temple keywords in place name', () => {
      expect(isExcludedCategory({ name: 'ISKCON Cultural Center', cat: 'culture' }, ['temple'])).toBe(true);
      expect(isExcludedCategory({ name: 'St. Mary Church', cat: 'monument' }, ['temple'])).toBe(true);
    });

    it('detects beach keywords in place name unless it is a restaurant/cafe', () => {
      expect(isExcludedCategory({ name: 'Marina Beach Promenade', cat: 'scenic' }, ['beach'])).toBe(true);
      expect(isExcludedCategory({ name: 'Bay View Restaurant', cat: 'food' }, ['beach'])).toBe(false);
      expect(isExcludedCategory({ name: 'Beachside Cafe', cat: 'food' }, ['beach'])).toBe(false);
    });
  });

  describe('placeCost (lines 63-72)', () => {
    it('evaluates entry fee keys for entry kind', () => {
      expect(placeCost({ entryFee: 50 }, 'entry')).toBe(50);
      expect(placeCost({ entry_fee: 75 }, 'entry')).toBe(75);
      expect(placeCost({ ticketPrice: 100 }, 'entry')).toBe(100);
      expect(placeCost({ admission: 120 }, 'entry')).toBe(120);
      expect(placeCost({ price: 40 }, 'entry')).toBe(40);
    });

    it('evaluates total cost keys for total kind', () => {
      expect(placeCost({ estimatedCost: 350 }, 'total')).toBe(350);
      expect(placeCost({ cost: 250 }, 'total')).toBe(250);
      expect(placeCost({ price: 150 }, 'total')).toBe(150);
      expect(placeCost({ entryFee: 80 }, 'total')).toBe(80);
    });

    it('returns 0 when no valid numeric cost is present', () => {
      expect(placeCost({}, 'total')).toBe(0);
      expect(placeCost({ cost: -50 }, 'total')).toBe(0);
      expect(placeCost(null, 'entry')).toBe(0);
    });
  });

  describe('isFoodPlace (lines 74-77)', () => {
    it('identifies food places by category and name keywords', () => {
      expect(isFoodPlace({ cat: 'food' })).toBe(true);
      expect(isFoodPlace({ cat: 'cafe' })).toBe(true);
      expect(isFoodPlace({ name: 'Grand Dhaba', cat: 'other' })).toBe(true);
      expect(isFoodPlace({ name: 'Paradise Dining Kitchen', cat: 'other' })).toBe(true);
      expect(isFoodPlace({ name: 'Botanical Garden', cat: 'park' })).toBe(false);
    });
  });

  describe('dietaryCompatible (lines 79-97)', () => {
    it('allows non-food places or empty restrictions unconditionally', () => {
      const place = { name: 'Museum', cat: 'museum' };
      expect(candidateMatchesHardRequirements({ ...place, coords: [17.3, 78.4] }, parseRequirements({ dietaryRestrictions: ['vegan'] })).ok).toBe(true);
    });

    it('evaluates explicit dietary flags dictionary', () => {
      const placeCompatible = {
        name: 'Green Cafe',
        cat: 'food',
        coords: [17.3, 78.4],
        dietary: { vegetarian: true, vegan: true },
      };
      const placeIncompatible = {
        name: 'Mixed Grill',
        cat: 'food',
        coords: [17.3, 78.4],
        dietary: { vegetarian: false },
      };

      const req = parseRequirements({ dietaryRestrictions: ['vegetarian'] });
      expect(candidateMatchesHardRequirements(placeCompatible, req).ok).toBe(true);
      expect(candidateMatchesHardRequirements(placeIncompatible, req).ok).toBe(false);
    });

    it('evaluates direct property flags and negative checks (lines 88-95)', () => {
      const reqVeg = parseRequirements({ dietaryRestrictions: ['vegetarian'] });
      const reqVegan = parseRequirements({ dietaryRestrictions: ['vegan'] });
      const reqHalal = parseRequirements({ dietaryRestrictions: ['halal'] });
      const reqJain = parseRequirements({ dietaryRestrictions: ['jain'] });

      expect(candidateMatchesHardRequirements({ name: 'Veg House', cat: 'food', coords: [17.3, 78.4], vegetarian: true }, reqVeg).ok).toBe(true);
      expect(candidateMatchesHardRequirements({ name: 'Veg House 2', cat: 'food', coords: [17.3, 78.4], veg: true }, reqVeg).ok).toBe(true);
      expect(candidateMatchesHardRequirements({ name: 'Non-veg House', cat: 'food', coords: [17.3, 78.4], vegetarian: false }, reqVeg).ok).toBe(false);
      expect(candidateMatchesHardRequirements({ name: 'Non-veg House 2', cat: 'food', coords: [17.3, 78.4], veg: false }, reqVeg).ok).toBe(false);

      expect(candidateMatchesHardRequirements({ name: 'Vegan Delight', cat: 'food', coords: [17.3, 78.4], vegan: true }, reqVegan).ok).toBe(true);
      expect(candidateMatchesHardRequirements({ name: 'Not Vegan', cat: 'food', coords: [17.3, 78.4], vegan: false }, reqVegan).ok).toBe(false);

      expect(candidateMatchesHardRequirements({ name: 'Halal Express', cat: 'food', coords: [17.3, 78.4], halal: true }, reqHalal).ok).toBe(true);
      expect(candidateMatchesHardRequirements({ name: 'Non-halal Grill', cat: 'food', coords: [17.3, 78.4], halal: false }, reqHalal).ok).toBe(false);

      expect(candidateMatchesHardRequirements({ name: 'Jain Kitchen', cat: 'food', coords: [17.3, 78.4], jain: true }, reqJain).ok).toBe(true);
      expect(candidateMatchesHardRequirements({ name: 'Not Jain', cat: 'food', coords: [17.3, 78.4], jain: false }, reqJain).ok).toBe(false);

      // Unknown without positive evidence fails hard requirement
      expect(candidateMatchesHardRequirements({ name: 'Unknown Cafe', cat: 'food', coords: [17.3, 78.4] }, reqVeg).ok).toBe(false);
    });
  });

  describe('accessibilityCompatible (lines 99-113)', () => {
    it('evaluates explicit accessibility dictionary and alias fallbacks', () => {
      const reqWheelchair = parseRequirements({ accessibilityRequirements: ['wheelchair'] });
      const reqStroller = parseRequirements({ accessibilityRequirements: ['stroller'] });
      const reqMobility = parseRequirements({ accessibilityRequirements: ['mobility'] });

      const placeWithDict = {
        name: 'Modern Mall',
        cat: 'shopping',
        coords: [17.3, 78.4],
        accessibility: { wheelchair: true },
      };
      const placeDictFalse = {
        name: 'Old Tower',
        cat: 'monument',
        coords: [17.3, 78.4],
        accessibility: { wheelchair: false },
      };

      expect(candidateMatchesHardRequirements(placeWithDict, reqWheelchair).ok).toBe(true);
      expect(candidateMatchesHardRequirements(placeDictFalse, reqWheelchair).ok).toBe(false);

      // Alias properties
      expect(candidateMatchesHardRequirements({ name: 'Ramp Park', cat: 'park', coords: [17.3, 78.4], wheelchair_accessible: true }, reqWheelchair).ok).toBe(true);
      expect(candidateMatchesHardRequirements({ name: 'Paved Walk', cat: 'park', coords: [17.3, 78.4], stroller_accessible: true }, reqStroller).ok).toBe(true);
      expect(candidateMatchesHardRequirements({ name: 'Flat Walkway', cat: 'park', coords: [17.3, 78.4], mobility_accessible: true }, reqMobility).ok).toBe(true);

      // Inaccessible without evidence
      expect(candidateMatchesHardRequirements({ name: 'Steep Steps', cat: 'monument', coords: [17.3, 78.4] }, reqWheelchair).ok).toBe(false);
    });
  });

  describe('safetyCompatible & transportCompatible (lines 115-128)', () => {
    it('handles safety checks and forbidden safety flags', () => {
      const req = parseRequirements({
        safetyHard: true,
        forbiddenSafetyFlags: ['unlit_night', 'construction'],
      });

      expect(candidateMatchesHardRequirements({ name: 'Safe Spot', cat: 'park', coords: [17.3, 78.4], safe: true }, req).ok).toBe(true);
      expect(candidateMatchesHardRequirements({ name: 'Marked Unsafe', cat: 'park', coords: [17.3, 78.4], safe: false }, req).ok).toBe(false);
      expect(candidateMatchesHardRequirements({ name: 'Under Work', cat: 'park', coords: [17.3, 78.4], safetyFlags: ['construction'] }, req).ok).toBe(false);
    });

    it('handles transport mode compatibility (lines 123-128)', () => {
      const req = parseRequirements({ transportModes: ['metro', 'walk'] });

      expect(candidateMatchesHardRequirements({ name: 'Metro Connected', cat: 'park', coords: [17.3, 78.4], transportModes: ['metro', 'bus'] }, req).ok).toBe(true);
      expect(candidateMatchesHardRequirements({ name: 'Car Only', cat: 'park', coords: [17.3, 78.4], transportModes: ['cab'] }, req).ok).toBe(false);
      expect(candidateMatchesHardRequirements({ name: 'No Transit Info', cat: 'park', coords: [17.3, 78.4], transportModes: null }, req).ok).toBe(false);
    });
  });

  describe('hasUsableCoords & mustAvoidPlaces & filterCandidates (lines 210-243)', () => {
    it('rejects places with missing, malformed, or non-numeric coordinates (lines 210-221)', () => {
      const req = parseRequirements({});
      expect(hasUsableCoords(null)).toBe(false);
      expect(hasUsableCoords({ coords: [] })).toBe(false);
      expect(hasUsableCoords({ coords: [17.3] })).toBe(false);
      expect(hasUsableCoords({ coords: ['abc', 78.4] })).toBe(false);
      expect(hasUsableCoords({ coords: [17.3, 78.4] })).toBe(true);

      expect(candidateMatchesHardRequirements({ name: 'No Coords Place' }, req)).toEqual({ ok: false, reason: 'no_coordinates' });
    });

    it('rejects places in mustAvoidPlaces by ID or partial name match (lines 223-228)', () => {
      const req = parseRequirements({
        mustAvoidPlaces: ['place_123', 'crowded bazaar'],
      });

      expect(candidateMatchesHardRequirements({ id: 'place_123', name: 'Some Spot', coords: [17.3, 78.4], cat: 'park' }, req)).toEqual({ ok: false, reason: 'must_avoid_place' });
      expect(candidateMatchesHardRequirements({ id: 'other_456', name: 'Old Crowded Bazaar Square', coords: [17.3, 78.4], cat: 'park' }, req)).toEqual({ ok: false, reason: 'must_avoid_place' });
      expect(candidateMatchesHardRequirements({ id: 'other_789', name: 'Quiet Garden', coords: [17.3, 78.4], cat: 'park' }, req).ok).toBe(true);
    });

    it('rejects lodging / hotel places unless they are pure restaurants (lines 235-236)', () => {
      const req = parseRequirements({});
      expect(candidateMatchesHardRequirements({ name: 'Grand Luxury Hotel & Suites', coords: [17.3, 78.4], cat: 'hotel' }, req)).toEqual({ ok: false, reason: 'lodging' });
      expect(candidateMatchesHardRequirements({ name: 'Seaside Resort', coords: [17.3, 78.4], cat: 'scenic' }, req)).toEqual({ ok: false, reason: 'lodging' });
      expect(candidateMatchesHardRequirements({ name: 'Hotel Saravana Bhavan Restaurant', coords: [17.3, 78.4], cat: 'food' }, req).ok).toBe(true);
    });

    it('filters a collection of candidates cleanly', () => {
      const places = [
        { id: '1', name: 'Valid Park', coords: [17.3, 78.4], cat: 'park' },
        { id: '2', name: 'No Coords Spot', cat: 'scenic' },
        { id: '3', name: 'Temple Spot', coords: [17.4, 78.5], cat: 'temple' },
      ];
      const req = parseRequirements({ excludedCategories: ['temple'] });
      const filtered = filterCandidates(places, req);
      expect(filtered.map((p) => p.id)).toEqual(['1']);
    });
  });

  describe('parseRequirements options & soft constraints flags (lines 130-208)', () => {
    it('handles noTemples, noBeaches, tripBudget, and fromCoords (lines 134-143, 203)', () => {
      const req = parseRequirements({
        noTemples: true,
        noBeaches: true,
        tripBudget: 3500,
        fromCoords: [17.385, 78.486],
        mallsOnly: true,
        beachesOnly: true,
        templesOnly: true,
        vegetarian: true,
        budgetHard: true,
        maxTravelMinutes: 45,
        maxWaitingMinutes: 15,
        maxStops: 6,
        personas: ['family', 'low_crowd', 'photo', 'foodie'],
        preferredCategories: ['scenic', 'food'],
        tripMode: 'relaxed',
      });
      expect(req.hard.excludedCategories).toContain('temple');
      expect(req.hard.excludedCategories).toContain('beach');
      expect(req.hard.exclusiveCategories).toContain('shopping');
      expect(req.hard.budget).toBe(3500);
      expect(req.originCoords).toEqual([17.385, 78.486]);
      expect(req.soft.photography).toBe(true);
      expect(req.soft.foodFocus).toBe(true);
      expect(req.soft.family).toBe(true);
      expect(req.soft.relaxed).toBe(true);

      expect(filterCandidates(null, req)).toEqual([]);
    });
  });
});
