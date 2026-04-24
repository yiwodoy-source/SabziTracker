/**
 * global-teardown.js — Runs once after all Playwright tests complete
 * Generates a summary report. Does NOT modify any application file.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

module.exports = async function globalTeardown() {
  const reportPath = path.resolve(__dirname, 'playwright-report/results.json');
  if (!fs.existsSync(reportPath)) {
    console.log('\n[Teardown] No Playwright results file found — skipping summary');
    return;
  }

  try {
    const results = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const stats   = results.stats || {};
    const passed  = stats.expected  || 0;
    const failed  = stats.unexpected || 0;
    const skipped = stats.skipped    || 0;
    const total   = passed + failed + skipped;

    console.log('\n' + '═'.repeat(60));
    console.log('  SabziTracker — Test Run Summary');
    console.log('═'.repeat(60));
    console.log(`  Total:   ${total}`);
    console.log(`  Passed:  ${passed} ✓`);
    console.log(`  Failed:  ${failed} ${failed > 0 ? '✗ ← ACTION REQUIRED' : ''}`);
    console.log(`  Skipped: ${skipped}`);
    console.log('─'.repeat(60));

    if (failed > 0) {
      const suites = results.suites || [];
      const failures = [];
      function collectFailures(suite) {
        (suite.specs || []).forEach(spec => {
          (spec.tests || []).forEach(t => {
            if (t.status === 'unexpected') {
              failures.push(`  ✗ ${suite.title} > ${spec.title}`);
            }
          });
        });
        (suite.suites || []).forEach(collectFailures);
      }
      suites.forEach(collectFailures);
      console.log('  Failed tests:');
      failures.slice(0, 20).forEach(f => console.log(f));
      if (failures.length > 20) console.log(`  ... and ${failures.length - 20} more`);
    } else {
      console.log('  All tests passed — application is production ready ✓');
    }
    console.log('═'.repeat(60) + '\n');

    // Write a simple badge file for CI systems
    const badge = {
      schemaVersion: 1,
      label:  'tests',
      message: `${passed}/${total} passed`,
      color:  failed > 0 ? 'red' : 'brightgreen'
    };
    const badgePath = path.resolve(__dirname, 'playwright-report/badge.json');
    fs.writeFileSync(badgePath, JSON.stringify(badge, null, 2));

  } catch (e) {
    console.log('[Teardown] Could not parse results:', e.message);
  }
};
