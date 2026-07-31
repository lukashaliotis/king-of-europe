import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { projectRecord, DEFAULT_PARAMS } from "../web/src/engine.js";
import { buildClubSeasons, spin } from "../web/src/data.js";
import { runPostseason } from "../web/src/postseason.js";
import { legendsPool, LEGENDS_CHANCE } from "../web/src/legends.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, "../data/players.json"), "utf-8"));
const pools = buildClubSeasons(data);
const LEG = legendsPool();
const SLOT_POS = ["G","G","F","F","C"];
function mulberry32(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
const spinOnce=(rng)=>(rng()<LEGENDS_CHANCE?LEG:spin(pools,rng));

function draft(rng){
  const slots=[null,null,null,null,null]; const used=new Set();
  const openPos=(pos)=>SLOT_POS.findIndex((p,i)=>p===pos&&!slots[i]);
  let picks=0,g=0;
  while(picks<5&&g++<60){
    const pool=spinOnce(rng); const st=slots.filter(Boolean);
    let best=null,bk=-Infinity;
    for(const c of pool.players){ if(used.has(c.playerCode))continue; const pi=openPos(c.pos); if(pi<0)continue;
      const r=projectRecord([...st,c],data.seasons,DEFAULT_PARAMS); if(r.S>bk){bk=r.S;best={c,pi};} }
    if(!best)continue; slots[best.pi]=best.c; used.add(best.c.playerCode); picks++;
  }
  const st=slots.filter(Boolean); return st.length===5?st:null;
}

const N=Number(process.argv[2]||4000);
const rng=mulberry32(9999);
const buckets={}; // winBucket -> {n, ff, champ, final}
const label=(w)=> w>=32?"32-38":w>=28?"28-31":w>=24?"24-27":w>=20?"20-23":w>=16?"16-19":"<16";
for(let i=0;i<N;i++){
  const five=draft(rng); if(!five)continue;
  const wins=projectRecord(five,data.seasons,DEFAULT_PARAMS).wins;
  const post=runPostseason(five,data.seasons,pools,wins);
  const b=label(wins); buckets[b]=buckets[b]||{n:0,ff:0,champ:0,final:0};
  const bk=buckets[b]; bk.n++;
  const reachedFF=["finalfour","lostfinal","champion"].includes(post.stage);
  const reachedFinal=["lostfinal","champion"].includes(post.stage);
  if(reachedFF)bk.ff++; if(reachedFinal)bk.final++; if(post.stage==="champion")bk.champ++;
}
console.log("record   n     reachFF%  reachFinal%  champ%");
for(const b of ["32-38","28-31","24-27","20-23","16-19","<16"]){
  const x=buckets[b]; if(!x)continue;
  console.log(`${b.padEnd(7)} ${String(x.n).padStart(4)}   ${(100*x.ff/x.n).toFixed(1).padStart(6)}   ${(100*x.final/x.n).toFixed(1).padStart(8)}   ${(100*x.champ/x.n).toFixed(1).padStart(5)}`);
}
// overall champ rate
const tot=Object.values(buckets).reduce((a,x)=>a+x.n,0);
const totC=Object.values(buckets).reduce((a,x)=>a+x.champ,0);
console.log(`\nOVERALL champ rate: ${(100*totC/tot).toFixed(1)}%  (n=${tot})`);
