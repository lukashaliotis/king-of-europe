// Scenario Daily G.O.A.T. — hand-authored "recreate the icon" and "get over the hump" days. On a
// scenario day the home club is FIXED (and, for an icon, the base player is LOCKED to a real legend),
// and the postseason opponents are that team's REAL playoff path (quarterfinal, semifinal, final) as
// actual club-seasons, at a tuned difficulty. Scenario days COEXIST with the procedural Daily G.O.A.T.:
// only some days are scenarios (a pure function of the date), the rest keep the random home+donors
// board. ISOMORPHIC — the client and the anti-cheat resolver both call goatScenarioFor(dayKey), so a
// scenario day (and its locked base + fixed bracket) can never be forged.
import { hashSeed } from "./daily.js";

// NOTE ON SEASON KEYS: the dataset labels a season by its STARTING year, so season 2017 IS the
// 2017-18 campaign. Every `season` below follows that, which is why the famous years read one lower.
//
// The set spans eras. Modern (2016+) sides project as true title teams out of the box. Pre-2016 sides
// are viable because the engine is now ERA-FAIR (each season is judged against its own typical five,
// via the baked catOffset), and those specific champions additionally carry a `homeLift` because they
// were imbalanced by the balance-gate's lights (a locked guard cannot fix a frontcourt hole).
//
// Each scenario carries:
//   home     { code, season }      the fixed home club-season (fills four of your five slots)
//   base     { code }              (icon only) the LOCKED base player; the resolver rejects any other
//   homeLift { cat: delta }        optional catDeltas patch (same mechanism as a coach) that grants a
//                                   real-but-imbalanced champion contender strength; omitted → none
//   path     [{ round, code, season, bump }]  the real Playoffs / Semifinal / Final opponents; `bump`
//            adjusts that opponent's strength on top of the normal round escalation (negative eases a
//            hard locked-base run). All calibrated in sim/goat_scenario_calib.mjs.
export const GOAT_SCENARIOS = [
  {
    id: "mad17", type: "icon",
    title: "Wonder Boy", team: "Real Madrid 2017-18", lead: "Dončić",
    home: { code: "MAD", season: 2017 },
    base: { code: "005929" }, // Doncic, Luka
    flavor: "Belgrade, 2018. A nineteen-year-old Luka Dončić carried Real Madrid to the crown. Do it again: past Panathinaikos, then CSKA, then Fenerbahçe in the final.",
    goalLine: "Win the title Dončić won.",
    path: [
      { round: "Playoffs",  code: "PAN", season: 2017, bump: -2 },
      { round: "Semifinal", code: "CSK", season: 2017, bump: -2 },
      { round: "Final",     code: "ULK", season: 2017, bump: -2 },
    ],
  },
  {
    id: "oly22", type: "team",
    title: "One Game Short", team: "Olympiacos 2022-23", lead: null,
    home: { code: "OLY", season: 2022 },
    flavor: "Kaunas, 2023. The best team in Europe fell one win short, beaten by Real Madrid in the final. Build your hero and finish it: through Fenerbahçe, then Monaco, then Real Madrid.",
    goalLine: "Win the title Olympiacos let slip.",
    path: [
      { round: "Playoffs",  code: "ULK", season: 2022, bump: 12 },
      { round: "Semifinal", code: "MCO", season: 2022, bump: 13 },
      { round: "Final",     code: "MAD", season: 2022, bump: 14 },
    ],
  },
  {
    id: "ulk18", type: "team",
    title: "Unfinished Business", team: "Fenerbahçe 2018-19", lead: null,
    home: { code: "ULK", season: 2018 },
    flavor: "Vitoria, 2019. Fenerbahçe's run died in the semifinal against Anadolu Efes. Build your hero, avenge it, then take down CSKA for the crown.",
    goalLine: "Win the title Fenerbahçe let slip.",
    path: [
      { round: "Playoffs",  code: "ZAL", season: 2018, bump: 6.5 },
      { round: "Semifinal", code: "IST", season: 2018, bump: 7 },
      { round: "Final",     code: "CSK", season: 2018, bump: 7.5 },
    ],
  },
  // --- Pre-2016 legends (viable now that the engine is era-fair). These sides were imbalanced by the
  // balance-gate's lights, so they also carry a `homeLift` (a catDeltas patch, same mechanism as a
  // coach) that grants the real champion contender-level strength. Tuned in goat_scenario_calib.mjs. ---
  {
    id: "oly11", type: "icon",
    title: "One Last Shot", team: "Olympiacos 2011-12", lead: "Spanoulis",
    home: { code: "OLY", season: 2011 },
    base: { code: "JUO" }, // Spanoulis, Vassilis
    flavor: "Istanbul, 2012. Take Vassilis Spanoulis and the Reds back to the summit, past Siena, then Barcelona, then CSKA in the final.",
    goalLine: "Win the title Spanoulis won.",
    homeLift: { scoring: 2, rebounding: 2, playmaking: 2, defense: 2, efficiency: 2 },
    path: [
      { round: "Playoffs",  code: "SIE", season: 2011, bump: -2 },
      { round: "Semifinal", code: "BAR", season: 2011, bump: -2 },
      { round: "Final",     code: "CSK", season: 2011, bump: -2 },
    ],
  },
  {
    id: "pan10", type: "icon",
    title: "The General's Crown", team: "Panathinaikos 2010-11", lead: "Diamantidis",
    home: { code: "PAN", season: 2010 },
    base: { code: "JKO" }, // Diamantidis, Dimitris
    flavor: "Barcelona, 2011. Lead the Greens with Dimitris Diamantidis, past Barcelona, then Siena, then Maccabi for the crown.",
    goalLine: "Win the title Diamantidis won.",
    homeLift: { scoring: 3.0, rebounding: 3.0, playmaking: 3.0, defense: 3.0, efficiency: 3.0 },
    path: [
      { round: "Playoffs",  code: "BAR", season: 2010, bump: -3 },
      { round: "Semifinal", code: "SIE", season: 2010, bump: -3 },
      { round: "Final",     code: "TEL", season: 2010, bump: -3 },
    ],
  },
  {
    id: "par09", type: "team",
    title: "Over the Hump", team: "Partizan 2009-10", lead: null,
    home: { code: "PAR", season: 2009 },
    flavor: "Paris, 2010. Partizan's run ended in the semifinal against Olympiacos. Build your hero, avenge that loss, then dethrone Barcelona.",
    goalLine: "Win the title Partizan never won.",
    homeLift: { scoring: 2, rebounding: 2, playmaking: 2, defense: 2, efficiency: 2 },
    path: [
      { round: "Playoffs",  code: "TEL", season: 2009, bump: 0 },
      { round: "Semifinal", code: "OLY", season: 2009, bump: 0 },
      { round: "Final",     code: "BAR", season: 2009, bump: 0 },
    ],
  },
  // --- "Pick your legend" scenarios: choose the base from a curated set of icons (the eternal debate). ---
  {
    id: "ist20", type: "icon",
    title: "The Debate", team: "Anadolu Efes 2020-21", lead: "Mičić or Larkin",
    home: { code: "IST", season: 2020 },
    base: { pick: ["002580", "007200"] }, // Micic OR Larkin
    flavor: "Cologne, 2021. Efes finally broke through. Pick your engine, Vasilije Mičić or Shane Larkin, and take the crown: past Real Madrid, then CSKA, then Barcelona.",
    goalLine: "Win the title Efes won.",
    homeLift: { scoring: 1.2, rebounding: 1.2, playmaking: 1.2, defense: 1.2, efficiency: 1.2 },
    path: [
      { round: "Playoffs",  code: "MAD", season: 2020, bump: 0 },
      { round: "Semifinal", code: "CSK", season: 2020, bump: 0 },
      { round: "Final",     code: "BAR", season: 2020, bump: 0 },
    ],
  },
  {
    id: "pan08", type: "icon",
    title: "Three Maestros", team: "Panathinaikos 2008-09", lead: "Diamantidis, Spanoulis or Jasikevičius",
    home: { code: "PAN", season: 2008 },
    base: { pick: ["JKO", "JUO", "ADG"] }, // Diamantidis / Spanoulis / Jasikevicius
    flavor: "Berlin, 2009. Choose your maestro, Dimitris Diamantidis, Vassilis Spanoulis or Šarūnas Jasikevičius, and run the Greens to the title: past Partizan, then Olympiacos, then CSKA.",
    goalLine: "Win the title Panathinaikos won.",
    homeLift: { scoring: 2.0, rebounding: 2.0, playmaking: 2.0, defense: 2.0, efficiency: 2.0 },
    path: [
      { round: "Playoffs",  code: "PAR", season: 2008, bump: 0 },
      { round: "Semifinal", code: "OLY", season: 2008, bump: 0 },
      { round: "Final",     code: "CSK", season: 2008, bump: 0 },
    ],
  },
  // --- Batch 2: recreate icons, a pick, and a redemption (a painful buzzer loss). ---
  {
    id: "bar09", type: "icon",
    title: "La Bomba", team: "Barcelona 2009-10", lead: "Navarro",
    home: { code: "BAR", season: 2009 },
    base: { code: "ADI" }, // Navarro, Juan Carlos
    flavor: "Paris, 2010. Juan Carlos Navarro carried Barcelona to the crown. Do it again: past Real Madrid in the Clasico, then CSKA, then Olympiacos in the final.",
    goalLine: "Win the title Navarro won.",
    homeLift: { scoring: 2.0, rebounding: 2.0, playmaking: 2.0, defense: 2.0, efficiency: 2.0 },
    path: [
      { round: "Playoffs",  code: "MAD", season: 2009, bump: 0 },
      { round: "Semifinal", code: "CSK", season: 2009, bump: 0 },
      { round: "Final",     code: "OLY", season: 2009, bump: 0 },
    ],
  },
  {
    id: "csk05", type: "icon",
    title: "The Professor", team: "CSKA Moscow 2005-06", lead: "Papaloukas",
    home: { code: "CSK", season: 2005 },
    base: { code: "ATW" }, // Papaloukas, Theodoros
    flavor: "Prague, 2006. Theo Papaloukas ran CSKA to their first crown in 35 years. Recreate it: past Efes, then Barcelona, then Maccabi in the final.",
    goalLine: "Win the title Papaloukas won.",
    homeLift: { scoring: 2.0, rebounding: 2.0, playmaking: 2.0, defense: 2.0, efficiency: 2.0 },
    path: [
      { round: "Playoffs",  code: "IST", season: 2005, bump: 0 },
      { round: "Semifinal", code: "BAR", season: 2005, bump: 0 },
      { round: "Final",     code: "TEL", season: 2005, bump: 0 },
    ],
  },
  {
    id: "pan23", type: "icon",
    title: "The Seventh Star", team: "Panathinaikos 2023-24", lead: "Sloukas or Nunn",
    home: { code: "PAN", season: 2023 },
    base: { pick: ["001926", "012774"] }, // Sloukas OR Nunn
    flavor: "Berlin, 2024. Panathinaikos ended a thirteen-year wait. Pick your star, Kostas Sloukas or Kendrick Nunn, and take the seventh star: past Maccabi, then Fenerbahçe, then Real Madrid.",
    goalLine: "Win the title Panathinaikos won.",
    homeLift: { scoring: 1.0, rebounding: 1.0, playmaking: 1.0, defense: 1.0, efficiency: 1.0 },
    path: [
      { round: "Playoffs",  code: "TEL", season: 2023, bump: 0 },
      { round: "Semifinal", code: "ULK", season: 2023, bump: 0 },
      { round: "Final",     code: "MAD", season: 2023, bump: 0 },
    ],
  },
  {
    id: "csk11", type: "team",
    title: "The Collapse", team: "CSKA Moscow 2011-12", lead: null,
    home: { code: "CSK", season: 2011 },
    flavor: "Istanbul, 2012. CSKA led the final, then Printezis's floater at the buzzer handed it to Olympiacos. Rewrite it: build your hero, past Baskonia, then Panathinaikos, then finish Olympiacos.",
    goalLine: "Win the title CSKA let slip.",
    homeLift: { scoring: 2.0, rebounding: 2.0, playmaking: 2.0, defense: 2.0, efficiency: 2.0 },
    path: [
      { round: "Playoffs",  code: "BAS", season: 2011, bump: 0 },
      { round: "Semifinal", code: "PAN", season: 2011, bump: 0 },
      { round: "Final",     code: "OLY", season: 2011, bump: 0 },
    ],
  },
  // --- Batch 3: two more picks, an older-legend redemption, and a never-over-the-hump curse. ---
  {
    id: "mad14", type: "team",
    title: "The Drought Ends", team: "Real Madrid 2014-15", lead: null,
    home: { code: "MAD", season: 2014 },
    flavor: "Madrid, 2015. Real Madrid ended a long wait at home. Build your hero and lift the crown: past Barcelona, then Fenerbahçe, then Olympiacos.",
    goalLine: "Win the title Real Madrid won.",
    homeLift: { scoring: 3, rebounding: 3, playmaking: 3, defense: 3, efficiency: 3 },
    path: [
      { round: "Playoffs",  code: "BAR", season: 2014, bump: 0 },
      { round: "Semifinal", code: "ULK", season: 2014, bump: 0 },
      { round: "Final",     code: "OLY", season: 2014, bump: 0 },
    ],
  },
  {
    id: "ulk16", type: "team",
    title: "The First Star", team: "Fenerbahçe 2016-17", lead: null,
    home: { code: "ULK", season: 2016 },
    flavor: "Istanbul, 2017. Fenerbahçe won the first title in Turkish history, at home. Build your hero and take the crown: past Panathinaikos, then Real Madrid, then Olympiacos.",
    goalLine: "Win the title Fenerbahçe won.",
    homeLift: { scoring: 0.5, rebounding: 0.5, playmaking: 0.5, defense: 0.5, efficiency: 0.5 },
    path: [
      { round: "Playoffs",  code: "PAN", season: 2016, bump: 0 },
      { round: "Semifinal", code: "MAD", season: 2016, bump: 0 },
      { round: "Final",     code: "OLY", season: 2016, bump: 0 },
    ],
  },
  {
    id: "vir01", type: "icon",
    title: "Bologna's Heartbreak", team: "Virtus Bologna 2001-02", lead: "Ginóbili",
    home: { code: "VIR", season: 2001 },
    base: { code: "AKX" }, // Ginobili, Manu
    flavor: "Bologna, 2002. Kinder led at home, then Panathinaikos stole the final on their floor. Right the wrong with Manu Ginóbili: past Tau, then Benetton, then Panathinaikos.",
    goalLine: "Win the title Bologna let slip at home.",
    homeLift: { scoring: 2.5, rebounding: 2.5, playmaking: 2.5, defense: 2.5, efficiency: 2.5 },
    path: [
      { round: "Playoffs",  code: "BAS", season: 2001, bump: 0 },
      { round: "Semifinal", code: "TRE", season: 2001, bump: 0 },
      { round: "Final",     code: "PAN", season: 2001, bump: 0 },
    ],
  },
  {
    id: "bas04", type: "team",
    title: "The Curse", team: "TAU Cerámica 2004-05", lead: null,
    home: { code: "BAS", season: 2004 },
    flavor: "Moscow, 2005. TAU reached the final and fell to Jasikevičius's Maccabi. Break the curse: build your hero, past Barcelona, then CSKA, then finish Maccabi.",
    goalLine: "Win the title TAU never could.",
    homeLift: { scoring: 3, rebounding: 3, playmaking: 3, defense: 3, efficiency: 3 },
    path: [
      { round: "Playoffs",  code: "BAR", season: 2004, bump: 0 },
      { round: "Semifinal", code: "CSK", season: 2004, bump: -2 },
      { round: "Final",     code: "TEL", season: 2004, bump: -4 },
    ],
  },
  // --- Batch 4: back-to-back, an OT king, the miracle, and the freshest crown. ---
  {
    id: "oly12", type: "icon",
    title: "Back-to-Back", team: "Olympiacos 2012-13", lead: "Spanoulis",
    home: { code: "OLY", season: 2012 },
    base: { code: "JUO" }, // Spanoulis, Vassilis
    flavor: "London, 2013. Spanoulis and Olympiacos went back-to-back with another comeback. Do it again: past Efes, then CSKA, then Real Madrid.",
    goalLine: "Win the title Spanoulis defended.",
    homeLift: { scoring: 1.5, rebounding: 1.5, playmaking: 1.5, defense: 1.5, efficiency: 1.5 },
    path: [
      { round: "Playoffs",  code: "IST", season: 2012, bump: 0 },
      { round: "Semifinal", code: "CSK", season: 2012, bump: 0 },
      { round: "Final",     code: "MAD", season: 2012, bump: 0 },
    ],
  },
  {
    id: "csk15", type: "icon",
    title: "The Overtime King", team: "CSKA Moscow 2015-16", lead: "De Colo",
    home: { code: "CSK", season: 2015 },
    base: { code: "002100" }, // De Colo, Nando
    flavor: "Berlin, 2016. Nando De Colo dragged CSKA to the title in overtime. Recreate it: past Efes, then Lokomotiv Kuban, then Fenerbahçe in the final.",
    goalLine: "Win the title De Colo won.",
    homeLift: { scoring: 1.5, rebounding: 1.5, playmaking: 1.5, defense: 1.5, efficiency: 1.5 },
    path: [
      { round: "Playoffs",  code: "IST", season: 2015, bump: 0 },
      { round: "Semifinal", code: "TIV", season: 2015, bump: 0 },
      { round: "Final",     code: "ULK", season: 2015, bump: 0 },
    ],
  },
  {
    id: "tel13", type: "team",
    title: "The Miracle", team: "Maccabi Tel Aviv 2013-14", lead: null,
    home: { code: "TEL", season: 2013 },
    flavor: "Milan, 2014. Maccabi shocked Europe as the underdog. Build your hero and recreate the miracle: past Milan, then CSKA, then Real Madrid in overtime.",
    goalLine: "Win the title Maccabi stole.",
    homeLift: { scoring: 2.0, rebounding: 2.0, playmaking: 2.0, defense: 2.0, efficiency: 2.0 },
    path: [
      { round: "Playoffs",  code: "MIL", season: 2013, bump: 0 },
      { round: "Semifinal", code: "CSK", season: 2013, bump: 0 },
      { round: "Final",     code: "MAD", season: 2013, bump: 0 },
    ],
  },
  {
    id: "oly25", type: "team",
    title: "Home at Last", team: "Olympiacos 2025-26", lead: null,
    home: { code: "OLY", season: 2025 },
    flavor: "Athens, 2026. Olympiacos ended a thirteen-year wait at home. Build your hero and take the crown: past Monaco, then Fenerbahçe, then Real Madrid.",
    goalLine: "Win the title Olympiacos won at home.",
    homeLift: { scoring: 0.5, rebounding: 0.5, playmaking: 0.5, defense: 0.5, efficiency: 0.5 },
    path: [
      { round: "Playoffs",  code: "MCO", season: 2025, bump: 0 },
      { round: "Semifinal", code: "ULK", season: 2025, bump: 0 },
      { round: "Final",     code: "MAD", season: 2025, bump: 0 },
    ],
  },
  // --- Batch 5: a "what if" (Sabonis's Zalgiris takes Maccabi's Final Four spot), and two more champions. ---
  {
    id: "zal03", type: "icon",
    title: "The Farewell", team: "Žalgiris Kaunas 2003-04", lead: "Sabonis",
    home: { code: "ZAL", season: 2003 },
    base: { code: "AYO" }, // Sabonis, Arvydas
    flavor: "Tel Aviv, 2004. Arvydas Sabonis's Žalgiris lost a do-or-die overtime to Maccabi, one win from the Final Four. Rewrite it: beat Maccabi, then CSKA, then Bologna for the crown.",
    goalLine: "Win the title Sabonis just missed.",
    homeLift: { scoring: 3, rebounding: 3, playmaking: 3, defense: 3, efficiency: 3 },
    path: [
      { round: "Playoffs",  code: "TEL", season: 2003, bump: -4 },
      { round: "Semifinal", code: "CSK", season: 2003, bump: -4 },
      { round: "Final",     code: "FOR", season: 2003, bump: -4 },
    ],
  },
  {
    id: "mad22", type: "team",
    title: "Record Eleventh", team: "Real Madrid 2022-23", lead: null,
    home: { code: "MAD", season: 2022 },
    flavor: "Kaunas, 2023. Real Madrid lifted a record eleventh crown. Build your hero and recreate it: past Partizan, then Barcelona, then Olympiacos.",
    goalLine: "Win the title Real Madrid won.",
    homeLift: { scoring: 2, rebounding: 2, playmaking: 2, defense: 2, efficiency: 2 },
    path: [
      { round: "Playoffs",  code: "PAR", season: 2022, bump: 0 },
      { round: "Semifinal", code: "BAR", season: 2022, bump: 0 },
      { round: "Final",     code: "OLY", season: 2022, bump: -6 },
    ],
  },
  {
    id: "ulk24", type: "team",
    title: "The Desert Crown", team: "Fenerbahçe 2024-25", lead: null,
    home: { code: "ULK", season: 2024 },
    flavor: "Abu Dhabi, 2025. Fenerbahçe lifted a second star in the desert. Build your hero and take the crown: past Real Madrid, then Panathinaikos, then Monaco.",
    goalLine: "Win the title Fenerbahçe won.",
    homeLift: { scoring: 2.5, rebounding: 2.5, playmaking: 2.5, defense: 2.5, efficiency: 2.5 },
    path: [
      { round: "Playoffs",  code: "MAD", season: 2024, bump: -1 },
      { round: "Semifinal", code: "PAN", season: 2024, bump: -1 },
      { round: "Final",     code: "MCO", season: 2024, bump: -1 },
    ],
  },
  // --- Batch 6: long-tenured mid-tier powerhouses, underdog runs, and a legend chasing his ring. ---
  {
    id: "pan01", type: "icon",
    title: "Bodiroga's Crown", team: "Panathinaikos 2001-02", lead: "Bodiroga",
    home: { code: "PAN", season: 2001 },
    base: { code: "APN" }, // Bodiroga, Dejan
    flavor: "Bologna, 2002. Dejan Bodiroga won it on Kinder's own floor. Recreate the masterpiece: past Žalgiris, then Maccabi, then Kinder Bologna in the final.",
    goalLine: "Win the title Bodiroga won.",
    homeLift: { scoring: 3, rebounding: 3, playmaking: 3, defense: 3, efficiency: 3 },
    path: [
      { round: "Playoffs",  code: "ZAL", season: 2001, bump: -3 },
      { round: "Semifinal", code: "TEL", season: 2001, bump: -3 },
      { round: "Final",     code: "VIR", season: 2001, bump: -3 },
    ],
  },
  {
    id: "tel04", type: "icon",
    title: "The Dynasty", team: "Maccabi Tel Aviv 2004-05", lead: "Parker or Jasikevičius",
    home: { code: "TEL", season: 2004 },
    base: { pick: ["AOW", "ADG"] }, // Anthony Parker OR Jasikevicius
    flavor: "Moscow, 2005. Maccabi's back-to-back dynasty. Pick your star, Anthony Parker or Šarūnas Jasikevičius, and defend the crown: past Barcelona, then Panathinaikos, then TAU in the final.",
    goalLine: "Win the title Maccabi defended.",
    homeLift: {},
    path: [
      { round: "Playoffs",  code: "BAR", season: 2004, bump: 0 },
      { round: "Semifinal", code: "PAN", season: 2004, bump: 0 },
      { round: "Final",     code: "BAS", season: 2004, bump: 0 },
    ],
  },
  {
    id: "sie07", type: "team",
    title: "Always the Bridesmaid", team: "Montepaschi Siena 2007-08", lead: null,
    home: { code: "SIE", season: 2007 },
    flavor: "Madrid, 2008. Siena were an Italian dynasty who never lifted Europe. Break through: build your hero, past Olympiacos, then Maccabi, then CSKA for the crown.",
    goalLine: "Win the title Siena never could.",
    homeLift: { scoring: 1.5, rebounding: 1.5, playmaking: 1.5, defense: 1.5, efficiency: 1.5 },
    path: [
      { round: "Playoffs",  code: "OLY", season: 2007, bump: 0 },
      { round: "Semifinal", code: "TEL", season: 2007, bump: 0 },
      { round: "Final",     code: "CSK", season: 2007, bump: 0 },
    ],
  },
  {
    id: "mco24", type: "icon",
    title: "James's Ring", team: "AS Monaco 2024-25", lead: "James",
    home: { code: "MCO", season: 2024 },
    base: { code: "005985" }, // James, Mike
    flavor: "Abu Dhabi, 2025. Monaco reached the final, and Mike James's ring slipped away to Fenerbahçe. Get it back: past Real Madrid, then Olympiacos, then Fenerbahçe.",
    goalLine: "Win the ring Mike James chased.",
    homeLift: { scoring: 1, rebounding: 1, playmaking: 1, defense: 1, efficiency: 1 },
    path: [
      { round: "Playoffs",  code: "MAD", season: 2024, bump: 0 },
      { round: "Semifinal", code: "OLY", season: 2024, bump: 0 },
      { round: "Final",     code: "ULK", season: 2024, bump: 0 },
    ],
  },
  {
    id: "bas15", type: "icon",
    title: "The Underdogs", team: "Baskonia 2015-16", lead: "James or Bourousis",
    home: { code: "BAS", season: 2015 },
    base: { pick: ["005985", "AQU"] }, // Mike James OR Bourousis
    flavor: "Berlin, 2016. Baskonia crashed the Final Four as underdogs. Pick your engine, Mike James or Ioannis Bourousis, and finish the shock: past Real Madrid, then Fenerbahçe, then CSKA.",
    goalLine: "Win the title Baskonia dreamed of.",
    homeLift: { scoring: 1, rebounding: 1, playmaking: 1, defense: 1, efficiency: 1 },
    path: [
      { round: "Playoffs",  code: "MAD", season: 2015, bump: 0 },
      { round: "Semifinal", code: "ULK", season: 2015, bump: 0 },
      { round: "Final",     code: "CSK", season: 2015, bump: -1 },
    ],
  },
  {
    id: "zal17", type: "team",
    title: "Saras's Return", team: "Žalgiris Kaunas 2017-18", lead: null,
    home: { code: "ZAL", season: 2017 },
    flavor: "Belgrade, 2018. Jasikevičius coached his Žalgiris to a shock Final Four. Finish the fairytale: build your hero, past Olympiacos, then Fenerbahçe, then Real Madrid.",
    goalLine: "Win the title Žalgiris dared to chase.",
    homeLift: { scoring: 2.5, rebounding: 2.5, playmaking: 2.5, defense: 2.5, efficiency: 2.5 },
    path: [
      { round: "Playoffs",  code: "OLY", season: 2017, bump: -2 },
      { round: "Semifinal", code: "ULK", season: 2017, bump: -2 },
      { round: "Final",     code: "MAD", season: 2017, bump: -2 },
    ],
  },
  // --- Batch 7: two more picks + two long-tenured mid-tier runs. ---
  {
    id: "csk07", type: "icon",
    title: "Three Guards", team: "CSKA Moscow 2007-08", lead: "Langdon, Papaloukas or Holden",
    home: { code: "CSK", season: 2007 },
    base: { pick: ["BEB", "ATW", "AQO"] }, // Langdon / Papaloukas / Holden
    flavor: "Madrid, 2008. CSKA's fabled three-guard core. Choose your general, Trajan Langdon, Theo Papaloukas or J.R. Holden, and take the crown: past Olympiacos, then Baskonia, then Maccabi.",
    goalLine: "Win the title CSKA won.",
    homeLift: { scoring: 0.5, rebounding: 0.5, playmaking: 0.5, defense: 0.5, efficiency: 0.5 },
    path: [
      { round: "Playoffs",  code: "OLY", season: 2007, bump: 0 },
      { round: "Semifinal", code: "BAS", season: 2007, bump: 0 },
      { round: "Final",     code: "TEL", season: 2007, bump: 0 },
    ],
  },
  {
    id: "bar02", type: "icon",
    title: "Bodiroga's Barça", team: "Barcelona 2002-03", lead: "Bodiroga or Navarro",
    home: { code: "BAR", season: 2002 },
    base: { pick: ["APN", "ADI"] }, // Bodiroga OR Navarro
    flavor: "Barcelona, 2003. Barça lifted their first Euroleague at home. Pick your hero, Dejan Bodiroga or a young Juan Carlos Navarro, and win it: past Baskonia, then Siena, then Benetton Treviso.",
    goalLine: "Win the title Barcelona won.",
    homeLift: { scoring: 3, rebounding: 3, playmaking: 3, defense: 3, efficiency: 3 },
    path: [
      { round: "Playoffs",  code: "BAS", season: 2002, bump: -8 },
      { round: "Semifinal", code: "SIE", season: 2002, bump: -8 },
      { round: "Final",     code: "TRE", season: 2002, bump: -8 },
    ],
  },
  {
    id: "mil20", type: "team",
    title: "Return of a Giant", team: "Olimpia Milano 2020-21", lead: null,
    home: { code: "MIL", season: 2020 },
    flavor: "Cologne, 2021. Messina woke a sleeping giant and Milano crashed the Final Four. Finish the return: build your hero, past Bayern, then Barcelona, then Efes.",
    goalLine: "Win the title Milano reached for.",
    homeLift: { scoring: 2.5, rebounding: 2.5, playmaking: 2.5, defense: 2.5, efficiency: 2.5 },
    path: [
      { round: "Playoffs",  code: "MUN", season: 2020, bump: -2 },
      { round: "Semifinal", code: "BAR", season: 2020, bump: -2 },
      { round: "Final",     code: "IST", season: 2020, bump: -2 },
    ],
  },
  {
    id: "mal06", type: "team",
    title: "Andalusian Dream", team: "Unicaja Málaga 2006-07", lead: null,
    home: { code: "MAL", season: 2006 },
    flavor: "Athens, 2007. Unicaja Málaga crashed the Final Four out of nowhere. Chase the dream: build your hero, past Maccabi, then CSKA, then Panathinaikos.",
    goalLine: "Win the title Unicaja dreamed of.",
    homeLift: { scoring: 3, rebounding: 3, playmaking: 3, defense: 3, efficiency: 3 },
    path: [
      { round: "Playoffs",  code: "TEL", season: 2006, bump: -8 },
      { round: "Semifinal", code: "CSK", season: 2006, bump: -8 },
      { round: "Final",     code: "PAN", season: 2006, bump: -8 },
    ],
  },
  // --- Batch 8: two controversial/near-miss "what ifs" + two lost-final redemptions. ---
  {
    id: "par22", type: "team",
    title: "The Controversy", team: "Partizan 2022-23", lead: null,
    home: { code: "PAR", season: 2022 },
    flavor: "Belgrade, 2023. Obradović's Partizan lost a bitter, brawl-marred playoff to Real Madrid. Rewrite it: build your hero, get past Madrid, then Barcelona, then Olympiacos.",
    goalLine: "Win the title Partizan were denied.",
    homeLift: { scoring: 0.5, rebounding: 0.5, playmaking: 0.5, defense: 0.5, efficiency: 0.5 },
    path: [
      { round: "Playoffs",  code: "MAD", season: 2022, bump: 0 },
      { round: "Semifinal", code: "BAR", season: 2022, bump: 0 },
      { round: "Final",     code: "OLY", season: 2022, bump: -6 },
    ],
  },
  {
    id: "red15", type: "team",
    title: "Belgrade's Chance", team: "Crvena Zvezda 2015-16", lead: null,
    home: { code: "RED", season: 2015 },
    flavor: "A packed Pionir roared as Crvena Zvezda pushed the eventual champions CSKA to the brink in the playoffs. Finish it: build your hero, past CSKA, then Lokomotiv Kuban, then Fenerbahçe.",
    goalLine: "Win the title Zvezda glimpsed.",
    homeLift: { scoring: 1.5, rebounding: 1.5, playmaking: 1.5, defense: 1.5, efficiency: 1.5 },
    path: [
      { round: "Playoffs",  code: "CSK", season: 2015, bump: -3 },
      { round: "Semifinal", code: "TIV", season: 2015, bump: -1 },
      { round: "Final",     code: "ULK", season: 2015, bump: -1 },
    ],
  },
  {
    id: "bar20", type: "team",
    title: "Mirotić's Final", team: "Barcelona 2020-21", lead: null,
    home: { code: "BAR", season: 2020 },
    flavor: "Cologne, 2021. Nikola Mirotić's Barcelona reached the final and fell to Efes. Turn it around: build your hero, past Zenit, then Milano, then Efes for the crown.",
    goalLine: "Win the title Barcelona let slip.",
    homeLift: { scoring: 1.0, rebounding: 1.0, playmaking: 1.0, defense: 1.0, efficiency: 1.0 },
    path: [
      { round: "Playoffs",  code: "DYR", season: 2020, bump: 0 },
      { round: "Semifinal", code: "MIL", season: 2020, bump: 0 },
      { round: "Final",     code: "IST", season: 2020, bump: 0 },
    ],
  },
  {
    id: "ist12", type: "team",
    title: "Five Games to the Brink", team: "Anadolu Efes 2012-13", lead: null,
    home: { code: "IST", season: 2012 },
    flavor: "2013. Efes pushed Olympiacos to a decisive Game 5 in the playoffs and fell just short, as the Reds went on to the back-to-back. Flip it: build your hero, past Olympiacos, then CSKA, then Real Madrid.",
    goalLine: "Win the title Efes were a game from.",
    homeLift: { scoring: 2.5, rebounding: 2.5, playmaking: 2.5, defense: 2.5, efficiency: 2.5 },
    path: [
      { round: "Playoffs",  code: "OLY", season: 2012, bump: -3 },
      { round: "Semifinal", code: "CSK", season: 2012, bump: -3 },
      { round: "Final",     code: "MAD", season: 2012, bump: -3 },
    ],
  },
];

const BY_ID = Object.fromEntries(GOAT_SCENARIOS.map((s) => [s.id, s]));
export const goatScenarioById = (id) => BY_ID[id] || null;

// Coexist: ~SCENARIO_CHANCE% of days are a scenario day, the rest keep the procedural board.
// Deterministic from the date in the KOEG namespace, so the client and the resolver always agree.
// As the scenario table grows, the variety per scenario day grows with it.
const SCENARIO_CHANCE = 40; // out of 100
export function goatScenarioFor(dayKey) {
  if (!GOAT_SCENARIOS.length) return null;
  const h = hashSeed("KOEG-SCEN-" + dayKey) >>> 0;
  if (h % 100 >= SCENARIO_CHANCE) return null;
  return GOAT_SCENARIOS[Math.floor(h / 100) % GOAT_SCENARIOS.length];
}
