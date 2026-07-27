// Determinism + stage-distribution check for the postseason bracket.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { projectRecord } from "../web/src/engine.js";
import { buildClubSeasons, spin } from "../web/src/data.js";
import { runPostseason } from "../web/src/postseason.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, "../data/players.json"), "utf-8"));
const pools = buildClubSeasons(data);
const SLOT_POS = ["G","G","F","F","C"];
function mulberry32(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}

function makeTeam(rng){
  const slots=[null,null,null,null,null]; const used=new Set(); let g=0;
  while(slots.some(s=>!s) && g++<200){
    const pool=spin(pools,rng);
    for(const p of pool.players){
      if(used.has(p.playerCode)) continue;
      const i=SLOT_POS.findIndex((pos,idx)=>pos===p.pos && !slots[idx]);
      if(i>=0){slots[i]=p;used.add(p.playerCode);break;}
    }
  }
  return slots.every(Boolean)?slots:null;
}

const rng=mulberry32(7);
const team=makeTeam(rng);
const wins=projectRecord(team,data.seasons).wins;
const a=JSON.stringify(runPostseason(team,data.seasons,pools,wins));
const b=JSON.stringify(runPostseason(team,data.seasons,pools,wins));
const c=JSON.stringify(runPostseason([...team].reverse(),data.seasons,pools,wins));
console.log("determinism (repeat run):       ", a===b ? "PASS":"FAIL");
console.log("determinism (draft order swap): ", a===c ? "PASS":"FAIL");

const counts={}; let n=0, pc=0, pn=0;
const r2=mulberry32(99);
for(let i=0;i<2000;i++){
  const t=makeTeam(r2); if(!t) continue;
  const w=projectRecord(t,data.seasons).wins;
  const p=runPostseason(t,data.seasons,pools,w);
  counts[p.stage]=(counts[p.stage]||0)+1; n++;
  if(w===38){ p.stage==="champion"?pc++:pn++; }
}
console.log("\nstage distribution over "+n+" random teams:");
for(const [k,v] of Object.entries(counts).sort((x,y)=>y[1]-x[1])) console.log("  "+k.padEnd(12)+" "+(100*v/n).toFixed(1)+"%");
console.log("\n38-0 seasons -> champions: "+pc+", fell short: "+pn);
