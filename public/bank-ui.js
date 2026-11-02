import { compareBanks } from './banks.js';
export function initBanks({getInputs,apply}) {
  const el = id => document.getElementById(id);
  let snapshot, expiredRendered = false, selected = '', loading = false, rows = [];
  const money = n => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
  const time = value => new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
  function node(tag,text,className) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if(className) n.className = className; return n; }
  function render() {
    rows = compareBanks(snapshot,getInputs());
    el('bankSelect').replaceChildren(new Option('Manual assumptions / select a bank',''));
    el('bankRows').replaceChildren();
    for (const row of rows) {
      const {bank} = row, option = new Option(`${bank.name}${row.reason ? ' — unavailable for this scenario' : ` — ${row.rate.toFixed(2)}%`}`,bank.id);
      option.disabled = Boolean(row.reason); el('bankSelect').append(option);
      const tr = node('tr');if(row.reason)tr.className='no-offer';
      tr.append(node('td',row.reason ? '—' : String(row.rank)));
      const bankCell = node('td'); bankCell.append(node('strong',bank.name),node('small',bank.channel,'bank-sub'));
      const details = node('details'), summary = node('summary','Sources & eligibility'); details.append(summary,node('p',bank.note));
      for (const [label,url,data] of [['Deposit source',bank.depositUrl,bank.deposit],['FX source',bank.fxUrl,bank.fx]]) {
        const a = node('a',label); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; details.append(a,node('p',data.status === 'ok' ? `Fetched ${time(data.fetchedAt)}. Bank quote-update time unavailable.` : 'Source unavailable.'));
      }
      bankCell.append(details); tr.append(bankCell);
      if(row.reason) {const cell=node('td',row.reason,'help');cell.colSpan=4;tr.append(cell);}
      else {
        tr.append(node('td',`${row.rate.toFixed(2)}%`));
        const quote=node('td',`${bank.fx.bid.toFixed(4)} / ${bank.fx.ask.toFixed(4)}`);quote.append(node('small',`Spread ₺${row.spread.toFixed(4)} · ${row.spreadPct.toFixed(2)}% round-trip FX cost`,'bank-sub'));tr.append(quote);
        tr.append(node('td',money(row.outcome.finalUsd)));
        const action=node('td'),button=node('button','Use bank','button secondary');button.type='button';button.dataset.bank=bank.id;button.addEventListener('click',()=>select(bank.id));action.append(button);tr.append(action);
      }
      [...tr.children].forEach((cell,i)=>cell.dataset.label=['Rank','Bank / product','Gross annual','USD buy / sell (TRY)','Final USD','Select'][i]);
      el('bankRows').append(tr);
    }
    el('bankSelect').value = selected;
    el('bankSelect').disabled = !rows.some(row=>!row.reason);
    const expired = snapshot && Date.now() >= Date.parse(snapshot.expiresAt);expiredRendered = Boolean(expired);
    el('bankStatus').textContent = loading ? 'Fetching official bank sources…' : !snapshot ? 'Bank data unavailable. Manual inputs remain available.' : expired ? 'Snapshot expired. Refresh to select or rank banks. Previously applied assumptions remain unchanged.' : `${rows.filter(r=>!r.reason).length} of ${rows.length} supported banks eligible. Fetched ${time(snapshot.fetchedAt)}. Cached for up to 5 minutes; these are indicative public quotes, not executable offers.`;
  }
  function select(id) {
    const row = compareBanks(snapshot,getInputs()).find(row=>row.bank.id===id);
    if (!id) { selected='';el('bankApplied').textContent='Manual assumptions. Shared links preserve numeric inputs, not live bank eligibility.';render();return; }
    if (!row || row.reason) {render();return;}
    selected=id;apply(row.assumptions);
    el('bankApplied').textContent=`Applied ${row.bank.name} snapshot: ${row.rate.toFixed(2)}% gross, USD buy ${row.bank.fx.bid.toFixed(4)} / sell ${row.bank.fx.ask.toFixed(4)}. Promotions turned off; today’s rate held at renewals. Tax and future FX remain your assumptions. Verify the offer in the bank app.`;
    render();
  }
  async function refresh() {
    if(loading)return;if(selected){selected='';el('bankApplied').textContent='Bank data refreshed separately. Previously applied calculator inputs are unchanged; select a bank to apply a new snapshot.';}loading=true;el('refreshBanks').disabled=true;render();
    try {
      const response=await fetch('/api/bank-rates',{signal:AbortSignal.timeout(25000),cache:'no-store'});
      if(!response.ok)throw Error('Unavailable');const data=await response.json();
      if(!Array.isArray(data.banks)||!Number.isFinite(Date.parse(data.expiresAt)))throw Error('Invalid response');
      snapshot=data;
    } catch {snapshot=null;}
    finally {loading=false;el('refreshBanks').disabled=false;render();}
  }
  el('bankSelect').addEventListener('change',e=>select(e.target.value));el('refreshBanks').addEventListener('click',refresh);
  refresh();setInterval(()=>{if(snapshot && !expiredRendered && Date.now()>=Date.parse(snapshot.expiresAt))render();},1000);
  return {update(manual=false) {if(manual && selected){selected='';el('bankApplied').textContent='Inputs edited. Current values are a manual scenario; select a bank again to apply its eligible rate.';}render();}};
}
