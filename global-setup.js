/**
 * global-setup.js — Runs once before all Playwright tests
 * Verifies the production HTML file exists and is accessible.
 * Does NOT modify any application file.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const HTML_PATH = path.resolve(__dirname, '../SabziTracker_Production.html');
const BASELINE_HASH = '9ca341107343baefc7c9aa05a50f9201148dfd5a6b4ef04197613f81aed38ed2';

module.exports = async function globalSetup() {
  console.log('\n[Setup] Verifying SabziTracker_Production.html...');

  // File must exist
  if (!fs.existsSync(HTML_PATH)) {
    throw new Error(`Production HTML not found at: ${HTML_PATH}`);
  }

  // File must be parseable HTML
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  if (!html.includes('<!DOCTYPE html>')) {
    throw new Error('Production HTML does not start with DOCTYPE');
  }
  if (!html.includes('function getItemTrends')) {
    throw new Error('Production HTML is missing core function: getItemTrends');
  }
  if (!html.includes('function parseDateSort')) {
    throw new Error('Production HTML is missing core function: parseDateSort');
  }
  if (!html.includes('PHASE 1 — REGRESSION HARNESS')) {
    throw new Error('Production HTML is missing Phase 1 regression harness');
  }
  if (!html.includes('PHASE 3B — MONITORING')) {
    throw new Error('Production HTML is missing Phase 3B health panel');
  }

  // Warn if hash changed (logic may have been modified)
  const actualHash = crypto.createHash('sha256').update(html).digest('hex');
  if (actualHash !== BASELINE_HASH) {
    console.warn(
      '\n⚠ WARNING: Production HTML hash differs from v5 baseline.\n' +
      `  Baseline: ${BASELINE_HASH}\n` +
      `  Actual:   ${actualHash}\n` +
      '  This is expected if Phase 1-4 additions were applied.\n' +
      '  Verify that only additive blocks were injected.\n'
    );
  } else {
    console.log('  ✓ File hash matches baseline');
  }

  // Count key functions
  const fnCount = (html.match(/^function \w+/gm) || []).length;
  console.log(`  ✓ Found ${fnCount} function definitions`);
  console.log(`  ✓ File size: ${Math.round(html.length / 1024)}KB`);
  console.log('[Setup] Complete — running tests\n');
};
