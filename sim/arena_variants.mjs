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

const N=6000, r=mulberry32(11);
const teams=[];
for(let i=0;i<N;i++){const t=makeTeam(r); if(t) teams.push(t);}

function rate(multFn){ let p=0; for(const t of teams){ if(projectRecord(t,data.seasons,undefined,multFn(t)).wins===38) p++; } return 100*p/teams.length; }

// A: current — best arena among your five (full swing)
const A = rate(t=>Math.max(...t.map(p=>arenaFor(p._tc,p.season).mult)));
// B: scaled by roster share — effect x (players from that club / 5)
function shareMult(t, scale=1){
  let best=1;
  for(const p of t){
    const a=arenaFor(p._tc,p.season);
    const share=t.filter(q=>q._tc===p._tc).length/5;
    const m=1+(a.mult-1)*share*scale;
    if(m>best)best=m;
  }
  return best;
}
const B = rate(t=>shareMult(t,1));
const B3 = rate(t=>shareMult(t,3)); // share-scaled but 3x base swing
// C: smaller swings, max-of-five
const shrink=(t,f)=>1+(Math.max(...t.map(p=>arenaFor(p._tc,p.season).mult))-1)*f;
const C15 = rate(t=>shrink(t,0.33)); // ~±1.5%
const C10 = rate(t=>shrink(t,0.22)); // ~±1.0%
const NEU = rate(()=>1);

// how often do you actually get 2+ players from one club?
let multi=0; for(const t of teams){ const c={}; t.forEach(p=>c[p._tc]=(c[p._tc]||0)+1); if(Math.max(...Object.values(c))>1) multi++; }

console.log(`teams: ${teams.length}`);
console.log(`38-0 rate, no arena ................................ ${NEU.toFixed(2)}%`);
console.log(`A  best-of-five, full ±4.5% (current) .............. ${A.toFixed(2)}%`);
console.log(`B  scaled by roster share, ±4.5% base .............. ${B.toFixed(2)}%`);
console.log(`B3 scaled by roster share, 3x base (±13% at 5/5) ... ${B3.toFixed(2)}%`);
console.log(`C  best-of-five, shrunk to ~±1.5% ................. ${C15.toFixed(2)}%`);
console.log(`C' best-of-five, shrunk to ~±1.0% ................. ${C10.toFixed(2)}%`);
console.log(`\nteams with 2+ players from the same club: ${(100*multi/teams.length).toFixed(1)}%`);
