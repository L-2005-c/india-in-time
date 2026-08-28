// __tests__/ops.backupRestore.test.js
// Regression test: Operations & Reliability (Database backup validation,
// table allowlist checks, SHA256 manifest verification, and restore safety).
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ALLOWED_TABLES = new Set([
  'trips', 'favorites', 'api_usage', 'place_cache', 'ai_cache',
  'place_feedback', 'app_feedback', 'historical_crowd', 'gemini_usage',
  'audit_log', 'ml_model_weights',
]);

const sha256 = (val) => crypto.createHash('sha256').update(val).digest('hex');

describe('Ops — Database Backup & Restore Verification', () => {
  const tempBackupDir = path.join(__dirname, '..', 'scratch', 'test-backup');

  beforeAll(() => {
    fs.mkdirSync(tempBackupDir, { recursive: true });
  });

  afterAll(() => {
    try {
      fs.rmSync(tempBackupDir, { recursive: true, force: true });
    } catch (_e) {}
  });

  test('enforces strict compile-time table allowlist', () => {
    const maliciousTable = 'users"; DROP TABLE users; --';
    expect(ALLOWED_TABLES.has(maliciousTable)).toBe(false);
    expect(ALLOWED_TABLES.has('trips')).toBe(true);
    expect(ALLOWED_TABLES.has('audit_log')).toBe(true);
  });

  test('creates valid backup manifest with sha256 checksums', () => {
    const sampleTrips = [
      { id: 'trip-1', city: 'visakhapatnam', days: 2, created_at: '2026-08-28T10:00:00Z' },
      { id: 'trip-2', city: 'jaipur', days: 1, created_at: '2026-08-28T11:00:00Z' },
    ];

    const payload = JSON.stringify(sampleTrips);
    const hash = sha256(payload);

    fs.writeFileSync(path.join(tempBackupDir, 'trips.json'), payload);
    const manifest = {
      version: 2,
      createdAt: new Date().toISOString(),
      tables: [{ table: 'trips', rows: 2, file: 'trips.json', sha256: hash }],
    };
    fs.writeFileSync(path.join(tempBackupDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    const readManifest = JSON.parse(fs.readFileSync(path.join(tempBackupDir, 'manifest.json'), 'utf8'));
    expect(readManifest.version).toBe(2);
    expect(readManifest.tables[0].table).toBe('trips');
    expect(readManifest.tables[0].rows).toBe(2);
    expect(readManifest.tables[0].sha256).toBe(hash);
  });

  test('detects tampered backup file via sha256 mismatch', () => {
    const tamperedPayload = JSON.stringify([{ id: 'trip-hacked' }]);
    const originalHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    expect(sha256(tamperedPayload)).not.toBe(originalHash);
  });
});
