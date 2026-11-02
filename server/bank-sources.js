import { load } from 'cheerio';
export const sources = [
  { id: 'enpara', name: 'Enpara', minimumDeposit: 1000, channel: 'Digital term deposit', depositUrl: 'https://www.enpara.com/hesaplar/vadeli-mevduat-hesabi', fxUrl: 'https://www.enpara.com/hesaplar/doviz-ve-altin-kurlari', note: 'The rate tier uses your total Enpara balances. This comparison assumes no other balances. Minimum opening deposit: 1,000 TL.' },
  { id: 'isbank', name: 'Türkiye İş Bankası', channel: 'İşCep term deposit', depositUrl: 'https://www.isbank.com.tr/vadeli-tl', ratesUrl: 'https://www.isbank.com.tr/_vti_bin/DV.Isbank/PriceAndRate/PriceAndRateService.svc/GetTermRates?MethodType=TL&Lang=tr&ProductType=UzunVadeli&ChannelType=ISCEP', fxUrl: 'https://www.isbank.com.tr/doviz-kurlari', note: 'Published İşCep standard rates and website FX quotes. Personalized offers may differ.' },
  { id: 'deniz', name: 'DenizBank', channel: 'Internet / mobile term deposit', depositUrl: 'https://www.denizbank.com/hesap/vadeli-mevduat', fxUrl: 'https://www.denizbank.com/yatirim/piyasalar', note: 'Standard digital rates only. Welcome campaigns are excluded. Gaps in published balance bands are not interpolated.' },
  { id: 'ziraat', name: 'Ziraat Bankası', channel: 'Internet branch term deposit', depositUrl: 'https://www.ziraatbank.com.tr/tr/bireysel/mevduat/vadeli-hesaplar/vadeli-tl-mevduat-hesaplari/vadeli-tl-mevduat-hesabi', fxUrl: 'https://www.ziraatbank.com.tr/tr/fiyatlar-ve-oranlar', note: 'Internet branch deposit rates and internet branch FX quotes. Special payout products are excluded.' },
];
const clean = s => s.replace(/\s+/g, ' ').trim();
function number(s, locale = 'tr') {
  s = clean(s).replace(/TL|%/g, '').trim();
  if (!(locale === 'tr' ? /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/ : /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/).test(s)) throw Error('Invalid numeric source');
  const n = Number(locale === 'tr' ? s.replaceAll('.', '').replace(',', '.') : s.replaceAll(',', ''));
  if (!Number.isFinite(n)) throw Error('Invalid numeric source');
  return n;
}
function range(s) {
  const parts = clean(s).replace(/TL/g, '').trim().split(/\s*-\s*/);
  if (parts.length === 2) return { min: number(parts[0]), max: number(parts[1]) };
  if (/ve üzeri/.test(s)) return { min: number(parts[0].replace('ve üzeri', '').trim()), max: null };
  throw Error('Unknown balance range');
}
function checkTiers(tiers) {
  if (!tiers.length || tiers.length > 1000) throw Error('Missing rate table');
  for (const t of tiers) {
    if (![t.min,t.daysMin,t.daysMax,t.rate].every(Number.isFinite) || t.min < 0 || (t.max !== null && (!Number.isFinite(t.max) || t.max < t.min)) || !Number.isInteger(t.daysMin) || !Number.isInteger(t.daysMax) || t.daysMin < 1 || t.daysMax < t.daysMin || t.rate < 0 || t.rate > 200) throw Error('Invalid rate table');
  }
  return tiers;
}
export function parseDeposit(id, body) {
  if (id === 'isbank') {
    const data = JSON.parse(body); if (data.Success !== true || !Array.isArray(data.Data)) throw Error('Invalid bank response');
    const [cols,rows,count] = data.Data[0].split('#').map(Number);
    if (cols * rows !== count || count !== data.Data.length - 1) throw Error('Incomplete bank response');
    return checkTiers(data.Data.slice(1).map(row => {
      const parts = row.split('#'); if (parts.length !== 5) throw Error('Unknown rate format');
      const [min,max,daysMin,daysMax,rate] = parts.map(s => /^-1(?:\.00)?$/.test(s) ? -1 : number(s, 'en'));
      return {min,max:max === -1 ? null : max,daysMin,daysMax:daysMax === -1 ? 3650 : daysMax,rate,maxExclusive:false};
    }));
  }
  const $ = load(body), tiers = [];
  if (id === 'enpara') {
    const cells = $('.enpara-deposit-interest-rates__flex-table.TRY .enpara-deposit-interest-rates__flex-table-item');
    let band;
    cells.each((_, cell) => {
      const head = clean($(cell).find('.enpara-deposit-interest-rates__flex-table-head').text());
      const value = clean($(cell).find('.enpara-deposit-interest-rates__flex-table-value').text());
      if (!value) return;
      if (head === 'Mevduat büyüklüğü') band = range(value);
      else {
        const day = head.match(/^(\d+) Gün$/); if (!day || !band) throw Error('Unknown term format');
        tiers.push({...band,daysMin:Number(day[1]),daysMax:Number(day[1]),rate:number(value),maxExclusive:true});
      }
    });
  } else if (id === 'deniz' || id === 'ziraat') {
    const table = $(id === 'deniz' ? '#tab5 table' : '[data-id="rdIntBranchVadeliTL"] table').first();
    const rows = table.find('tr').toArray();
    const header = $(rows[id === 'deniz' ? 1 : 0]).find('th,td').toArray().map(cell => clean($(cell).text()));
    if (!(id === 'deniz' ? header[0] === 'Gün' : header[0] === 'Vade Grupları')) throw Error('Unknown table headers');
    const bands = header.slice(1).map(range);
    for (const row of rows.slice(id === 'deniz' ? 2 : 1)) {
      const cells = $(row).find('th,td').toArray().map(c => clean($(c).text()));
      const days = cells[0]?.match(/^(\d+)\s*-\s*(\d+)(?: gün)?$/i);
      if (!days) continue; // Explicitly excludes special periodic-payout products.
      if (cells.length !== bands.length + 1) throw Error('Incomplete rate row');
      bands.forEach((band,i) => tiers.push({...band,daysMin:Number(days[1]),daysMax:Number(days[2]),rate:number(cells[i+1],'en'),maxExclusive:false}));
    }
  } else throw Error('Unknown bank');
  return checkTiers(tiers);
}
export function parseFx(id, body) {
  const $ = load(body); let bid, ask;
  if (id === 'enpara') {
    const rows = $('.enpara-gold-exchange-rates__table-item.USD');
    if (rows.length !== 1) throw Error('Missing USD quote');
    const values = rows.find('span').toArray().map(c => clean($(c).text()));
    if (values.length !== 3 || !values[0].startsWith('USD')) throw Error('Unknown FX row');
    bid = number(values[1]); ask = number(values[2]);
  } else if (id === 'deniz') {
    const row = $('.market-data').filter((_,r) => clean($(r).find('.title b').first().text()) === 'USD');
    if (row.length !== 1) throw Error('Missing USD quote');
    row.find('.right-column .column').each((_,c) => {
      const label = clean($(c).find('.title').text()), value = clean($(c).find('.value').text());
      if (label === 'Alış') bid = number(value,'en'); if (label === 'Satış') ask = number(value,'en');
    });
  } else {
    const table = $(id === 'isbank' ? '.dk_MT' : '[data-id="rdIntBranchDoviz"] table').first();
    const headers = clean(table.find('tr').first().text());
    if (!/Alış/.test(headers) || !/Satış/.test(headers) || headers.indexOf('Alış') > headers.indexOf('Satış')) throw Error('Unknown FX headers');
    const rows = table.find('tr').filter((_,r) => /^USD(?:\s|$)/.test(clean($(r).find('td').first().text())));
    if (rows.length !== 1) throw Error('Missing USD quote');
    const cells = rows.find('td').toArray().map(c => clean($(c).text()));
    const offset = id === 'isbank' ? 1 : 2;
    bid = number(cells[offset]); ask = number(cells[offset+1]);
  }
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask < bid || ask > 1e6) throw Error('Invalid USD quotes');
  return {bid,ask};
}
export function createRateService({fetcher = fetch, now = Date.now, timeout = 10000, cacheMs = 300000} = {}) {
  let cached, pending;
  async function get(url, parser) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetcher(url,{signal:controller.signal,redirect:'error',headers:{'User-Agent':'TRYDepositSimulator/1.0 (public rate comparison)','Accept':'text/html,application/json'}});
      if (!response.ok) throw Error('Source unavailable');
      let body = '', bytes = 0; const decoder = new TextDecoder();
      for await (const chunk of response.body) { bytes += chunk.byteLength; if (bytes > 1500000) throw Error('Source too large'); body += decoder.decode(chunk,{stream:true}); }
      body += decoder.decode();
      return {status:'ok',...parser(body),fetchedAt:new Date(now()).toISOString(),sourceUpdatedAt:null};
    } catch { return {status:'unavailable',message:'The official source could not be fetched or its format changed.'}; }
    finally { clearTimeout(timer); }
  }
  return async function bankRates() {
    if (cached && now() < Date.parse(cached.expiresAt)) return cached;
    if (pending) return pending;
    pending = (async () => {
      const banks = await Promise.all(sources.map(async source => {
        const [deposit,fx] = await Promise.all([get(source.ratesUrl || source.depositUrl,b => ({tiers:parseDeposit(source.id,b)})),get(source.fxUrl,b => parseFx(source.id,b))]);
        return {...source,deposit,fx};
      }));
      cached = {banks,fetchedAt:new Date(now()).toISOString(),expiresAt:new Date(now()+cacheMs).toISOString()};
      return cached;
    })();
    try { return await pending; } finally { pending = null; }
  };
}
export const bankRates = createRateService();
