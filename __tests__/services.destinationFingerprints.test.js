'use strict';

const {
  computeDestinationFingerprint,
  calculateFingerprintSimilarity,
  findSimilarDestinations,
  findDifferentiatedDestinations,
} = require('../services/travelIntelligence/destinationFingerprints');

describe('Destination Experience Fingerprints (destinationFingerprints.js)', () => {
  const kailasagiri = { id: 'k', name: 'Kailasagiri', cat: 'viewpoint', is_sunset_spot: true, rating: 4.7 };
  const rushikonda = { id: 'r', name: 'Rushikonda Beach', cat: 'beach', is_sunset_spot: true, rating: 4.6 };
  const museum = { id: 'm', name: 'Submarine Museum', cat: 'museum', rating: 4.5 };

  test('computes 8-dimensional experience vector with evidence and confidence', () => {
    const fp = computeDestinationFingerprint(kailasagiri);
    expect(fp.vector.scenic).toBeGreaterThanOrEqual(90);
    expect(fp.vector.photography).toBeGreaterThanOrEqual(90);
    expect(fp.attributes.indoorOutdoor).toBe('outdoor');
    expect(fp.confidence).toBeGreaterThanOrEqual(80);
    expect(fp.evidence).toHaveProperty('scenic');
  });

  test('computes high cosine similarity between similar scenic viewpoints and beaches', () => {
    const fpK = computeDestinationFingerprint(kailasagiri);
    const fpR = computeDestinationFingerprint(rushikonda);
    const sim = calculateFingerprintSimilarity(fpK, fpR);
    expect(sim).toBeGreaterThanOrEqual(0.85);
  });

  test('finds similar and differentiated alternative destinations', () => {
    const candidates = [rushikonda, museum];
    const similar = findSimilarDestinations(kailasagiri, candidates, 2);
    expect(similar[0].name).toBe('Rushikonda Beach');

    const different = findDifferentiatedDestinations(kailasagiri, candidates, 2);
    expect(different[0].name).toBe('Submarine Museum');
  });
});
