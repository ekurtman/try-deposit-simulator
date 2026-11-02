import test from 'node:test';
import assert from 'node:assert/strict';
import {sources,parseDeposit,parseFx,createRateService} from '../server/bank-sources.js';
import {compareBanks} from '../public/banks.js';
import {defaults,simulate} from '../public/model.js';
import {snapshot,fixture,fixtureFetch} from './bank-fixtures.js';
const now=1800000000000;
const params={...defaults,currency:'TRY',capital:1000000,days:32,depr:0};
for(const [id,count,rate,bid,ask] of [['enpara',16,36,49.0975,50.7975],['isbank',54,30,48.6229,51.3086],['deniz',63,33,48.4123,51.2124],['ziraat',44,31,48.4711,51.422]]) {
  test(`${id}: official fixture parses correct tiers, rate and USD bid/ask`,()=>{
    assert.equal(parseDeposit(id,fixture(id,'deposit')).length,count);
    assert.deepEqual(parseFx(id,fixture(id,'fx')),{bid,ask});
    const row=compareBanks(snapshot(now),params,now).find(r=>r.bank.id===id);assert.equal(row.rate,rate);
    assert.ok(Math.abs(row.outcome.finalTry-1000000*(1+rate/100*32/365*.825))<1e-7);
  });
  test(`${id}: missing/restructured sources fail closed`,()=>{
    assert.throws(()=>parseDeposit(id,'<html>Service unavailable</html>'));
    assert.throws(()=>parseFx(id,'<html>Service unavailable</html>'));
  });
}
test('Enpara balance boundaries are minimum-inclusive and maximum-exclusive',()=>{
  for(const [capital,rate]of [[149999.99,29.5],[150000,34.5],[749999.99,34.5],[750000,36],[1500000,37]])assert.equal(compareBanks(snapshot(now),{...params,capital},now).find(r=>r.bank.id==='enpara').rate,rate);
});
test('bank-specific inclusive tiers, exact supported terms, and gaps are respected',()=>{
  const find=(capital,term,id)=>compareBanks(snapshot(now),{...params,capital,term},now).find(r=>r.bank.id===id);
  assert.equal(find(1000000,32,'isbank').rate,30);assert.equal(find(1000000.01,32,'isbank').rate,30.5);
  assert.equal(find(499999.99,32,'ziraat').rate,30);assert.equal(find(500000,32,'ziraat').rate,31);
  assert.ok(find(999500,32,'deniz').reason);assert.ok(find(1000000,33,'enpara').reason);
  assert.ok(find(999,32,'ziraat').reason);assert.ok(find(999,32,'enpara').reason);assert.equal(find(1000,32,'enpara').rate,29.5);
});
test('USD entry uses each bank’s bid for tier qualification',()=>{
  const data=snapshot(now);const b=data.banks[0];b.fx.bid=50;b.fx.ask=51;
  assert.equal(compareBanks(data,{...params,currency:'USD',capital:3000},now).find(r=>r.bank.id==='enpara').rate,34.5);
});
test('ranking accounts for FX spread, tax, maturity and full selected horizon',()=>{
  const data=snapshot(now);data.banks=data.banks.slice(0,2);
  data.banks[0].fx={status:'ok',bid:40,ask:60};data.banks[1].fx={status:'ok',bid:50,ask:50};
  const p={...params,currency:'USD',capital:20000,days:65,promo:true,promoRate:100,rateMode:'declining'};
  const rows=compareBanks(data,p,now);assert.equal(rows[0].bank.id,'isbank');assert.equal(rows[0].rank,1);
  for(const row of rows){assert.equal(row.outcome.completedTerms,2);assert.equal(row.outcome.unpaidDays,1);assert.equal(row.assumptions.promo,false);assert.equal(row.assumptions.rateMode,'fixed');assert.deepEqual(row.outcome,simulate(row.assumptions));}
  assert.equal(p.promo,true);assert.equal(p.rateMode,'declining');
});
test('ties at displayed cents share a rank and sorting is stable',()=>{
  const data=snapshot(now);data.banks=[data.banks[0],{...structuredClone(data.banks[0]),id:'other',name:'Other'}];
  assert.deepEqual(compareBanks(data,params,now).map(r=>r.rank),[1,1]);
});
test('expired, failed, ambiguous, invalid and zero-capital scenarios cannot rank',()=>{
  assert.ok(compareBanks(snapshot(now),params,now+300000).every(r=>r.reason));
  for(const p of [{...params,capital:0},{...params,term:0},{...params,capital:NaN}])assert.ok(compareBanks(snapshot(now),p,now).every(r=>r.reason));
  const data=snapshot(now);data.banks[0].fx.status='unavailable';data.banks[1].deposit.tiers.push(...data.banks[1].deposit.tiers);data.banks[2].fx.ask=1;
  const rows=compareBanks(data,params,now);assert.equal(rows[0].bank.id,'ziraat');assert.ok(rows.slice(1).every(r=>r.reason&&!r.rank));
});
test('source schemas reject incomplete JSON, inverted FX and invalid rates',()=>{
  const json=JSON.parse(fixture('isbank','deposit'));json.Data.pop();assert.throws(()=>parseDeposit('isbank',JSON.stringify(json)));
  assert.throws(()=>parseFx('enpara',fixture('enpara','fx').replace('50,797500','1,000000')));
  assert.throws(()=>parseDeposit('enpara',fixture('enpara','deposit').replace('%36,00','%999,00')));
});
test('service uses only fixed official endpoints, coalesces requests and expires its cache',async()=>{
  let clock=now,calls=0;const service=createRateService({now:()=>clock,fetcher:async url=>{calls++;return fixtureFetch(url);}});
  const [a,b]=await Promise.all([service(),service()]);assert.deepEqual(a,b);assert.equal(calls,8);assert.ok(a.banks.every(b=>b.deposit.status==='ok'&&b.fx.status==='ok'));
  assert.ok(a.banks.every(b=>b.deposit.sourceUpdatedAt===null));await service();assert.equal(calls,8);
  clock+=300001;await service();assert.equal(calls,16);
});
test('partial outages do not reuse stale data or prevent other banks loading',async()=>{
  let clock=now,fail=false;const service=createRateService({now:()=>clock,fetcher:url=>fail&&url===sources[0].fxUrl?Promise.resolve(new Response('Unavailable',{status:503})):fixtureFetch(url)});
  await service();clock+=300001;fail=true;const result=await service();assert.equal(result.banks[0].fx.status,'unavailable');assert.equal(result.banks[1].fx.status,'ok');assert.equal(compareBanks(result,params,clock).find(r=>r.bank.id==='enpara').rank,undefined);
});
test('timeouts and oversized responses fail closed',async()=>{
  const timeout=createRateService({timeout:5,fetcher:(url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout'))))});
  assert.ok((await timeout()).banks.every(b=>b.fx.status==='unavailable'));
  const large=createRateService({fetcher:async()=>new Response('x'.repeat(1500001))});assert.ok((await large()).banks.every(b=>b.deposit.status==='unavailable'));
});
test('API rejects mutations and disallows HTTP caching',async()=>{
  const {default:handler}=await import('../api/bank-rates.js');const headers={};let status,body;
  const res={setHeader:(key,value)=>headers[key]=value,status(code){status=code;return this;},json(value){body=value;}};
  await handler({method:'POST'},res);assert.equal(status,405);assert.equal(headers.Allow,'GET');assert.equal(headers['Cache-Control'],'no-store');assert.equal(body.error,'Method not allowed');
});
