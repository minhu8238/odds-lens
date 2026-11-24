// GitHub Actions에서 실행: 배트맨 데이터 → data/latest.json + data/hist/<회차>.json
const fs = require('fs');
const path = require('path');
const { buildSnapshot } = require('./core.js');

const BASE = 'https://www.betman.co.kr';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let calls = 0;
async function post(p, body) {
  if (++calls > 60) throw new Error('요청 횟수 초과');
  await sleep(400);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(BASE + p, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
          'Origin': BASE,
          'Referer': BASE + '/main/mainPage/gamebuy/buyableGameList.do',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000)
      });
      const text = await res.text();
      try { return JSON.parse(text) } catch (e) { throw new Error(`JSON 아님 (HTTP ${res.status}): ${text.slice(0, 120)}`) }
    } catch (e) {
      if (attempt === 3) throw e;
      console.log('재시도:', e.message);
      await sleep(3000 * (attempt + 1));
    }
  }
}

(async () => {
  const dataDir = path.join(__dirname, '..', 'data');
  const histDir = path.join(dataDir, 'hist');
  fs.mkdirSync(histDir, { recursive: true });
  const snap = await buildSnapshot(post);
  if (!snap.rounds.length) throw new Error('배당이 올라온 회차 없음');
  fs.writeFileSync(path.join(dataDir, 'latest.json'), JSON.stringify(snap));
  // 시간대별 기록: 배당이 바뀌었거나 마지막 기록이 60분 넘었으면 [시각, 배당3, 구매건수3] 추가
  for (const r of snap.rounds) {
    const f = path.join(histDir, `${r.gmTs}.json`);
    let H = {};
    try { H = JSON.parse(fs.readFileSync(f, 'utf8')) } catch (e) {}
    let added = 0;
    for (const g of r.games) {
      if (g.t < snap.updated - 3 * 3600e3) continue;
      const arr = H[g.s] = H[g.s] || [];
      const last = arr[arr.length - 1];
      const row = [Math.round(snap.updated / 60000), ...g.o, ...(g.v || [0, 0, 0])];
      const oddsChanged = !last || last[1] !== row[1] || last[2] !== row[2] || last[3] !== row[3];
      if (oddsChanged || row[0] - last[0] >= 60) { arr.push(row); added++ }
    }
    if (added) fs.writeFileSync(f, JSON.stringify(H));
    console.log(`${r.gmTs} ${r.saleStatus} 경기 ${r.games.length}, 기록 추가 ${added}`);
  }
  console.log('요청 수', calls);
})().catch(e => { console.error('실패:', e.message); process.exit(1) });
