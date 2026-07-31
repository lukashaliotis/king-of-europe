import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { projectRecord, DEFAULT_PARAMS } from "../web/src/engine.js";
import { buildClubSeasons, spin } from "../web/src/data.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, "../data/players.json"), "utf-8"));
const pools = buildClubSeasons(data);
const SLOT = ["G","G","F","F","C"];
function mb(a){return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}

function draftCasual(rng, params){ // chase scoring
  const slots=[null,null,null,null,null];const used=new Set();
  const open=(pos)=>SLOT.findIndex((p,i)=>p===pos&&!slots[i]);let picks=0,g=0;
  while(picks<5&&g++<80){const pool=spin(pools,rng);let best=null,bs=-Infinity;
    for(const c of pool.players){if(used.has(c.playerCode)||open(c.pos)<0)continue;const sc=c.cat.scoring+c.cat.efficiency*0.3;if(sc>bs){bs=sc;best=c;}}
    if(!best)continue;slots[open(best.pos)]=best;used.add(best.playerCode);picks++;}
  const st=slots.filter(Boolean);return st.length===5?st:null;
}
function draftGreedy(rng, params){ // S-optimal
  const slots=[null,null,null,null,null];const used=new Set();
  const open=(pos)=>SLOT.findIndex((p,i)=>p===pos&&!slots[i]);let picks=0,g=0;
  while(picks<5&&g++<80){const pool=spin(pools,rng);const st=slots.filter(Boolean);let best=null,bk=-Infinity;
    for(const c of pool.players){if(used.has(c.playerCode)||open(c.pos)<0)continue;const r=projectRecord([...st,c],data.seasons,params);if(r.S>bk){bk=r.S;best={c,pi:open(c.pos)};}}
    if(!best)continue;slots[best.pi]=best.c;used.add(best.c.playerCode);picks++;}
  const st=slots.filter(Boolean);return st.length===5?st:null;
}
function dist(draft, params, N, seed){
  const rng=mb(seed);const w=[];let zero=0,perfect=0;
  for(let i=0;i<N;i++){const f=draft(rng,params);if(!f)continue;const x=projectRecord(f,data.seasons,params).wins;w.push(x);if(x===0)zero++;if(x===38)perfect++;}
  w.sort((a,b)=>a-b);const q=(p)=>w[Math.floor(p*(w.length-1))];
  return {p10:q(0.1),med:q(0.5),p90:q(0.9),zero:100*zero/w.length,perfect:100*perfect/w.length};
}
const N=Number(process.argv[2]||2500);
console.log(`N=${N} per cell\n`);
console.log("gFloor wFloor lgS steep | CASUAL p10 med p90 0-38% | GREEDY med p90 38-0%");
const grid=[];
for(const gateFloor of [0.0, 0.22, 0.30])
 for(const winFloor of [0.0, 0.05])
  for(const [leagueS,gameSteep] of [[18,0.23],[16,0.23]])
   grid.push({gateFloor,winFloor,leagueS,gameSteep});
for(const g of grid){
  const params={...DEFAULT_PARAMS, ...g};
  const c=dist(draftCasual,params,N,4242);
  const gr=dist(draftGreedy,params,N,777);
  console.log(` ${g.gateFloor.toFixed(2)}  ${g.winFloor.toFixed(2)}  ${String(g.leagueS).padStart(2)} ${g.gameSteep.toFixed(2)} | `+
    `${String(c.p10).padStart(3)} ${String(c.med).padStart(3)} ${String(c.p90).padStart(3)} ${c.zero.toFixed(1).padStart(5)}% | `+
    `${String(gr.med).padStart(3)} ${String(gr.p90).padStart(3)} ${gr.perfect.toFixed(2).padStart(5)}%`);
}
