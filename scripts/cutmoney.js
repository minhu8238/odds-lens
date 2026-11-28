const fs=require('fs'),zlib=require('zlib');
const pct=(o,t)=>{const js=t?[0,1,2]:[0,2],s=js.reduce((a,j)=>a+1/o[j],0);return [0,1,2].map(j=>js.includes(j)?1/o[j]/s*100:0)};
for(const sp of ['soccer','basketball','baseball','volleyball']){const ST={};const add=(k,p,hit,odd)=>{const s=ST[k]||(ST[k]={n:0,hit:0,exp:0,ret:0});s.n++;s.exp+=p/100;if(hit){s.hit++;s.ret+=odd}};
 for(const l of zlib.gunzipSync(fs.readFileSync('data/history/pair_'+sp+'.csv.gz')).toString().split('\n')){const a=l.split(',');if(a.length<28)continue;const n=i=>+a[i];
  const ni=[n(5),n(6),n(7)],nf=[n(8),n(9),n(10)],nv=[n(12),n(13),n(14)],ln=n(15),hi=[n(16),n(17),n(18)],hf=[n(19),n(20),n(21)],r1=n(26),ihc=a.length>=29&&a[28]!==''?n(28):ln;
  if(!(nf[0]>1&&nf[2]>1&&ni[0]>1&&ni[2]>1&&hi[0]>1&&hf[0]>1)||!(r1>=0))continue;
  const n3=nf[1]>1,pf=pct(nf,n3),pi=pct(ni,n3),hm=pf[0]-pi[0];if(Math.abs(hm)<1)continue;
  const toHome=hm>0,j=toHome?0:2,h3=hf[1]>1,hpf=pct(hf,h3),hpi=pct(hi,h3),hhm=hpf[0]-hpi[0],lmv=ln-ihc;
  const hdir=lmv!==0?(lmv<0?1:-1):(Math.abs(hhm)>=1?Math.sign(hhm):0);const agree=hdir===0?'그대로':(hdir>0)===toHome?'같은쪽':'반대쪽';
  const vs=nv.reduce((x,y)=>x+y,0);if(!(vs>50))continue;const sk=nv[j]/vs*100-pf[j];const money=sk<=-5?'돈적은쪽':sk>=15?'돈몰린쪽':'중간';
  const per=a[0]<'20250101'?'~2024':'2025~';
  add(per+'|'+money+' + 핸디 '+agree,pf[j],r1===j,nf[j]);add('전체|'+money+' + 핸디 '+agree,pf[j],r1===j,nf[j])}
 console.log('\n['+sp+'] 잘린 쪽 결과: 기간별');
 const labs=[...new Set(Object.keys(ST).map(k=>k.split('|')[1]))].sort();
 const f=s=>s?`${String(s.n).padStart(5)} ${((s.hit-s.exp)/s.n*100>=0?'+':'')+((s.hit-s.exp)/s.n*100).toFixed(1)}%p 수익 ${((s.ret/s.n-1)*100).toFixed(0)}%`:'-';
 for(const lb of labs)console.log('  '+lb.padEnd(22),'| ~2024',f(ST['~2024|'+lb]).padEnd(24),'| 2025~',f(ST['2025~|'+lb]))}
