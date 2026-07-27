import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { projectRecord } from "../web/src/engine.js";
import { buildClubSeasons, spin } from "../web/src/data.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, "../data/players.json"), "utf-8"));
const pools = buildClubSeasons(data);
const SLOT_POS=["G","G","F","F","C"];
function mulberry32(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
function bestFive(pool){const s=[null,null,null,null,null];for(const p of pool.players){const i=SLOT_POS.findIndex((q,idx)=>q===p.pos&&!s[idx]);if(i>=0)s[i]=p;if(s.every(Boolean))break;}return s.every(Boolean)?s:null;}
function makeTeam(rng){const s=[null,null,null,null,null];const u=new Set();let g=0;
  while(s.some(x=>!x)&&g++<200){const pool=spin(pools,rng);
    for(const p of pool.players){if(u.has(p.playerCode))continue;const i=SLOT_POS.findIndex((q,idx)=>q===p.pos&&!s[idx]);if(i>=0){s[i]=p;u.add(p.playerCode);break;}}}
  return s.every(Boolean)?s:null;}

// player teams
const r=mulberry32(5); const you=[];
for(let i=0;i<800;i++){const t=makeTeam(r); if(t) you.push(projectRecord(t,data.seasons).S);}
you.sort((a,b)=>a-b);
const q=(a,p)=>a[Math.floor(p*(a.length-1))].toFixed(1);

// opponent club-season fives, by ceiling band
const sorted=[...pools].sort((a,b)=>b.ceiling-a.ceiling);
const oppS=[];
for(const pool of sorted){const f=bestFive(pool); if(f) oppS.push({S:projectRecord(f,data.seasons).S, name:pool.teamName+" "+pool.seasonLabel});}
const top5=oppS.slice(0,Math.floor(0.05*oppS.length)).map(o=>o.S).sort((a,b)=>a-b);
const top25=oppS.slice(0,Math.floor(0.25*oppS.length)).map(o=>o.S).sort((a,b)=>a-b);

console.log("YOUR team S:      median "+q(you,.5)+"  p75 "+q(you,.75)+"  p90 "+q(you,.9)+"  max "+you[you.length-1].toFixed(1));
console.log("OPPONENT top-5% S: median "+q(top5,.5)+"  max "+top5[top5.length-1].toFixed(1)+"   (n="+top5.length+")");
console.log("OPPONENT top-25% S: median "+q(top25,.5)+"  max "+top25[top25.length-1].toFixed(1));
console.log("\nstrongest single club-seasons:");
oppS.sort((a,b)=>b.S-a.S).slice(0,5).forEach(o=>console.log("  "+o.S.toFixed(1)+"  "+o.name));
