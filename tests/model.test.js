import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaults, validate, simulate, fxAt, rateAtTerm, chartSeries, parseScenario, scenarioUrl, ledgerCsv } from '../public/model.js';
const base = { ...defaults, currency: 'TRY', capital: 1000000, days: 32, bid: 50, ask: 50, depr: 0 };
function close(actual, expected, tolerance = 1e-7) { assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`); }
test('required validation: 1M TRY, 36%, 32 days, 17.5% tax = 26,038.36 net', () => {
  const o = simulate(base); close(o.grossInterest, 31561.643835616436); close(o.withholding, 5523.287671232876); close(o.netInterest, 26038.35616438356); assert.equal(o.netInterest.toFixed(2), '26038.36'); close(o.finalTry, 1026038.3561643836);
});
test('actual/365 denominator for every supported term, including 365 days', () => {
  for (const term of [1, 32, 46, 92, 181, 365]) { const o = simulate({...base, term, days: term}); close(o.netInterest, 1000000 * .36 * term / 365 * .825); }
});
test('no compounding or interest before the first maturity', () => {
  for (const days of [0, 1, 15, 31]) { const o = simulate({...base, days}); assert.equal(o.finalTry, 1000000); assert.equal(o.netInterest, 0); assert.equal(o.completedTerms, 0); assert.equal(o.unpaidDays, days); }
});
test('interest credits exactly at maturity and remains unchanged in an unfinished term', () => {
  const at = simulate(base); for (const days of [33, 45, 63]) { const o = simulate({...base, days}); assert.equal(o.finalTry, at.finalTry); assert.equal(o.unpaidDays, days-32); }
});
test('two complete terms compound after tax, not gross interest', () => {
  const o = simulate({...base, days: 64}); close(o.finalTry, 1000000 * (1 + .36 * 32 / 365 * .825) ** 2); assert.equal(o.completedTerms, 2);
});
test('365 days has 11 completed 32-day terms and 13 unpaid days', () => {
  const o = simulate({...base, days:365}); assert.equal(o.completedTerms,11); assert.equal(o.unpaidDays,13); close(o.finalTry,1000000*(1+.36*32/365*.825)**11);
});
test('leap-year-length horizon still uses actual/365', () => {
  const o = simulate({...base,term:183,days:366}); close(o.finalTry,1000000*(1+.36*183/365*.825)**2);
});
test('zero and 100% withholding, zero rates', () => {
  close(simulate({...base,tax:0}).netInterest, 1000000*.36*32/365);
  for (const p of [{tax:100},{rate:0}]) assert.equal(simulate({...base,...p}).finalTry, 1000000);
});
test('USD entry and exit use correct bid/ask sides once', () => {
  const p = {...base,currency:'USD',capital:20000,bid:49,ask:51,days:0}; const o=simulate(p);
  assert.equal(o.initialTry,980000); close(o.finalUsd,980000/51); close(o.profitUsd,20000*(49/51-1));
});
test('TRY entry skips conversion and uses liquidation value as USD benchmark', () => {
  const o=simulate({...base,bid:40,ask:50,days:0}); assert.equal(o.initialTry,1000000); assert.equal(o.initialUsd,20000); assert.equal(o.profitUsd,0);
});
test('annual FX increase is geometric, not linear, and exact on day 365', () => {
  const p={...base,depr:21}; close(fxAt(p,365),60.5); close(fxAt(p,182.5),55); close(fxAt(p,730),50*1.21**2);
});
test('FX changes throughout an unfinished term, with no deposit interest', () => {
  const p={...base,days:16,depr:21}; const o=simulate(p); close(o.finalUsd,1000000/(50*1.21**(16/365))); assert.equal(o.netInterest,0);
});
test('negative depreciation (lira appreciation) is supported', () => {
  const o=simulate({...base,rate:0,days:365,depr:-20}); close(o.exitAsk,40); close(o.finalUsd,25000);
});
test('zero capital has finite balances and undefined percentage metrics', () => {
  const o=simulate({...base,capital:0}); assert.equal(o.finalUsd,0); assert.equal(o.returnPct,null); assert.equal(o.breakEven,null);
});
test('zero-day horizon does not annualize break-even', () => { assert.equal(simulate({...base,days:0}).breakEven,null); });
test('break-even FX increase reproduces initial USD, including both spreads', () => {
  const p={...defaults,days:365}; const b=simulate(p).breakEven; close(simulate({...p,depr:b}).finalUsd,p.capital);
});
test('break-even without earnings can be negative because of spreads', () => { assert.ok(simulate({...defaults,rate:0,days:365}).breakEven<0); });
test('promotion applies to exactly the first three terms, then normal rate', () => {
  const o=simulate({...base,days:128,promo:true}); assert.deepEqual(o.rows.slice(1).map(r=>r.rate),[44,44,44,36]);
  close(o.rows[1].eligible,925000); close(o.rows[4].eligible,o.rows[3].balance);
});
test('excluded balance never creates negative interest and becomes eligible later', () => {
  const o=simulate({...base,days:128,promo:true,excluded:2000000}); assert.equal(o.rows[3].balance,1000000); close(o.rows[4].net,base.capital*.36*32/365*.825);
});
test('promo duration is configurable and incomplete promo terms pay nothing', () => {
  const p={...base,promo:true,promoTerms:1,excluded:0}; const o=simulate({...p,days:64}); assert.deepEqual(o.rows.slice(1).map(r=>r.rate),[44,36]); assert.equal(simulate({...p,days:31}).netInterest,0);
});
test('rate transition is fixed at term start, not maturity', () => {
  const p={...base,rateMode:'declining',endRate:20,days:64}; const o=simulate(p);
  assert.equal(o.rows[1].rate,36); close(o.rows[2].rate,36+(20-36)*32/365);
});
test('rate transition stops at year-end rate; rising paths also work', () => {
  close(rateAtTerm({...base,rateMode:'declining',endRate:20},12),20);
  close(rateAtTerm({...base,rateMode:'declining',endRate:50},1),36+14*32/365);
});
test('after promotion, renewal follows elapsed-day schedule rather than restarting it', () => {
  const p={...base,promo:true,rateMode:'declining',endRate:20,days:128}; close(simulate(p).rows[4].rate,36-16*96/365);
});
test('gross minus withheld equals net, and ledger reconciles', () => {
  const o=simulate({...defaults,promo:true,rateMode:'declining',days:1000});
  close(o.rows.reduce((s,r)=>s+r.net,0),o.netInterest); close(o.finalTry-o.initialTry,o.netInterest,1e-6);
});
test('chart has no interest slope: exact before and after maturity points', () => {
  const p={...base,days:33,depr:18}; const o=simulate(p), pts=chartSeries(p,o), event=pts.filter(x=>x.day===32);
  assert.equal(event.length,2); close(event[0].usd,base.capital/fxAt(p,32)); close(event[1].usd,o.finalTry/fxAt(p,32)); close(pts.at(-1).usd,o.finalUsd);
});
test('chart preserves every maturity even across ten years', () => {
  const p={...base,days:3650},o=simulate(p),pts=chartSeries(p,o);
  assert.equal(pts.length,3651+o.completedTerms); close(pts.at(-1).usd,o.finalUsd);
});
test('zero-day chart contains one finite point', () => { const pts=chartSeries({...base,days:0}); assert.equal(pts.length,1); assert.equal(pts[0].usd,20000); });
test('reject non-finite, blank, out-of-range and fractional inputs', () => {
  for(const override of [{capital:NaN},{rate:Infinity},{days:1.5},{term:0},{term:32.5},{days:-1},{days:3651},{bid:0},{ask:1},{depr:-100},{tax:101},{capital:-1},{promoTerms:0},{currency:'EUR'},{promo:'yes'},{rateMode:'unknown'}]) assert.throws(()=>simulate({...base,...override}),RangeError);
  assert.ok(validate({...base,rate:''}).rate);
});
test('shared URLs round-trip all assumptions, including custom terms and zero', () => {
  const p={...defaults,currency:'TRY',capital:0,days:0,term:64,rateMode:'declining',promo:true,promoTerms:5,depr:-5};
  const url=scenarioUrl(p,'https://example.org/?old=value#anchor'); const parsed=parseScenario(new URL(url).search);
  assert.deepEqual(parsed.values,p); assert.deepEqual(parsed.warnings,[]); assert.ok(!url.includes('old=')); assert.ok(!url.includes('#'));
});
test('legacy URLs and omitted defaults remain supported', () => { const p=parseScenario('?capital=12345&promo=1'); assert.equal(p.values.capital,12345); assert.equal(p.values.promo,true); assert.equal(p.values.term,32); });
test('malformed URL parameters recover with explicit warnings', () => {
  const p=parseScenario('?days=1.2&rate=Infinity&capital=&promo=wat&currency=%3Cscript%3E');
  assert.deepEqual(p.values,defaults); assert.deepEqual(p.warnings.sort(),['capital','currency','days','promo','rate'].sort());
});
test('URL quote validation considers both provided quotes before enforcing spread', () => {
  const p=parseScenario('?bid=60&ask=62'); assert.equal(p.values.bid,60); assert.equal(p.values.ask,62); assert.deepEqual(p.warnings,[]);
  const bad=parseScenario('?bid=60&ask=50'); assert.equal(bad.values.bid,defaults.bid); assert.ok(bad.warnings.includes('ask'));
});
test('CSV includes assumptions, gross/tax/net, and exit even during an unfinished term', () => {
  const p={...base,days:33},csv=ledgerCsv(p); assert.ok(csv.startsWith('\uFEFF')); assert.ok(csv.includes('"tax","17.5"')); assert.ok(csv.includes('"26038.36"')); assert.ok(csv.includes('"exit","32","33"')); assert.ok(csv.includes('"Unpaid days in broken term","1"'));
});
test('boundary scenarios stay finite and nonnegative', () => {
  for (const capital of [0,1,1e12]) for(const tax of [0,100]) for(const depr of [-90,300]) {
    const o=simulate({...base,capital,tax,depr,days:3650,term:1,rate:200}); assert.ok(Number.isFinite(o.finalUsd)); assert.ok(o.finalTry>=o.initialTry);
  }
});
test('daily liquidation matches independent direct calculation for fixed-rate scenarios', () => {
  for(const days of [0,1,31,32,33,63,64,95,96,365,730]) {
    const p={...defaults,days}; const expected=p.capital*p.bid*(1+p.rate/100*p.term/365*(1-p.tax/100))**Math.floor(days/p.term)/(p.ask*(1+p.depr/100)**(days/365)); close(simulate(p).finalUsd,expected);
  }
});
