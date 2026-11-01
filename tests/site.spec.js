import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test('loads without script errors and fits desktop/mobile viewports', async ({ page }, info) => {
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto('/'); expect(response.status()).toBe(200);
  await expect(page.locator('#finalUsd')).not.toHaveText('—');
  await expect(page.locator('#chart .chart-path')).toHaveAttribute('d',/^M/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({path:info.outputPath('scenario.png'),fullPage:true});
});
test('required 1M TL validation is visible in the calculator and ledger', async({page})=>{
  await page.goto('/'); await page.locator('#example').click();
  await expect(page.locator('#capital')).toHaveValue('1000000');
  await expect(page.locator('#breakdown')).toContainText('₺26,038.36');
  await expect(page.locator('#ledger')).toContainText('26,038.36');
  await expect(page.locator('#finalUsd')).toHaveText('$20,520.77');
  await expect(page.locator('#cycles')).toHaveText('1');
  await expect(page.locator('#remainder')).toHaveText('0');
});
test('early exit keeps paid interest and forfeits unfinished term',async({page})=>{
  await page.goto('/?currency=TRY&capital=1000000&days=31&depr=0&bid=50&ask=50');
  await expect(page.locator('#finalUsd')).toHaveText('$20,000.00');
  await page.locator('#days').fill('33');
  await expect(page.locator('#finalUsd')).toHaveText('$20,520.77');
  await expect(page.locator('#remainder')).toHaveText('1');
  await expect(page.locator('#exitNote')).toContainText('earn no interest');
});
test('invalid inputs pause results instead of silently changing the model',async({page})=>{
  await page.goto('/'); await page.locator('#days').fill('32.5');
  await expect(page.locator('#days')).toHaveAttribute('aria-invalid','true');
  await expect(page.locator('#results')).toBeHidden(); await expect(page.locator('#share')).toBeDisabled();
  await page.locator('#days').fill('64'); await page.locator('#ask').fill('1');
  await expect(page.locator('#ask-error')).toContainText('at least');
  await page.locator('#ask').fill('51'); await expect(page.locator('#results')).toBeVisible();
  await page.locator('#capital').fill(''); await expect(page.locator('#results')).toBeHidden();
});
test('promotional and renewal controls change the actual ledger',async({page})=>{
  await page.goto('/?days=128'); await page.locator('.advanced summary').click();
  await page.locator('#promo').check(); await page.locator('#promoTerms').fill('1');
  await page.locator('#rateMode').selectOption('declining'); await page.locator('#endRate').fill('20');
  const rows=page.locator('#ledger tr');
  await expect(rows.nth(1)).toContainText('44.00%'); await expect(rows.nth(2)).toContainText('34.60%');
  await expect(page.locator('#excluded')).toBeVisible();
});
test('comparison rows and holding-period presets recalculate',async({page})=>{
  await page.goto('/'); await page.locator('[data-depr="30"]').click();
  await expect(page.locator('#depr')).toHaveValue('30');
  await expect(page.locator('[data-depr="30"]')).toHaveAttribute('aria-pressed','true');
  await page.locator('[data-days="32"]').click(); await expect(page.locator('#cycles')).toHaveText('1');
});
test('share links restore every assumption and reset clears the URL',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text)=>{window.copiedLink=text;}}}));
  await page.goto('/?currency=TRY&capital=1234567&days=97&promo=1&rateMode=declining&depr=-5&promoTerms=2');
  const before=await page.locator('#finalUsd').textContent(); await page.locator('#share').click();
  await expect(page.locator('#copyStatus')).toContainText('copied');
  const link=await page.evaluate(()=>window.copiedLink); expect(new URL(link).searchParams.get('tax')).toBe('17.5');
  await page.goto(link); await expect(page.locator('#finalUsd')).toHaveText(before);
  await expect(page.locator('#promoTerms')).toHaveValue('2'); await page.locator('#reset').click();
  await expect(page.locator('#capital')).toHaveValue('20000'); expect(new URL(page.url()).search).toBe('');
});
test('clipboard denial supplies a usable manual-copy link',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied');}}}));
  await page.goto('/'); await page.locator('#share').click(); await expect(page.locator('#copyStatus')).toContainText('Copy this scenario link: http');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('CSV downloads assumptions, tax, interest and incomplete-term exit',async({page})=>{
  await page.goto('/?currency=TRY&capital=1000000&days=33&depr=0&bid=50&ask=50');
  const pending=page.waitForEvent('download'); await page.locator('#csv').click(); const download=await pending;
  expect(download.suggestedFilename()).toBe('try-deposit-ledger.csv'); const csv=await readFile(await download.path(),'utf8');
  expect(csv).toContain('"26038.36"'); expect(csv).toContain('"exit","32","33"'); expect(csv).toContain('"tax","17.5"');
});
test('malformed shared values safely recover with a visible warning',async({page})=>{
  await page.goto('/?capital=%3Cimg%20src=x%20onerror=alert(1)%3E&depr=-100&days=Infinity');
  await expect(page.locator('#urlWarning')).toBeVisible(); await expect(page.locator('#capital')).toHaveValue('20000');
  await expect(page.locator('#results')).toBeVisible(); expect(await page.locator('img').count()).toBe(0);
});
test('zero capital and zero-day horizons stay readable without NaN',async({page})=>{
  await page.goto('/?capital=0&days=0'); await expect(page.locator('#finalUsd')).toHaveText('$0.00');
  await expect(page.locator('#breakeven')).toHaveText('N/A'); await expect(page.locator('#roi')).toContainText('not defined');
  expect(await page.locator('#results').innerText()).not.toMatch(/NaN|Infinity/);
});
test('narrow 320px screen keeps controls and tables within the page',async({page})=>{
  await page.setViewportSize({width:320,height:740}); await page.goto('/?promo=1&rateMode=declining');
  await expect(page.locator('#promoFields')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
