// Realistic: you may only pick the best arena among YOUR FIVE's clubs.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { projectRecord } from "../web/src/engine.js";
import { buildClubSeasons, spin } from "../web/src/data.js";
import { arenaFor } from "../web/src/arenas.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, "../data/players.json"), "utf-8"));
const pools = buildClubSeasons(data);
const SLOT_POS=["G","G","F","F","C"];
function mulberry32(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
function makeTeam(rng){const s=[null,null,null,null,null];const u=new Set();let g=0;
  while(s.some(x=>!x)&&g++<200){const pool=spin(pools,rng);
    for(const p of pool.players){if(u.has(p.playerCode))continue;const i=SLOT_POS.findIndex((q,idx)=>q===p.pos&&!s[idx]);if(i>=0){s[i]={...p,_tc:pool.teamCode};u.add(p.playerCode);break;}}}
  return s.every(Boolean)?s:null;}

const N=6000; const r=mulberry32(11);
let perfNeu=0, perfReal=0, n=0; const mults=[];
for(let i=0;i<N;i++){
  const t=makeTeam(r); if(!t) continue; n++;
  // player picks the best arena available among their five clubs
  const best = Math.max(...t.map(p=>arenaFor(p._tc, p.season).mult));
  mults.push(best);
  if(projectRecord(t,data.seasons,undefined,1).wins===38) perfNeu++;
  if(projectRecord(t,data.seasons,undefined,best).wins===38) perfReal++;
}
mults.sort((a,b)=>a-b);
const q=p=>mults[Math.floor(p*(mults.length-1))];
console.log(`best-available arena multiplier across teams:`);
console.log(`  p10 ${q(.1).toFixed(4)}  median ${q(.5).toFixed(4)}  p90 ${q(.9).toFixed(4)}  max ${mults[mults.length-1].toFixed(4)}`);
console.log(`\n38-0 rate  neutral (no arena): ${(100*perfNeu/n).toFixed(2)}%`);
console.log(`38-0 rate  realistic (best of your five's clubs): ${(100*perfReal/n).toFixed(2)}%`);
