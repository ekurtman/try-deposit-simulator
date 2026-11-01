/** Pure financial model. Percent inputs use percentage points; money is unrounded until display. */
export const defaults = Object.freeze({
  capital: 20000, currency: 'USD', days: 365, term: 32, rate: 36, tax: 17.5,
  depr: 18, bid: 49.0975, ask: 50.7975, rateMode: 'fixed', endRate: 28,
  promo: false, promoRate: 44, promoTerms: 3, excluded: 75000,
});
export const rules = Object.freeze({
  capital: [0, 1e12], days: [0, 3650, true], term: [1, 365, true],
  rate: [0, 200], tax: [0, 100], depr: [-90, 300], bid: [.0001, 1e6],
  ask: [.0001, 1e6], endRate: [0, 200], promoRate: [0, 200],
  promoTerms: [1, 120, true], excluded: [0, 1e12],
});
export function validate(p) {
  const errors = {};
  for (const [key, [min, max, integer]] of Object.entries(rules)) {
    if (typeof p[key] !== 'number' || !Number.isFinite(p[key])) errors[key] = 'Enter a valid number.';
    else if (p[key] < min || p[key] > max) errors[key] = `Use a value from ${min.toLocaleString('en-US')} to ${max.toLocaleString('en-US')}.`;
    else if (integer && !Number.isInteger(p[key])) errors[key] = 'Use a whole number of days or terms.';
  }
  if (!['USD', 'TRY'].includes(p.currency)) errors.currency = 'Choose USD or TRY.';
  if (!['fixed', 'declining'].includes(p.rateMode)) errors.rateMode = 'Choose a renewal rule.';
  if (typeof p.promo !== 'boolean') errors.promo = 'Choose whether to apply the promotion.';
  if (!errors.bid && !errors.ask && p.ask < p.bid) errors.ask = 'The bank selling quote must be at least its buying quote.';
  return errors;
}
function requireValid(p) {
  const errors = validate(p);
  if (Object.keys(errors).length) throw new RangeError(Object.entries(errors).map(([k, v]) => `${k}: ${v}`).join(' '));
}
export function rateAtTerm(p, index) {
  if (p.promo && index < p.promoTerms) return p.promoRate;
  return p.rateMode === 'declining'
    ? p.rate + (p.endRate - p.rate) * Math.min(1, index * p.term / 365)
    : p.rate;
}
export function fxAt(p, day) {
  return p.ask * Math.pow(1 + p.depr / 100, day / 365);
}
export function simulate(p) {
  requireValid(p);
  const initialTry = p.currency === 'USD' ? p.capital * p.bid : p.capital;
  const initialUsd = p.currency === 'USD' ? p.capital : p.capital / p.ask;
  let balance = initialTry;
  const completedTerms = Math.floor(p.days / p.term);
  const rows = [{ day: 0, startDay: 0, rate: 0, eligible: 0, gross: 0, tax: 0, net: 0, balance, kind: 'opening' }];
  let grossInterest = 0, withholding = 0;
  for (let index = 0; index < completedTerms; index++) {
    const rate = rateAtTerm(p, index);
    const eligible = Math.max(0, balance - (p.promo && index < p.promoTerms ? p.excluded : 0));
    const gross = eligible * (rate / 100) * p.term / 365;
    const tax = gross * p.tax / 100;
    const net = gross - tax;
    balance += net;
    grossInterest += gross;
    withholding += tax;
    rows.push({ day: (index + 1) * p.term, startDay: index * p.term, rate, eligible, gross, tax, net, balance, kind: 'maturity' });
  }
  const exitAsk = fxAt(p, p.days);
  const finalUsd = balance / exitAsk;
  const unpaidDays = p.days % p.term;
  const profitUsd = finalUsd - initialUsd;
  const returnPct = initialUsd > 0 ? profitUsd / initialUsd * 100 : null;
  // The annual FX increase at which exit USD equals the starting USD benchmark.
  const breakEven = initialUsd > 0 && p.days > 0
    ? Math.expm1(Math.log(balance / (p.ask * initialUsd)) * 365 / p.days) * 100
    : null;
  return { initialTry, initialUsd, finalTry: balance, finalUsd, profitUsd, returnPct,
    exitAsk, completedTerms, unpaidDays, grossInterest, withholding,
    netInterest: grossInterest - withholding, breakEven, rows };
}
/** Daily FX movement, with separate before/after points on every maturity day. */
export function chartSeries(p, out = simulate(p)) {
  const points = [{ day: 0, usd: out.initialTry / p.ask }];
  let balance = out.initialTry, rowIndex = 1;
  for (let day = 1; day <= p.days; day++) {
    const ask = fxAt(p, day);
    points.push({ day, usd: balance / ask });
    if (out.rows[rowIndex]?.day === day) {
      balance = out.rows[rowIndex++].balance;
      points.push({ day, usd: balance / ask });
    }
  }
  return points;
}
export function parseScenario(search) {
  const params = new URLSearchParams(search), p = { ...defaults }, warnings = [];
  for (const key of Object.keys(defaults)) {
    if (!params.has(key)) continue;
    const raw = params.get(key);
    let value;
    if (key === 'promo') value = raw === '1' ? true : raw === '0' ? false : null;
    else if (key in rules) value = raw.trim() === '' ? NaN : Number(raw);
    else value = raw;
    const candidate = { ...p, [key]: value };
    // Cross-field quote ordering is checked after all parameters are read.
    const errors = validate({ ...candidate, ask: key === 'bid' ? Math.max(candidate.ask, candidate.bid) : candidate.ask });
    const error = key === 'ask' && Number.isFinite(value) && value >= rules.ask[0] && value <= rules.ask[1] ? null : errors[key];
    if (error) warnings.push(key); else p[key] = value;
  }
  if (p.ask < p.bid) { p.ask = defaults.ask; p.bid = defaults.bid; warnings.push('bid', 'ask'); }
  return { values: p, warnings: [...new Set(warnings)] };
}
export function scenarioUrl(p, base) {
  requireValid(p);
  const url = new URL(base);
  url.search = ''; url.hash = '';
  // Include every assumption so links remain reproducible if defaults change later.
  url.searchParams.set('v', '1');
  for (const key of Object.keys(defaults)) url.searchParams.set(key, key === 'promo' ? (p[key] ? '1' : '0') : String(p[key]));
  return url.toString();
}
export function ledgerCsv(p, out = simulate(p)) {
  const lines = [
    ['TRY Deposit Simulator — hypothetical scenario, not a forecast'],
    ['Assumption', 'Value'], ...Object.entries(p),
    ['Rounding', 'Full precision in model; displayed ledger amounts rounded to 2 decimals'],
    [], ['Event', 'Start day', 'Day', 'Annual gross rate (%)', 'Eligible TRY', 'Gross interest TRY', 'Withholding TRY', 'Net interest TRY', 'Balance TRY', 'Exit USD selling quote', 'USD liquidation value'],
    ...out.rows.map(r => [r.kind, r.startDay, r.day, r.day ? r.rate.toFixed(6) : '', r.eligible.toFixed(2), r.gross.toFixed(2), r.tax.toFixed(2), r.net.toFixed(2), r.balance.toFixed(2), fxAt(p, r.day).toFixed(6), (r.balance / fxAt(p, r.day)).toFixed(2)]),
    ['exit', out.completedTerms * p.term, p.days, '', '', '0.00', '0.00', '0.00', out.finalTry.toFixed(2), out.exitAsk.toFixed(6), out.finalUsd.toFixed(2)],
    ['Unpaid days in broken term', out.unpaidDays],
  ];
  const quote = value => `"${String(value).replaceAll('"', '""')}"`;
  return '\uFEFF' + lines.map(row => row.map(quote).join(',')).join('\r\n') + '\r\n';
}
