// 5가지 조건(일반 최종 / 핸디 최종 / 배변 유무 / 구매율 / 절삭량) 조합 검증
// 날짜순: 그 날 이전 경기만으로 판정 → 실제 결과와 비교
const fs=require('fs'),zlib=require('zlib');
const pct=(o,t)=>{const js=t?[0,1,2]:[0,2],s=js.reduce((a,j)=>a+1/o[j],0);return [0,1,2].map(j=>js.includes(j)?1/o[j]/s*100:0)};
const TOL=+process.env.TOL||0.05,VT=+process.env.VT||7,QT=+process.env.QT||1.5,MINN=+process.env.MINN||8,RES=+process.env.RES||10;
const OPTS=['H','C','V','Q'],NAME={H:'핸디최종',C:'배변유무',V:'구매율',Q:'절삭량'};
const COMBOS=[];for(let m=0;m<16;m++)COMBOS.push(OPTS.filter((_,i)=>m>>i&1));
const sports=(process.env.SP||'soccer,basketball,baseball,volleyball').split(',');
for(const sp of sports){
 const G=[];
 for(const l of zlib.gunzipSync(fs.readFileSync('data/history/pair_'+sp+'.csv.gz')).toString().split('\n')){const a=l.split(',');if(a.length<28)continue;const n=i=>+a[i];
  const ni=[n(5),n(6),n(7)],nf=[n(8),n(9),n(10)],nv=[n(12),n(13),n(14)],ln=n(15),hi=[n(16),n(17),n(18)],hf=[n(19),n(20),n(21)],r1=n(26),ihc=a.length>=29&&a[28]!==''?n(28):ln;
  if(!(nf[0]>1&&nf[2]>1&&ni[0]>1&&ni[2]>1&&hf[0]>1&&hf[2]>1)||!(r1>=0&&r1<=2))continue;
  const n3=nf[1]>1;if(!n3&&r1===1)continue;const vs=nv[0]+nv[1]+nv[2];if(!(vs>50))continue;
  const pf=pct(nf,n3),pi=pct(ni,n3);
  G.push({d:a[0].slice(0,8),nf,hf,ln,n3,pf,r1,cN:n(11)>0,cH:n(22)>0||ln!==ihc,v:nv.map(x=>x/vs*100),q:[0,1,2].map(j=>pf[j]-pi[j])});
 }
 G.sort((x,y)=>x.d<y.d?-1:1);
 const IDX=new Map(),key=(ln,a,b)=>ln+'|'+a+'|'+b;
 const R={};const rec=(k,g,j)=>{const s=R[k]||(R[k]={n:0,hit:0,exp:0,ret:0});s.n++;s.exp+=g.pf[j]/100;if(g.r1===j){s.hit++;s.ret+=g.nf[j]}};
 let i=0;
 while(i<G.length){const d=G[i].d;let e=i;while(e<G.length&&G[e].d===d)e++;
  for(let t=i;t<e;t++){const g=G[t],a=Math.round(g.nf[0]/0.05),b=Math.round(g.nf[2]/0.05),r=Math.ceil(TOL/0.05);
   const cand=[];for(let x=-r;x<=r;x++)for(let y=-r;y<=r;y++){const L=IDX.get(key(g.ln,a+x,b+y));if(L)for(const h of L)cand.push(h)}
   const base=cand.filter(h=>h.n3===g.n3&&[0,1,2].every(j=>Math.abs(h.nf[j]-g.nf[j])<=TOL+1e-9));
   const per=g.d<'20250101'?'~2024':'2025~';
   for(const c of COMBOS){
    const m=base.filter(h=>(!c.includes('H')||[0,1,2].every(j=>Math.abs(h.hf[j]-g.hf[j])<=TOL+1e-9))&&(!c.includes('C')||(h.cN===g.cN&&h.cH===g.cH))&&(!c.includes('V')||[0,1,2].every(j=>Math.abs(h.v[j]-g.v[j])<=VT))&&(!c.includes('Q')||[0,1,2].every(j=>Math.abs(h.q[j]-g.q[j])<=QT)));
    if(m.length<MINN)continue;
    let best=-1,br=-1e9;for(const j of (g.n3?[0,1,2]:[0,2])){const act=m.filter(h=>h.r1===j).length/m.length*100,exp=m.reduce((s,h)=>s+h.pf[j],0)/m.length,res=act-exp;if(res>br){br=res;best=j}}
    if(br<RES)continue;const nm=['일반최종',...c.map(x=>NAME[x])].join('+');
    rec(per+'|'+nm,g,best);rec('전체|'+nm,g,best);if(g.nf[best]<3)rec('3.0미만|'+nm,g,best);
   }}
  for(let t=i;t<e;t++){const g=G[t],k=key(g.ln,Math.round(g.nf[0]/0.05),Math.round(g.nf[2]/0.05));(IDX.get(k)||IDX.set(k,[]).get(k)).push(g)}
  i=e}
 console.log(`\n[${sp}] 경기 ${G.length} · 조건: 최종배당 ±${TOL}, 구매율 ±${VT}%p, 절삭량 ±${QT}%p, 표본 ${MINN}+, 배당보다 +${RES}%p 이상인 쪽을 고름`);
 const rows=COMBOS.map(c=>['일반최종',...c.map(x=>NAME[x])].join('+'));
 for(const P of ['전체','3.0미만','~2024','2025~']){console.log(' -- '+P);
  for(const nm of rows){const s=R[P+'|'+nm];if(!s)continue;console.log(`  ${nm.padEnd(30)} 픽 ${String(s.n).padStart(5)}  적중 ${(s.hit/s.n*100).toFixed(1)}%  배당확률 ${(s.exp/s.n*100).toFixed(1)}%  차이 ${(s.hit/s.n*100-s.exp/s.n*100).toFixed(1).padStart(5)}%p  수익 ${((s.ret/s.n-1)*100).toFixed(0)}%`)}}
}
