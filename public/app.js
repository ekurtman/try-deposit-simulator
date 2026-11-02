import { initBanks } from './bank-ui.js';
import { defaults, rules, validate, simulate, chartSeries, parseScenario, scenarioUrl, ledgerCsv } from './model.js';
const el = id => document.getElementById(id);
const money = (n, sign = false) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', signDisplay: sign ? 'exceptZero' : 'auto' }).format(n);
const tl = n => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fx = n => new Intl.NumberFormat('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(n);
const pct = n => n === null ? 'N/A' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
const ids = Object.keys(defaults);
let current, outcome, banks;
function setInputs(p) {
  for (const key of ids) {
    // Older shared URLs can contain other valid integer term lengths.
    if (key === 'term' && ![...el(key).options].some(o => Number(o.value) === p.term)) {
      const option = document.createElement('option'); option.value = p.term; option.textContent = `${p.term} days`; el(key).append(option);
    }
    if (key === 'promo') el(key).checked = p[key]; else el(key).value = p[key];
  }
  if (p.promo || p.rateMode !== 'fixed') document.querySelector('.advanced').open = true;
}
function readInputs() {
  return Object.fromEntries(ids.map(key => [key, key === 'promo' ? el(key).checked : key in rules ? (el(key).value.trim() === '' ? NaN : Number(el(key).value)) : el(key).value]));
}
function chart(p, out) {
  const points = chartSeries(p, out), w = Math.min(660, Math.max(240, el('chart').clientWidth)), h = w < 450 ? 230 : 270, left = w < 450 ? 52 : 62, right = 18, top = 20, bottom = 35;
  el('chart').setAttribute('viewBox', `0 0 ${w} ${h}`);
  const values = points.map(pt => pt.usd);
  let lo = Math.min(out.initialUsd, ...values), hi = Math.max(out.initialUsd, ...values);
  const pad = Math.max(1, (hi - lo) * .2); lo = Math.max(0, lo - pad); hi += pad;
  const x = d => left + (w - left - right) * d / Math.max(1, p.days);
  const y = v => top + (h - top - bottom) * (hi - v) / (hi - lo);
  const shortMoney = n => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n);
  let markup = `<title id="chartTitle">USD liquidation value over ${p.days} days</title><desc id="chartDescription">Starts at ${money(points[0].usd)} after entry conversion and ends at ${money(out.finalUsd)}. ${out.completedTerms} completed maturities credit net interest. The dashed line is the ${money(out.initialUsd)} starting USD benchmark.</desc><defs><linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#d5e6c2" stop-opacity=".55"/><stop offset="100%" stop-color="#f8fbf4" stop-opacity=".15"/></linearGradient></defs>`;
  for (let i = 0; i < 5; i++) {
    const v = lo + (hi - lo) * i / 4;
    markup += `<line class="chart-grid" x1="${left}" y1="${y(v)}" x2="${w-right}" y2="${y(v)}"/><text class="chart-axis" x="${left-10}" y="${y(v)+4}" text-anchor="end">$${shortMoney(v)}</text>`;
  }
  const path = points.map((pt, i) => `${i ? 'L' : 'M'}${x(pt.day).toFixed(3)},${y(pt.usd).toFixed(3)}`).join(' ');
  markup += `<path class="chart-fill" d="${path} L${x(p.days)},${h-bottom} L${left},${h-bottom} Z"/><line class="chart-ref" x1="${left}" y1="${y(out.initialUsd)}" x2="${w-right}" y2="${y(out.initialUsd)}"/><path class="chart-path" d="${path}"/><circle class="chart-end" cx="${x(p.days)}" cy="${y(out.finalUsd)}" r="4"/>`;
  const ticks = [...new Set(Array.from({length:w < 450 ? 3 : 5}, (_, i) => Math.round(p.days * i / (w < 450 ? 2 : 4))))];
  for (const day of ticks) markup += `<text class="chart-axis" x="${x(day)}" y="${h-10}" text-anchor="middle">Day ${day}</text>`;
  el('chart').innerHTML = markup;
}
function render() {
  const p = readInputs(), errors = validate(p), invalid = Object.keys(errors).length > 0;
  el('endRateWrap').hidden = p.rateMode !== 'declining'; el('promoFields').hidden = !p.promo;
  el('capital-help').textContent = p.currency === 'TRY' ? 'TRY is deposited directly. The USD benchmark is its conversion value today.' : 'USD is converted to TRY at the bank’s buying quote.';
  for (const key of ids) {
    el(key).setAttribute('aria-invalid', String(Boolean(errors[key])));
    if (el(key + '-error')) el(key + '-error').textContent = errors[key] || '';
  }
  el('inputErrors').hidden = !invalid;
  el('inputErrors').textContent = invalid ? 'Check the highlighted assumptions. Results are paused until all inputs are valid.' : '';
  el('results').hidden = invalid; el('invalidResults').hidden = !invalid; el('ledgerPanel').hidden = invalid;
  el('share').disabled = invalid; el('csv').disabled = invalid;
  document.querySelectorAll('[data-days]').forEach(button => { const active = Number(button.dataset.days) === p.days; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  if (invalid) { current = null; outcome = null; return; }
  current = p; outcome = simulate(p); const out = outcome;
  el('finalUsd').textContent = money(out.finalUsd); el('profit').textContent = money(out.profitUsd, true);
  el('profit').className = 'profit-number ' + (out.profitUsd < 0 ? 'negative' : 'positive');
  el('roi').textContent = out.returnPct === null ? 'Return not defined for zero capital' : `${pct(out.returnPct)} total USD return`;
  el('roi').className = 'return-chip ' + (out.profitUsd < 0 ? 'negative' : 'positive');
  el('periodTag').textContent = `${p.days} DAYS`; el('cycles').textContent = out.completedTerms; el('remainder').textContent = out.unpaidDays;
  el('breakeven').textContent = out.breakEven === null ? 'N/A' : Math.abs(out.breakEven) > 1e6 ? `${out.breakEven.toExponential(2)}%` : pct(out.breakEven);
  el('exitNote').textContent = out.unpaidDays ? `Exit on day ${p.days}: the last ${out.unpaidDays} days are in an unfinished term and earn no interest. Previously credited interest is kept.` : p.days === 0 ? 'Immediate exit: no deposit interest. A USD entry still incurs the quoted buy/sell spread.' : `Exit on day ${p.days} is exactly at maturity. All ${out.completedTerms} completed terms are included.`;
  const breakdown = [
    ['Starting deposit', `₺${tl(out.initialTry)}`],
    ['Gross interest earned', `+ ₺${tl(out.grossInterest)}`],
    ['Withholding deducted', `− ₺${tl(out.withholding)}`],
    ['Net interest earned', `₺${tl(out.netInterest)}`, 'emphasized'],
    ['Final TRY balance', `₺${tl(out.finalTry)}`, 'emphasized'],
    ['Exit USD selling quote', `₺${fx(out.exitAsk)}`],
    ['Starting USD benchmark', money(out.initialUsd)],
  ];
  el('breakdown').innerHTML = breakdown.map(([label, value, cls = '']) => `<div class="${cls}"><dt>${label}</dt><dd>${value}</dd></div>`).join('');
  const options = [...new Set([0,10,15,20,25,30,40,50,p.depr])].sort((a,b)=>a-b);
  el('scenarios').innerHTML = options.map(depr => {
    const scenario = simulate({...p,depr}), selected = depr === p.depr;
    return `<tr class="${selected ? 'selected' : ''}"><td><button type="button" data-depr="${depr}" aria-label="Use ${depr}% annual USD/TRY increase" aria-pressed="${selected}">${depr}%${selected ? ' •' : ''}</button></td><td>${money(scenario.finalUsd)}</td><td class="${scenario.profitUsd < 0 ? 'negative' : 'positive'}">${pct(scenario.returnPct)}</td></tr>`;
  }).join('');
  el('ledger').innerHTML = out.rows.map(r => `<tr><td>${r.day ? 'Maturity' : 'Opening'} <span class="event-tag">/ ${r.day}</span></td><td>${r.day ? r.rate.toFixed(2) + '%' : '—'}</td><td>${r.day ? tl(r.eligible) : '—'}</td><td>${r.day ? tl(r.gross) : '—'}</td><td>${r.day ? tl(r.tax) : '—'}</td><td>${r.day ? tl(r.net) : '—'}</td><td>${tl(r.balance)}</td></tr>`).join('') + `<tr class="exit-row"><td>Exit <span class="event-tag">/ ${p.days}</span></td><td>—</td><td>—</td><td>0.00</td><td>0.00</td><td>0.00</td><td>${tl(out.finalTry)}</td></tr>`;
  chart(p, out);
}
function edited() { el('copyStatus').textContent = ''; render(); banks?.update(true); }
ids.forEach(key => el(key).addEventListener(el(key).type === 'checkbox' || el(key).tagName === 'SELECT' ? 'change' : 'input', edited));
el('assumptions').addEventListener('submit', e => e.preventDefault());
document.querySelectorAll('[data-days]').forEach(button => button.addEventListener('click', () => { el('days').value = button.dataset.days; edited(); }));
el('scenarios').addEventListener('click', e => { const button = e.target.closest('[data-depr]'); if (button) { el('depr').value = button.dataset.depr; edited(); } });
el('share').addEventListener('click', async () => {
  if (!current) return;
  const url = scenarioUrl(current, location.href);
  try { await navigator.clipboard.writeText(url); el('copyStatus').textContent = 'Scenario link copied. It includes all of your assumptions.'; }
  catch { el('copyStatus').textContent = 'Copy this scenario link: ' + url; }
});
el('reset').addEventListener('click', () => {
  setInputs(defaults); document.querySelector('.advanced').open = false;
  history.replaceState(null, '', location.pathname); el('urlWarning').hidden = true;
  render(); banks?.update(true); el('copyStatus').textContent = 'Illustrative defaults restored.';
});
el('example').addEventListener('click', () => {
  setInputs({ ...defaults, currency: 'TRY', capital: 1000000, days: 32, rate: 36, tax: 17.5, depr: 0, bid: 50, ask: 50 });
  el('urlWarning').hidden = true; edited(); el('copyStatus').textContent = 'Loaded the 1,000,000 TL, 32-day validation example.';
});
el('csv').addEventListener('click', () => {
  if (!current) return;
  const url = URL.createObjectURL(new Blob([ledgerCsv(current, outcome)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'try-deposit-ledger.csv'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
const loaded = parseScenario(location.search); setInputs(loaded.values);
if (loaded.warnings.length) { el('urlWarning').hidden = false; el('urlWarning').textContent = `Invalid shared assumptions (${loaded.warnings.join(', ')}) were replaced with illustrative defaults. Review them before using these results.`; }
render();

window.addEventListener('resize', () => { if (current && outcome) chart(current, outcome); });

banks = initBanks({getInputs:readInputs,apply:p=>{setInputs(p);render();}});
