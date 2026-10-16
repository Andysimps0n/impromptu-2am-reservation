import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const round = process.argv[2];
if (!/^\d+$/.test(round ?? '')) {
  console.error('사용법: node scripts/shot.mjs <라운드번호>');
  process.exit(1);
}

const base = process.env.BASE_URL ?? 'http://127.0.0.1:8787';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, 'shots');
await mkdir(dir, { recursive: true });

const browser = await chromium.launch();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function openPage(width, height) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 2,
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForSelector('#seat-grid .seat');
  const seatCount = await page.locator('#seat-grid .seat').count();
  assert(seatCount > 20, `좌석이 충분히 렌더되지 않았습니다 (${seatCount}개).`);
  return page;
}

async function selectTwoSeats(page) {
  const seats = page.locator('#seat-grid .seat:not([disabled])');
  const available = await seats.count();
  assert(available >= 2, '선택 가능한 좌석이 2개 미만입니다.');
  await seats.nth(0).click();
  await seats.nth(1).click();
  await page.waitForFunction(() => {
    const total = document.querySelector('#total')?.textContent ?? '';
    const label = document.querySelector('#book-button')?.textContent ?? '';
    return total.includes('13,000') && label.includes('2석');
  });
  const total = await page.locator('#total').textContent();
  const label = await page.locator('#book-button').textContent();
  assert(total?.includes('13,000'), `금액 계산이 기대와 다릅니다: ${total}`);
  assert(label?.includes('2석'), `예매 버튼 문구가 기대와 다릅니다: ${label}`);
}

async function save(page, name) {
  const file = resolve(dir, `round${round}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(file);
}

const desktop = await openPage(1440, 900);
await save(desktop, '데스크톱');
await desktop.close();

const mobile = await openPage(390, 844);
await save(mobile, '모바일');
await mobile.close();

const seats = await openPage(1440, 900);
await selectTwoSeats(seats);
await save(seats, '좌석2개');
await seats.close();

const popup = await openPage(1440, 1000);
await selectTwoSeats(popup);
await popup.locator('#book-button').click();
await popup.waitForSelector('.modal .ticket');
const popupPrice = await popup.locator('.ticket-price strong').textContent();
const popupSeats = await popup.locator('.ticket-facts dd').last().textContent();
assert(popupPrice?.includes('13,000'), `팝업 금액이 기대와 다릅니다: ${popupPrice}`);
assert(popupSeats && popupSeats.trim().length > 0, '팝업에 좌석이 표시되지 않았습니다.');
await popup.screenshot({
  path: resolve(dir, `round${round}-예매팝업.png`),
  fullPage: false,
});
console.log(resolve(dir, `round${round}-예매팝업.png`));
await popup.close();

await browser.close();
console.log(`round ${round} 기능 확인 통과`);
