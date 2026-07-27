// Does the arena behave as the SPEC promises: decisive at the cliff, noise mid-table?
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { projectRecord } from "../web/src/engine.js";
import { buildClubSeasons, spin } from "../web/src/data.js";
import { ratingToMult } from "../web/src/arenas.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, "../data/players.json"), "utf-8"));
const pools = buildClubSeasons(data);
const SLOT_POS=["G","G","F","F","C"];
function mulberry32(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
function makeTeam(rng){const s=[null,null,null,null,null];const u=new Set();let g=0;
  while(s.some(x=>!x)&&g++<200){const pool=spin(pools,rng);
    for(const p of pool.players){if(u.has(p.playerCode))continue;const i=SLOT_POS.findIndex((q,idx)=>q===p.pos&&!s[idx]);if(i>=0){s[i]=p;u.add(p.playerCode);break;}}}
  return s.every(Boolean)?s:null;}

const BEST = ratingToMult(9.5), WORST = ratingToMult(6.0), NEU = 1;
console.log(`multipliers: OAKA/SEF(9.5)=${BEST.toFixed(4)}  weak(6.0)=${WORST.toFixed(4)}\n`);

const N=6000; const r=mulberry32(11);
let perfNeu=0, perfBest=0, perfWorst=0, tipped=0, n=0;
const deltas={};
for(let i=0;i<N;i++){
  const t=makeTeam(r); if(!t) continue; n++;
  const wN=projectRecord(t,data.seasons,undefined,NEU).wins;
  const wB=projectRecord(t,data.seasons,undefined,BEST).wins;
  const wW=projectRecord(t,data.seasons,undefined,WORST).wins;
  if(wN===38)perfNeu++; if(wB===38)perfBest++; if(wW===38)perfWorst++;
  if(wN<38 && wB===38) tipped++;
  const band = wN>=36?"36-37": wN>=30?"30-35": wN>=24?"24-29": wN>=15?"15-23":"0-14";
  (deltas[band] ||= []).push(wB-wN);
}
const avg=a=>(a.reduce((x,y)=>x+y,0)/a.length).toFixed(2);
console.log(`38-0 rate  neutral: ${(100*perfNeu/n).toFixed(2)}%   best arena: ${(100*perfBest/n).toFixed(2)}%   weak arena: ${(100*perfWorst/n).toFixed(2)}%`);
console.log(`teams tipped from <38 to 38-0 by the best arena: ${(100*tipped/n).toFixed(2)}% of all teams\n`);
console.log("avg wins gained by best arena, by neutral-record band:");
for(const b of ["0-14","15-23","24-29","30-35","36-37"]) if(deltas[b]) console.log(`  ${b.padEnd(6)} +${avg(deltas[b])} wins  (n=${deltas[b].length})`);
