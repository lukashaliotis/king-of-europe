import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { projectRecord } from "../web/src/engine.js";
import { buildClubSeasons, spin } from "../web/src/data.js";
import { eligibleCoaches, coachDeltas } from "../web/src/coaches.js";
import { arenaFor } from "../web/src/arenas.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, "../data/players.json"), "utf-8"));
const pools = buildClubSeasons(data);
const SLOT_POS=["G","G","F","F","C"];
function mulberry32(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
function makeTeam(rng){const s=[null,null,null,null,null];const u=new Set();let g=0;
  while(s.some(x=>!x)&&g++<200){const pool=spin(pools,rng);
    for(const p of pool.players){if(u.has(p.playerCode))continue;const i=SLOT_POS.findIndex((q,idx)=>q===p.pos&&!s[idx]);if(i>=0){s[i]={...p,_src:{teamCode:pool.teamCode}};u.add(p.playerCode);break;}}}
  return s.every(Boolean)?s:null;}
// best arena available, scaled by roster share
function bestArena(t){ let best=1;
  for(const p of t){ const a=arenaFor(p._src.teamCode,p.season);
    const share=t.filter(q=>q._src.teamCode===p._src.teamCode).length/5;
    const m=1+(a.mult-1)*share; if(m>best)best=m; }
  return best; }

const N=6000, r=mulberry32(11);
const teams=[]; for(let i=0;i<N;i++){const t=makeTeam(r); if(t) teams.push(t);}
function rate(useArena, useCoach){
  let p=0;
  for(const t of teams){
    const am = useArena ? bestArena(t) : 1;
    let best = projectRecord(t,data.seasons,undefined,am,null).wins;
    if(useCoach) for(const e of eligibleCoaches(t, data)){
      const w=projectRecord(t,data.seasons,undefined,am,coachDeltas(e)).wins; if(w>best) best=w; }
    if(best===38) p++;
  }
  return 100*p/teams.length;
}
console.log(`teams: ${teams.length}\n38-0 RATE`);
console.log(`  base (no wrinkles) ....... ${rate(false,false).toFixed(2)}%`);
console.log(`  + arena only ............. ${rate(true,false).toFixed(2)}%`);
console.log(`  + coach only ............. ${rate(false,true).toFixed(2)}%`);
console.log(`  + BOTH ................... ${rate(true,true).toFixed(2)}%`);
