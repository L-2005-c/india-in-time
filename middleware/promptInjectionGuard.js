'use strict';

/**
 * middleware/promptInjectionGuard.js
 *
 * Lightweight pre-flight defense-in-depth semantic prompt injection guard.
 * Detects common adversarial injection, jailbreak, and delimiter escape patterns
 * in user-supplied free-text fields before they are interpolated into LLM prompts.
 */

const logger = require('../lib/logger');

const INJECTION_PATTERNS = [
  // System Prompt Overrides
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|directives|rules)/i,
  /disregard\s+(all\s+)?(previous|prior|above)\s+(instructions|directives)/i,
  /new\s+(instructions|system\s+prompt|directive)\s*:/i,
  /system\s+override/i,
  /\bdo\s+not\s+follow\s+any\s+(previous|prior)\s+rules\b/i,

  // Jailbreak Personas & Modes
  /\b(dan|jailbreak)\s+mode\b/i,
  /\bdeveloper\s+mode\s+(enabled|activated|on)\b/i,
  /\bunrestricted\s+(ai|mode|model)\b/i,
  /\bpretend\s+(you\s+are|to\s+be)\s+(an?\s+)?(unfiltered|unrestricted|evil|jailbroken)\b/i,
  /\balways\s+comply\s+without\s+restrictions\b/i,

  // Delimiter & Token Smuggling
  /\[\s*system\s*\]/i,
  /\[\s*inst\s*\]/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /```\s*system/i,
  /```\s*override/i,

  // Data & Key Exfiltration Signatures
  /\b(reveal|output|print|show|dump|leak)\s+(your\s+)?(system\s+prompt|hidden\s+prompt|api[_\s]?key|admin\s+email|env\s+vars|environment\s+variables)\b/i,
  /\bwhat\s+is\s+your\s+(exact\s+)?(system\s+prompt|initial\s+instructions)\b/i,
];

/**
 * Scans a string for known prompt injection patterns.
 * @param {string} text
 * @returns {{ isInjection: boolean, matchedPattern?: string }}
 */
function detectPromptInjection(text) {
  if (!text || typeof text !== 'string') {
    return { isInjection: false };
  }

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return {
        isInjection: true,
        matchedPattern: pattern.toString(),
      };
    }
  }

  return { isInjection: false };
}

/**
 * Express middleware for AI routes.
 * Scans user free-text fields in req.body.
 */
function promptInjectionGuard(req, res, next) {
  if (!req.body || typeof req.body !== 'object') {
    return next();
  }

  const textFields = ['message', 'vibe', 'context', 'query', 'customPrompt', 'notes', 'userQuery'];

  for (const field of textFields) {
    const val = req.body[field];
    if (typeof val === 'string') {
      const check = detectPromptInjection(val);
      if (check.isInjection) {
        logger.warn(
          { field, pattern: check.matchedPattern, ip: req.ip },
          '[promptInjectionGuard] Semantic prompt injection pattern flagged'
        );
        return res.status(400).json({
          error: 'Input contains prohibited command or prompt override pattern.',
          code: 'PROMPT_INJECTION_DETECTED',
        });
      }
    }
  }

  return next();
}

module.exports = {
  detectPromptInjection,
  promptInjectionGuard,
  INJECTION_PATTERNS,
};
