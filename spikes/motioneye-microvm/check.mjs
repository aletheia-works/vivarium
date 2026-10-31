import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const here = import.meta.dirname;
const { chromium } = createRequire(join(here, '../../docs/package.json'))('playwright');
const state = JSON.parse(readFileSync(join(here, 'build/aws.json'), 'utf8'));
const idleSeconds = Number(process.argv[2] ?? 0);
const shots = join(here, 'build/shots');
const PASSWORD = 'preview-check';

const seconds = (since) => ((Date.now() - since) / 1000).toFixed(2);
const digest = (buffer) => createHash('sha256').update(buffer).digest('hex');

async function open(context, label) {
  const page = await context.newPage();
  const started = Date.now();
  const response = await page.goto(state.PROXY_URL, { timeout: 120_000 });
  console.log(`${label}: ${response.status()} in ${seconds(started)}s`);
  return page;
}

async function logIn(page) {
  const dialog = page.locator('#usernameEntry:visible');
  await dialog.or(page.locator('img.camera[src*="/picture/"]').first()).waitFor();
  if (!(await dialog.isVisible())) return 'kept session';
  for (const password of ['', PASSWORD]) {
    await page.fill('#usernameEntry', 'admin');
    await page.fill('#passwordEntry', password);
    const answer = page.waitForResponse(
      (r) => r.url().includes('/login/') && r.request().method() === 'POST',
    );
    await page.click('div.button.default:has-text("Login")');
    const response = await answer;
    if (response.status() !== 200) continue;
    if ((await response.json()).force_password_change)
      await page.click('div.button:visible:has-text("OK")');
    return password ? 'set' : 'empty';
  }
  throw new Error('admin could log in with neither password');
}

async function frames(page, camera, count) {
  const seen = new Set();
  const started = Date.now();
  while (seen.size < count) {
    const response = await page.waitForResponse(
      (r) => r.url().includes(`/picture/${camera}/current/`) && r.status() === 200,
    );
    seen.add(digest(await response.body()));
  }
  console.log(`camera ${camera}: ${count} different frames in ${seconds(started)}s`);
}

async function saveCameraName(page, name) {
  if (!(await page.isVisible('#deviceNameEntry'))) await page.click('div.settings-button');
  await page.fill('#deviceNameEntry', name);
  await page.press('#deviceNameEntry', 'Tab');
  for (const entry of ['#adminPasswordEntry', '#normalPasswordEntry'])
    if (!(await page.inputValue(entry))) await page.fill(entry, PASSWORD);
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/config/0/set/')),
    page.click('#applyButton'),
  ]);
  console.log(`apply: ${response.status()}`);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
context.setDefaultTimeout(30_000);
try {
  const keyed = await context.newPage();
  const started = Date.now();
  const first = await keyed.goto(`${state.PROXY_URL}?vivarium-key=${state.ACCESS_KEY}`, { timeout: 120_000 });
  console.log(`key link: ${first.status()} at ${new URL(keyed.url()).pathname} in ${seconds(started)}s`);
  console.log(`password: ${await logIn(keyed)}`);
  await frames(keyed, 1, 3);
  await keyed.screenshot({ path: join(shots, 'browser-1.png') });

  const name = `preview-${Date.now().toString(36)}`;
  await saveCameraName(keyed, name);
  await keyed.close();

  const again = await open(context, 'reload');
  console.log(`password: ${await logIn(again)}`);
  await again.waitForFunction(
    (expected) => document.querySelector('#deviceNameEntry')?.value === expected,
    name,
  );
  console.log(`camera name after reload: ${name}`);
  await again.close();

  if (idleSeconds) {
    console.log(`idle: no page open for ${idleSeconds}s`);
    await new Promise((resolve) => setTimeout(resolve, idleSeconds * 1000));
    const resumed = await open(context, 'after idle');
    console.log(`password: ${await logIn(resumed)}`);
    await frames(resumed, 1, 3);
    await resumed.screenshot({ path: join(shots, 'browser-2.png') });
  }
  console.log('OK');
} catch (error) {
  for (const page of context.pages()) await page.screenshot({ path: join(shots, 'browser-failed.png') });
  throw error;
} finally {
  await browser.close();
}
