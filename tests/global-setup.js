'use strict';

module.exports = async function globalSetup(config) {
  const fs = require('fs');
  const path = require('path');

  const htmlPath = path.resolve(__dirname, '..', 'SabziTracker_Production.html');
  if (!fs.existsSync(htmlPath)) {
    throw new Error(`SabziTracker_Production.html not found at ${htmlPath}`);
  }

  const html = fs.readFileSync(htmlPath, 'utf8');

  if (!html.includes('function getItemTrends')) {
    throw new Error('Missing required function: getItemTrends');
  }
  if (!html.includes('function parseDateSort')) {
    throw new Error('Missing required function: parseDateSort');
  }
  if (!html.includes('function validateDate')) {
    throw new Error('Missing required function: validateDate');
  }
  if (!html.includes('function saveDB')) {
    throw new Error('Missing required function: saveDB');
  }
  if (!html.includes('function esc(')) {
    throw new Error('Missing required function: esc (XSS guard)');
  }

  console.log('[global-setup] HTML file validated');
};