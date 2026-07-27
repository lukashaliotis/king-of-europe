import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { projectRecord } from "../web/src/engine.js";
import { buildClubSeasons, spin } from "../web/src/data.js";
import { eligibleCoaches, coachDeltas } from "../web/src/coaches.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, "../data/players.json"), "utf-8"));
const pools = buildClubSeasons(data);
const SLOT_POS=["G","G","F","F","C"];
function mulberry32(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
function makeTeam(rng){const s=[null,null,null,null,null];const u=new Set();let g=0;
  while(s.some(x=>!x)&&g++<200){const pool=spin(pools,rng);
    for(const p of pool.players){if(u.has(p.playerCode))continue;const i=SLOT_POS.findIndex((q,idx)=>q===p.pos&&!s[idx]);if(i>=0){s[i]={...p,_src:{teamCode:pool.teamCode}};u.add(p.playerCode);break;}}}
  return s.every(Boolean)?s:null;}

const N=6000, r=mulberry32(11);
let n=0, perfNo=0, perfBest=0, noEligible=0, gains=[], counts={}, bestCounts=[];
for(let i=0;i<N;i++){
  const t=makeTeam(r); if(!t) continue; n++;
  const wNo = projectRecord(t,data.seasons,undefined,1,null).wins;
  if(wNo===38) perfNo++;
  const opts = eligibleCoaches(t, data);
  if(!opts.length){ noEligible++; if(wNo===38) perfBest++; continue; }
  counts[opts.length]=(counts[opts.length]||0)+1;
  // player picks the coach that maximises wins (the situational choice)
  let best=wNo, bc=0;
  for(const e of opts){ const w=projectRecord(t,data.seasons,undefined,1,coachDeltas(e)).wins; if(w>best){best=w;bc=e.count;} }
  if(best===38) perfBest++;
  gains.push(best-wNo); bestCounts.push(bc);
}
const avg=a=>(a.reduce((x,y)=>x+y,0)/a.length).toFixed(2);
console.log(`teams: ${n}`);
console.log(`teams with NO eligible coach: ${(100*noEligible/n).toFixed(1)}%`);
console.log(`avg eligible coaches: ${(Object.entries(counts).reduce((s,[k,v])=>s+k*v,0)/(n-noEligible)).toFixed(2)}`);
console.log(`\navg wins gained by best-fitting coach: +${avg(gains)}`);
console.log(`teams gaining 0 wins from any coach (worthless, as intended): ${(100*gains.filter(g=>g===0).length/gains.length).toFixed(1)}%`);
console.log(`teams gaining 3+ wins: ${(100*gains.filter(g=>g>=3).length/gains.length).toFixed(1)}%`);
console.log(`\n38-0 rate  no coach: ${(100*perfNo/n).toFixed(2)}%   best-fitting coach: ${(100*perfBest/n).toFixed(2)}%`);
