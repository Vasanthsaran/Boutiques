import { expect, test, type Browser, type Page } from '@playwright/test';
import sharp from 'sharp';

const ADMIN = { email: 'admin@e2e.local', password: 'e2e-admin-password' };
const stamp = Date.now().toString(36);
const CUSTOMER = { name: 'Lakshmi Test', email: `lakshmi-${stamp}@example.com`, password: 'customer-pass-123' };
const WORK_TITLE = `Rose Maggam Blouse ${stamp}`;

async function png(color: { r: number; g: number; b: number }) {
  return sharp({ create: { width: 600, height: 800, channels: 3, background: color } }).png().toBuffer();
}

async function adminPage(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  return page;
}

async function customerPage(browser: Browser, register: boolean) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  if (register) {
    await page.goto('/register');
    await page.getByLabel('Full name').fill(CUSTOMER.name);
    await page.getByLabel('Email').fill(CUSTOMER.email);
    await page.locator('input[autocomplete="new-password"]').nth(0).fill(CUSTOMER.password);
    await page.locator('input[autocomplete="new-password"]').nth(1).fill(CUSTOMER.password);
    await page.getByRole('button', { name: 'Create account' }).click();
  } else {
    await page.goto('/login');
    await page.getByLabel('Email').fill(CUSTOMER.email);
    await page.getByLabel('Password').fill(CUSTOMER.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
  }
  await expect(page).toHaveURL(/\/customer\/dashboard/);
  return page;
}

