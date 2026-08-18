const {
  stripControlChars,
  limitLength,
  sanitizeMessage,
  sanitizeCityName,
  sanitizePlaceName,
  validateBase64Image,
  sanitizeStringArray,
  sanitizeObjectArray,
  sanitizeNumber,
} = require('../utils/sanitize');

describe('stripControlChars', () => {
  test('removes null bytes and control characters', () => {
    expect(stripControlChars('hello\x00world\x1F')).toBe('helloworld');
  });

  test('keeps newlines and tabs', () => {
    expect(stripControlChars('line1\nline2\ttabbed')).toBe('line1\nline2\ttabbed');
  });

  test('returns empty string for non-string input', () => {
    expect(stripControlChars(123)).toBe('');
    expect(stripControlChars(null)).toBe('');
    expect(stripControlChars(undefined)).toBe('');
  });
});

describe('limitLength', () => {
  test('truncates strings longer than maxLen', () => {
    expect(limitLength('abcdefgh', 3)).toBe('abc');
  });

  test('leaves short strings untouched', () => {
    expect(limitLength('ab', 5)).toBe('ab');
  });

  test('uses default maxLen of 500', () => {
    const longStr = 'a'.repeat(600);
    expect(limitLength(longStr).length).toBe(500);
  });
});

describe('sanitizeMessage', () => {
  test('strips control chars, trims, and caps length', () => {
    expect(sanitizeMessage('  hi\x00there  ', 20)).toBe('hithere');
  });

  test('caps at default 1000 chars', () => {
    const longStr = 'x'.repeat(2000);
    expect(sanitizeMessage(longStr).length).toBe(1000);
  });

  // Regression test: this is exactly the prompt-injection / unbounded-cost
  // bug the in-code comments in validator.js describe being fixed.
  test('prevents an oversized payload from reaching an unbounded length', () => {
    const huge = 'A'.repeat(5 * 1024 * 1024); // 5MB, same order as body limit
    const result = sanitizeMessage(huge, 1000);
    expect(result.length).toBeLessThanOrEqual(1000);
  });
});

describe('sanitizeCityName', () => {
  test('allows letters, numbers, spaces, hyphens, dots, apostrophes', () => {
    expect(sanitizeCityName("Port Blair's")).toBe("Port Blair's");
  });

  test('strips disallowed characters (e.g. injection-style payloads)', () => {
    expect(sanitizeCityName('Mumbai<script>alert(1)</script>')).toBe('Mumbaiscriptalert1script');
  });

  test('caps length at 60 chars', () => {
    const longName = 'a'.repeat(100);
    expect(sanitizeCityName(longName).length).toBe(60);
  });

  test('non-string input returns empty string', () => {
    expect(sanitizeCityName(null)).toBe('');
    expect(sanitizeCityName(42)).toBe('');
  });
});

describe('sanitizePlaceName', () => {
  test('allows parentheses, ampersands, and commas in addition to city rules', () => {
    expect(sanitizePlaceName('Café & Bakery (Downtown), Sector 5')).toBe(
      'Caf & Bakery (Downtown), Sector 5'
    );
  });

  test('caps length at 120 chars', () => {
    const longName = 'a'.repeat(200);
    expect(sanitizePlaceName(longName).length).toBe(120);
  });
});

describe('validateBase64Image', () => {
  test('rejects empty/missing input', () => {
    expect(validateBase64Image('').valid).toBe(false);
    expect(validateBase64Image(undefined).valid).toBe(false);
  });

  test('accepts an image under the size limit', () => {
    const smallBase64 = Buffer.alloc(1000).toString('base64'); // ~1KB
    const result = validateBase64Image(smallBase64, 4);
    expect(result.valid).toBe(true);
    expect(result.sizeBytes).toBeGreaterThan(0);
  });

  test('rejects an image over the size limit', () => {
    // ~6MB of raw bytes, base64-encoded -> should exceed a 4MB cap
    const bigBase64 = Buffer.alloc(6 * 1024 * 1024).toString('base64');
    const result = validateBase64Image(bigBase64, 4);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/too large/i);
  });
});

describe('sanitizeStringArray', () => {
  test('caps number of items and per-item length', () => {
    const arr = Array.from({ length: 100 }, (_, i) => `item-${i}`.repeat(50));
    const result = sanitizeStringArray(arr, 10, 20);
    expect(result.length).toBeLessThanOrEqual(10);
    result.forEach(item => expect(item.length).toBeLessThanOrEqual(20));
  });

  test('filters out empty strings after sanitization', () => {
    expect(sanitizeStringArray(['', '   ', 'valid'])).toEqual(['valid']);
  });

  test('non-array input returns empty array', () => {
    expect(sanitizeStringArray('not-an-array')).toEqual([]);
    expect(sanitizeStringArray(null)).toEqual([]);
  });
});

describe('sanitizeObjectArray', () => {
  test('extracts and sanitizes only the specified fields', () => {
    const input = [{ n: 'Coffee', c: 150, extra: 'should be dropped' }];
    const result = sanitizeObjectArray(input, 10, ['n'], ['c']);
    expect(result).toEqual([{ n: 'Coffee', c: 150 }]);
  });

  test('caps item count', () => {
    const input = Array.from({ length: 200 }, (_, i) => ({ n: `x${i}`, c: 1 }));
    expect(sanitizeObjectArray(input, 100, ['n'], ['c']).length).toBe(100);
  });

  test('handles malformed items without throwing', () => {
    const input = [null, undefined, 'string-not-object', { n: 'ok', c: 5 }];
    const result = sanitizeObjectArray(input, 10, ['n'], ['c']);
    expect(result.length).toBe(4);
    expect(result[3]).toEqual({ n: 'ok', c: 5 });
  });
});

describe('sanitizeNumber', () => {
  test('clamps to the given range', () => {
    expect(sanitizeNumber(500, 0, 100, 0)).toBe(100);
    expect(sanitizeNumber(-5, 0, 100, 0)).toBe(0);
  });

  test('returns default for non-numeric input', () => {
    expect(sanitizeNumber('not-a-number', 0, 10, 5)).toBe(5);
    expect(sanitizeNumber(undefined, 0, 10, 5)).toBe(5);
  });

  test('accepts a valid in-range number', () => {
    expect(sanitizeNumber(7, 0, 10, 5)).toBe(7);
  });
});
