import { test, expect, type Page } from '@playwright/test';

const PASSWORD = 'DeSoto2026';

async function unlock(page: Page) {
  await page.goto('/');
  await page.fill('#pw-input', PASSWORD);
  await page.press('#pw-input', 'Enter');
  await expect(page.locator('#gate')).toBeHidden();
}

test.describe('Password gate', () => {
  test('wrong password keeps gate visible and shows error', async ({ page }) => {
    await page.goto('/');
    await page.fill('#pw-input', 'nope');
    await page.press('#pw-input', 'Enter');
    await expect(page.locator('#pw-err')).toHaveText(/Incorrect password/);
    await expect(page.locator('#gate')).toBeVisible();
  });

  test('correct password hides the gate', async ({ page }) => {
    await unlock(page);
  });
});

test.describe('Map + markers', () => {
  test('MapLibre canvas renders and all 5 project pins are in the DOM', async ({ page }) => {
    await unlock(page);
    await expect(page.locator('.maplibregl-canvas')).toBeVisible();
    await expect(page.locator('.mpin')).toHaveCount(5);
    // Subject star is also rendered
    await expect(page.locator('.spin')).toHaveCount(1);
  });
});

test.describe('Project pin ↔ sidebar card mapping', () => {
  // Guards the invariant in index.html:755-811 — projects[id] / markers[id] / card-${id}
  // must stay aligned. If someone reorders the `projects` array without renumbering the
  // card ids, this test fails loudly instead of silently pointing to the wrong card.
  const pins: Array<{ label: string; cardId: number }> = [
    { label: 'R', cardId: 0 },
    { label: 'P', cardId: 1 },
    { label: 'I', cardId: 2 },
    { label: 'Z', cardId: 3 },
    { label: 'H', cardId: 4 },
  ];

  for (const { label, cardId } of pins) {
    test(`clicking pin "${label}" opens card-${cardId}`, async ({ page }) => {
      await unlock(page);
      await page.locator('.mpin', { hasText: new RegExp(`^${label}$`) }).click();
      await expect(page.locator(`#card-${cardId}`)).toHaveClass(/(^|\s)on(\s|$)/);
    });
  }
});

test.describe('Tabs', () => {
  test('Comps tab shows comp pins; switching back hides them', async ({ page }) => {
    await unlock(page);

    // Start on Projects — comp pins should not be visible
    await expect(page.locator('.cmppin').first()).toBeHidden();

    await page.click('button.tab:has-text("Comps & HBU")');
    await expect(page.locator('#tab-comps')).toHaveClass(/(^|\s)on(\s|$)/);
    await expect(page.locator('.cmppin').first()).toBeVisible();
    await expect(page.locator('.cmppin')).toHaveCount(5);

    await page.click('button.tab:has-text("Projects")');
    await expect(page.locator('#tab-projects')).toHaveClass(/(^|\s)on(\s|$)/);
    await expect(page.locator('.cmppin').first()).toBeHidden();
  });

  test('Timeline tab renders timeline items', async ({ page }) => {
    await unlock(page);
    await page.click('button.tab:has-text("Timeline")');
    await expect(page.locator('#tab-timeline')).toHaveClass(/(^|\s)on(\s|$)/);
    await expect(page.locator('#tab-timeline .tli')).not.toHaveCount(0);
  });
});

test.describe('Timeline expand/collapse', () => {
  test('"+ More detail" toggles the extra panel', async ({ page }) => {
    await unlock(page);
    await page.click('button.tab:has-text("Timeline")');

    const extra = page.locator('#tlx-0');
    const btn = page.locator('#tab-timeline .tlbtn').first();

    await expect(extra).not.toHaveClass(/(^|\s)on(\s|$)/);
    await btn.click();
    await expect(extra).toHaveClass(/(^|\s)on(\s|$)/);
    await expect(btn).toHaveText(/Less detail/);

    await btn.click();
    await expect(extra).not.toHaveClass(/(^|\s)on(\s|$)/);
    await expect(btn).toHaveText(/More detail/);
  });
});

test.describe('Gallery + lightbox', () => {
  test('clicking a gallery tab swaps image src and caption', async ({ page }) => {
    await unlock(page);
    await page.click('#card-0');
    await expect(page.locator('#card-0')).toHaveClass(/(^|\s)on(\s|$)/);

    const img = page.locator('#rs-img');
    await expect(img).toHaveAttribute('src', /redsea_elev-01/);

    // Second tab = Site Plan / Phasing (index 1). Clicking bubbles up to #card-0
    // which toggles it closed, but showGal has already mutated the img attributes.
    await page.locator('#card-0 .gtab').nth(1).click();
    await expect(img).toHaveAttribute('src', /redsea_elev-02/);
    await expect(page.locator('#rs-cap')).toContainText(/Site plan/i);
  });

  test('lightbox opens on image click and Escape closes it', async ({ page }) => {
    await unlock(page);
    await page.click('#card-0');
    await page.locator('#rs-img').click();

    await expect(page.locator('#lightbox')).toHaveClass(/(^|\s)on(\s|$)/);
    await expect(page.locator('#lb-img')).toHaveAttribute('src', /assets\//);

    await page.keyboard.press('Escape');
    await expect(page.locator('#lightbox')).not.toHaveClass(/(^|\s)on(\s|$)/);
  });
});

test.describe('Mobile sidebar', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('starts collapsed; toggle button opens it; tab click also opens it', async ({ page }) => {
    await unlock(page);
    const sidebar = page.locator('.sidebar');

    await expect(sidebar).toHaveClass(/(^|\s)collapsed(\s|$)/);
    await expect(page.locator('#sb-toggle')).toBeVisible();

    await page.click('#sb-toggle');
    await expect(sidebar).not.toHaveClass(/(^|\s)collapsed(\s|$)/);

    // Closing via overlay collapses it again
    await page.click('#sb-overlay');
    await expect(sidebar).toHaveClass(/(^|\s)collapsed(\s|$)/);

    // Clicking a tab while collapsed reopens the sidebar
    await page.click('button.tab:has-text("Timeline")');
    await expect(sidebar).not.toHaveClass(/(^|\s)collapsed(\s|$)/);
  });
});

test.describe('Data integrity', () => {
  test('every gallery image asset responds 2xx', async ({ page, request }) => {
    await unlock(page);
    const srcs = await page.locator('.gal-img').evaluateAll(
      els => (els as HTMLImageElement[]).map(el => el.getAttribute('src') || '').filter(Boolean)
    );
    expect(srcs.length).toBeGreaterThan(0);
    for (const src of srcs) {
      const url = src.startsWith('http') ? src : `http://localhost:8080/${src}`;
      const res = await request.get(url);
      expect(res.status(), `asset ${src}`).toBeLessThan(400);
    }
  });
});