test.describe.serial('SVSS Boutique main flows', () => {
  let admin: Page;
  let customer: Page;

  test.beforeAll(async ({ browser }) => {
    admin = await adminPage(browser);
  });

  test('visitors can browse without signing in', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Elegance');
    for (const [link, heading] of [
      ['Services', 'Services'],
      ['Recent Work', 'Recent Work'],
      ['Collections', 'Collections'],
      ['Our Story', 'Tradition'],
    ] as const) {
      await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: link, exact: true }).click();
      await expect(page.getByRole('heading', { level: 1 })).toContainText(heading);
    }
    await page.goto('/services/maggam-work');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Maggam Work');
  });

  test('admin creates a design with an uploaded photo, publishes, then unpublishes it', async ({ page }) => {
    await admin.goto('/admin/recent-work/new');
    await admin.getByLabel('Title').fill(WORK_TITLE);
    await admin.getByLabel('Description').fill('Hand-done maggam work with zardosi and pearl detailing.');
    await admin.getByLabel('Category').selectOption({ label: 'Maggam Work' });
    // cover upload (first file input on the page)
    await admin.locator('input[type=file]').first().setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: await png({ r: 232, g: 184, b: 196 }) });
    await expect(admin.locator('img[src*="/media/public/"]').first()).toBeVisible();
    // invalid file shows a clear error
    await admin.locator('input[type=file]').nth(1).setInputFiles({ name: 'notes.png', mimeType: 'image/png', buffer: Buffer.from('this is not an image') });
    await expect(admin.getByText(/could not be read|Unsupported file type/)).toBeVisible();

    // preview, then save as draft — not public yet
    await admin.getByRole('button', { name: 'Preview' }).click();
    await expect(admin.getByRole('dialog').getByRole('heading', { name: WORK_TITLE })).toBeVisible();
    await admin.keyboard.press('Escape');
    await admin.getByRole('button', { name: 'Save draft' }).click();
    await expect(admin.getByText('Draft saved')).toBeVisible();
    await page.goto('/recent-work');
    await expect(page.getByText(WORK_TITLE)).toHaveCount(0);

    // publish
    await admin.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(admin.getByText(/Published — live/)).toBeVisible();
    await page.goto('/recent-work');
    await page.getByRole('link', { name: WORK_TITLE, exact: true }).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(WORK_TITLE);
    await expect(page.getByRole('link', { name: /Book an appointment/i }).first()).toBeVisible();
    const detailUrl = page.url();

    // it appears on the homepage too (latest work when none are featured)
    await page.goto('/');
    await expect(page.getByText(WORK_TITLE).first()).toBeVisible();

    // unpublish → disappears publicly
    await admin.goto('/admin/recent-work');
    await admin.getByRole('listitem').filter({ hasText: WORK_TITLE }).getByRole('button', { name: 'Unpublish' }).click();
    await expect(admin.getByText(/Unpublished/).first()).toBeVisible();
    await page.goto(detailUrl);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('isn’t available');

    // republish for later tests
    await admin.getByRole('listitem').filter({ hasText: WORK_TITLE }).getByRole('button', { name: 'Publish' }).click();
    await expect(admin.getByText(/Published — now visible/)).toBeVisible();
  });

  test('admin opens booking hours', async () => {
    await admin.goto('/admin/appointments?tab=availability');
    const addButtons = admin.getByRole('button', { name: 'Add', exact: true });
    await expect(addButtons).toHaveCount(7);
    for (let i = 0; i < 7; i++) await addButtons.nth(i).click();
    await admin.getByRole('button', { name: 'Save hours' }).click();
    await expect(admin.getByText('Working hours saved')).toBeVisible();
  });

  test('customer registers, saves a favourite and books an appointment; admin confirms; customer sees it', async ({ browser }) => {
    customer = await customerPage(browser, true);

    // favourite
    await customer.goto('/recent-work');
    await customer.getByRole('button', { name: 'Save to favourites' }).first().click();
    await expect(customer.getByText('Saved to favourites')).toBeVisible();
    await customer.goto('/customer/favorites');
    await expect(customer.getByText(WORK_TITLE)).toBeVisible();

    // booking
    await customer.goto('/appointments');
    await customer.getByRole('button', { name: 'Stitching', exact: true }).click();
    // the first open date is pre-selected; pick its first time slot
    await customer.getByRole('group', { name: /Preferred Time Slot/ }).getByRole('button').first().click();
    await customer.getByRole('button', { name: 'Reserve Appointment' }).click();
    await expect(customer.getByRole('heading', { name: 'Appointment requested' })).toBeVisible();

    await customer.goto('/customer/appointments');
    await expect(customer.getByText('Pending').first()).toBeVisible();

    // admin confirms
    await admin.goto('/admin/appointments?status=PENDING');
    await admin.getByRole('button', { name: CUSTOMER.name }).first().click();
    await admin.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(admin.getByText(/Status updated/)).toBeVisible();

    await customer.reload();
    await expect(customer.getByText('Confirmed').first()).toBeVisible();
    await customer.goto('/customer/notifications');
    await expect(customer.getByText('Appointment confirmed')).toBeVisible();
  });

  test('customer sends an enquiry; admin replies with a private note; customer reads the reply only', async () => {
    await customer.goto('/contact');
    await customer.getByLabel('Subject').fill('Bridal blouse enquiry');
    await customer.getByLabel('Message').fill('Could you make a maroon bridal blouse with peacock maggam motifs?');
    await customer.getByRole('button', { name: /Send enquiry/ }).click();
    await expect(customer.getByText(/your enquiry has been received/i)).toBeVisible();

    await admin.goto('/admin/enquiries');
    await admin.getByRole('button', { name: /Bridal blouse enquiry/ }).click();
    await admin.getByPlaceholder('Add a note…').fill('PRIVATE-NOTE: VIP customer');
    await admin.getByRole('button', { name: 'Add note' }).click();
    await expect(admin.getByText('PRIVATE-NOTE: VIP customer')).toBeVisible();
    await admin.getByLabel('Reply to customer').fill('Yes, we would love to! Please book a consultation.');
    await admin.getByRole('button', { name: 'Send reply' }).click();
    await expect(admin.getByText(/Reply sent/)).toBeVisible();

    await customer.goto('/customer/enquiries');
    await customer.getByRole('button', { name: /Bridal blouse enquiry/ }).click();
    await expect(customer.getByText('Yes, we would love to! Please book a consultation.')).toBeVisible();
    await expect(customer.getByText('PRIVATE-NOTE')).toHaveCount(0);
  });

  test('customers cannot reach the admin area', async () => {
    await customer.goto('/admin/dashboard');
    await expect(customer).toHaveURL(/\/admin\/login/);
    const status = await customer.evaluate(async () => (await fetch('/api/admin/stats')).status);
    expect(status).toBe(403);
  });

  test('mobile layouts have no horizontal overflow and the menu works', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    for (const path of ['/', '/services', '/recent-work', '/collections', '/about', '/contact', '/appointments', '/login', '/register']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(1);
    }
    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('navigation', { name: 'Mobile' }).getByRole('link', { name: 'Recent Work' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Recent Work');
    await ctx.close();
  });
});
