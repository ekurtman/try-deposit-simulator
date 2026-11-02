import { simulate, validate } from './model.js';
export function compareBanks(snapshot, p, now = Date.now()) {
  if (!snapshot || !Array.isArray(snapshot.banks)) return [];
  const valid = Object.keys(validate(p)).length === 0 && p.capital > 0;
  return snapshot.banks.map(bank => {
    let reason;
    if (!valid) reason = 'Enter valid assumptions and positive capital.';
    else if (!Number.isFinite(Date.parse(snapshot.expiresAt)) || now >= Date.parse(snapshot.expiresAt)) reason = 'Snapshot expired. Refresh bank data.';
    else if (bank.deposit?.status !== 'ok' || bank.fx?.status !== 'ok') reason = 'Official rates or FX quotes unavailable.';
    else if (![bank.fx.bid,bank.fx.ask].every(Number.isFinite) || bank.fx.bid <= 0 || bank.fx.ask < bank.fx.bid) reason = 'Invalid FX quote.';
    if (reason) return {bank,reason};
    // Match actual spendable minor units; calculation itself retains full precision.
    const amount = Math.round((p.currency === 'USD' ? p.capital * bank.fx.bid : p.capital)*100)/100;
    if (amount < (bank.minimumDeposit || 0)) return {bank,reason:'Below the bank’s minimum opening deposit.'};
    const matches = bank.deposit.tiers.filter(t => amount >= t.min && (t.max === null || (t.maxExclusive ? amount < t.max : amount <= t.max)) && p.term >= t.daysMin && p.term <= t.daysMax);
    if (matches.length !== 1 || matches[0].rate <= 0) return {bank,reason:'No unambiguous standard offer for this amount and term.'};
    const rate = matches[0].rate;
    const assumptions = {...p,rate,bid:bank.fx.bid,ask:bank.fx.ask,promo:false,rateMode:'fixed'};
    if (Object.keys(validate(assumptions)).length) return {bank,reason:'Invalid published rate.'};
    const outcome = simulate(assumptions);
    return {bank,assumptions,outcome,rate,spread:bank.fx.ask-bank.fx.bid,spreadPct:100*(1-bank.fx.bid/bank.fx.ask)};
  }).sort((a,b) => {
    if (a.reason || b.reason) return Number(Boolean(a.reason))-Number(Boolean(b.reason)) || a.bank.name.localeCompare(b.bank.name);
    return Math.round(b.outcome.finalUsd*100)-Math.round(a.outcome.finalUsd*100) || a.bank.name.localeCompare(b.bank.name);
  }).map((row,i,rows) => {
    if (!row.reason) row.rank = i && !rows[i-1].reason && Math.round(row.outcome.finalUsd*100) === Math.round(rows[i-1].outcome.finalUsd*100) ? rows[i-1].rank : i+1;
    return row;
  });
}
