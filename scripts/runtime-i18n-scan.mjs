import { chromium } from '@playwright/test';

const baseUrl = process.env.RUNTIME_SCAN_BASE_URL ?? 'http://127.0.0.1:3000';
const email = process.env.RUNTIME_SCAN_EMAIL ?? 'dentist@identa.test';
const password = process.env.RUNTIME_SCAN_PASSWORD ?? 'password123';
const locale = process.env.RUNTIME_SCAN_LOCALE ?? '';

const pagesToScan = [
  '/dashboard',
  '/patients',
  '/appointments',
  '/payments',
  '/staff',
  '/settings',
];

function getBaseOrigin(url) {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}`;
}

const keyLikePattern = /\b[a-z][a-z0-9_]*(?:\.[a-z0-9_]+){1,}\b/gi;
const knownNamespaces = [
  'common.',
  'menu.',
  'auth.',
  'login.',
  'register.',
  'dashboard.',
  'patients.',
  'appointments.',
  'payments.',
  'settings.',
  'patientHistory.',
  'patientDetail.',
  'role.',
];

function collectSuspiciousTokens(text) {
  const matches = text.match(keyLikePattern) ?? [];
  const filtered = matches.filter((token) => {
    const lowered = token.toLowerCase();
    if (lowered.startsWith('http.')) return false;
    if (lowered.startsWith('https.')) return false;
    if (lowered.includes('@')) return false;

    return knownNamespaces.some((prefix) => lowered.startsWith(prefix.toLowerCase()));
  });

  return Array.from(new Set(filtered)).sort();
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    if (locale) {
      await context.addCookies([
        {
          name: 'identa_locale',
          value: locale,
          url: getBaseOrigin(baseUrl),
        },
      ]);
    }

    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    const loginResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/auth/login')
        && response.request().method() === 'POST',
      { timeout: 20_000 }
    );
    await page.click('button[type="submit"]');
    await loginResponsePromise;
    await page.waitForURL('**/dashboard', { timeout: 20000 });

    const report = {};

    for (const route of pagesToScan) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      const text = await page.evaluate(() => document.body.innerText || '');
      report[route] = collectSuspiciousTokens(text);
    }

    const total = Object.values(report).reduce((sum, tokens) => sum + tokens.length, 0);
    const output = {
      totalSuspiciousTokens: total,
      report,
    };

    console.log(JSON.stringify(output, null, 2));
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
