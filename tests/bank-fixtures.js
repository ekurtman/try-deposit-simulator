import { readFileSync } from 'node:fs';
import { sources,parseDeposit,parseFx } from '../server/bank-sources.js';
export const fixture = (id,kind) => readFileSync(new URL(`./fixtures/${id}-${kind}.${id==='isbank'&&kind==='deposit'?'json':'html'}`,import.meta.url),'utf8');
export function snapshot(now=Date.now()) {
  return {fetchedAt:new Date(now).toISOString(),expiresAt:new Date(now+300000).toISOString(),banks:sources.map(s=>({...s,deposit:{status:'ok',tiers:parseDeposit(s.id,fixture(s.id,'deposit')),fetchedAt:new Date(now).toISOString()},fx:{status:'ok',...parseFx(s.id,fixture(s.id,'fx')),fetchedAt:new Date(now).toISOString()}}))};
}
export function fixtureFetch(url) {
  const source=sources.find(s=>[s.depositUrl,s.ratesUrl,s.fxUrl].includes(url));
  if(!source)throw Error('Non-allowlisted URL');
  return Promise.resolve(new Response(fixture(source.id,url===source.fxUrl?'fx':'deposit')));
}
