/* Browser smoke against the disposable local Supabase fixture only. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const [base, slug, mode] = process.argv.slice(2);
assert.match(base || '', /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
assert.match(slug || '', /^private-test-[a-f0-9]+$/);
const imageId = process.env.LOCAL_QA_IMAGE_ID;
const token = process.env.LOCAL_QA_OWNER_TOKEN;
assert.match(imageId || '', /^[a-f0-9-]{36}$/);
assert.ok(token);

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const failures = [];
  try {
    if (mode === 'draft') {
      const context = await browser.newContext();
      const session = { access_token: token, refresh_token: 'synthetic-unused',
        token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600 };
      await context.addCookies([{ name: 'sb-127-auth-token',
        value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), url: base }]);
      const ownerPage = await context.newPage();
      const preview = await ownerPage.goto(`${base}/api/property-images/${imageId}/preview`);
      assert.equal(preview.status(), 200, 'owner browser preview');
      assert.match(preview.headers()['cache-control'] || '', /private.*no-store|no-store.*private/);
      await context.close();
      console.log('PASS: browser owner-only draft preview and no-store');
      return;
    }
    for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }],
                                      ['mobile', { width: 375, height: 812 }]]) {
      const context = await browser.newContext({ viewportSize: viewport });
      const page = await context.newPage();
      page.on('pageerror', error => failures.push(`${label}: ${error.message}`));
      let response = await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
      assert.equal(response.status(), 200, `${label} Home`);
      await page.locator('.listing-card').first().waitFor({ timeout: 20000 });
      assert.equal(await page.locator('.listing-card').count(), 1, `${label} synthetic card`);
      assert.equal(await page.locator('.listing-card img').first().getAttribute('src'),
        `/api/property-images/${imageId}`, `${label} private-backed cover`);
      if (label === 'mobile') {
        await page.locator('.mobile-list-toggle').click();
        await page.locator('.results-panel.mobile-open').waitFor();
        await page.locator('.listing-card').first().scrollIntoViewIfNeeded();
      }
      await page.getByRole('button', { name: 'Ver detalles' }).first().click();
      await page.locator('.property-drawer').waitFor();
      assert.equal(await page.locator('.drawer-gallery img').first().getAttribute('src'),
        `/api/property-images/${imageId}`, `${label} drawer cover`);
      await page.getByRole('button', { name: 'Ampliar galería' }).click();
      await page.getByRole('dialog', { name: /Galería de/ }).waitFor();
      await page.getByRole('button', { name: 'Cerrar galería' }).click();
      await page.getByRole('link', { name: 'Ficha completa' }).click();
      await page.waitForURL(`**/inmueble/${slug}`);
      assert.equal(await page.locator('.property-full-main-image img').getAttribute('src'),
        `/api/property-images/${imageId}`, `${label} canonical cover`);
      const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content', { timeout: 10000 });
      assert.match(ogImage || '', new RegExp(`/api/property-images/${imageId}$`),
        `${label} Open Graph image`);
      await page.getByRole('button', { name: 'Imagen siguiente' }).click();
      assert.match(await page.locator('.property-full-main-image img').getAttribute('src'),
        /\/storage\/v1\/object\/public\/property-images\//,
        `${label} legacy public image`);
      const overflows = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
      assert.equal(overflows, false, `${label} horizontal overflow`);
      const session = { access_token: token, refresh_token: 'synthetic-unused',
        token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600 };
      await context.addCookies([{ name: 'sb-127-auth-token',
        value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'), url: base }]);
      response = await page.goto(base + '/publicar', { waitUntil: 'domcontentloaded' });
      assert.equal(response.status(), 200, `${label} publication form`);
      try {
        await page.getByRole('heading', { name: 'Publica tu propiedad' }).waitFor({ timeout: 8000 });
      } catch {
        throw new Error(`${label} /publicar did not render: URL=${page.url()} headings=${JSON.stringify(await page.locator('h1').allTextContents())}`);
      }
      assert.equal(await page.locator('input[type="file"]').count(), 1);
      await context.close();
      console.log(`PASS: ${label} ${viewport.width}x${viewport.height} Home/card/drawer/gallery/canonical/OG/legacy image/publicar`);
    }

    assert.deepEqual(failures, [], 'browser JS exceptions');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
