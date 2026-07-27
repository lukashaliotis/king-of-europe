#!/usr/bin/env python3
"""
38-0 data pipeline — one-time offline fetch + bake.

Pulls per-game, regular-season player stats from the official EuroLeague v3 API for
seasons E2001..E2025 and bakes a single data/players.json for the game to consume.

Design decisions (see docs/SPEC.md and the build plan):
  - Single source: EuroLeague v3 API. No Basketball-Reference, no scraping.
  - True PIR is native in the API back to 2000, so no approximation.
  - Club identity is the API's stable team.code, never a display name.
  - Grain: one record per (player, season, team). No cross-season aggregation.
  - Five independent category axes; efficiency = TS% (not PIR) to avoid collinearity.
  - Qualification threshold gates both the draft pool and the z-score population.
  - Raw per-season responses are cached to disk so the network fetch only runs once.

Run:  python build_dataset.py            (uses cache when present)
      python build_dataset.py --refetch  (ignore cache, hit the API)
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
from typing import Any, Dict, List

BASE_URL = "https://api-live.euroleague.net/v3/competitions/E/statistics/players/traditional"
# Club roster endpoint carries player position (Guard/Forward/Center) + height, back to 2001.
ROSTER_URL = "https://api-live.euroleague.net/v2/competitions/E/seasons/E{year}/clubs/{club}/people"
COMPETITION = "E"

# positionName -> our 3-bucket code. The API only has G/F/C (no PG/SG/SF/PF/C).
POS_MAP = {"Guard": "G", "Forward": "F", "Center": "C"}
POSITIONS = ["G", "F", "C"]

# Scope: 2001-02 .. 2025-26. SeasonCode E{year} uses the start year.
FIRST_SEASON = 2001
LAST_SEASON = 2025

# Qualification thresholds. PROVISIONAL — the plan flags exact values as tuned at bake time
# once we can see per-season qualified counts. A player must clear BOTH to be draftable and
# to count in the season's z-score distribution.
MIN_GAMES = 5
MIN_MPG = 10.0

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(HERE, "cache")
ROSTER_CACHE_DIR = os.path.join(HERE, "cache", "rosters")
OUT_PATH = os.path.join(HERE, "..", "data", "players.json")

HEADERS = {"Accept": "application/json"}
REQUEST_TIMEOUT = 60
POLITE_DELAY_S = 1.5  # only applies to real network fetches, not cache hits


def season_label(year: int) -> str:
    return f"{year}-{str(year + 1)[-2:]}"


def fetch_season(year: int, refetch: bool) -> Dict[str, Any]:
    """Return the raw API payload for one season, using the on-disk cache when possible."""
    cache_path = os.path.join(CACHE_DIR, f"E{year}.json")
    if os.path.exists(cache_path) and not refetch:
        with open(cache_path, "r", encoding="utf-8") as fh:
            return json.load(fh)

    import requests  # only needed when we actually hit the network — a cached re-bake has no deps

    params = {
        "SeasonMode": "Single",
        "SeasonCode": f"{COMPETITION}{year}",
        "statisticMode": "PerGame",
        "phaseTypeCode": "RS",
        "limit": 1000,
    }
    resp = requests.get(BASE_URL, params=params, headers=HEADERS, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()

    # Defensive pagination: if the API ever caps below the real total, widen and refetch once.
    if data.get("total", 0) > len(data.get("players", [])):
        params["limit"] = data["total"] + 1
        resp = requests.get(BASE_URL, params=params, headers=HEADERS, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()

    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(cache_path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False)
    time.sleep(POLITE_DELAY_S)
    return data


def fetch_club_people(year: int, club: str, refetch: bool) -> List[Dict[str, Any]]:
    """Roster (people) for one club-season, cached. Retries — this endpoint is flaky."""
    cache_path = os.path.join(ROSTER_CACHE_DIR, f"E{year}_{club}.json")
    if os.path.exists(cache_path) and not refetch:
        with open(cache_path, "r", encoding="utf-8") as fh:
            return json.load(fh)

    import requests  # only needed on a real fetch

    url = ROSTER_URL.format(year=year, club=club)
    data = None
    for attempt in range(4):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT)
            if resp.status_code == 200 and resp.text.strip():
                payload = resp.json()
                data = payload if isinstance(payload, list) else payload.get("data", [])
                break
        except Exception:
            pass
        time.sleep(1.5 * (attempt + 1))
    if data is None:
        data = []  # give up gracefully; players fall back to height-based position

    os.makedirs(ROSTER_CACHE_DIR, exist_ok=True)
    with open(cache_path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False)
    time.sleep(0.4)
    return data


def position_from_height(height: float) -> str:
    """Fallback when the roster row has no positionName."""
    if not height:
        return "F"
    if height < 197:
        return "G"
    if height < 207:
        return "F"
    return "C"


def build_coach_rows(year: int, clubs: List[str], refetch: bool) -> List[Dict[str, str]]:
    """Head coaches for a season, straight from the club rosters (typeName == 'Coach').

    The API carries this for every real club-season — no hand-entry, no Wikipedia. A club-season
    can list more than one coach when he was replaced mid-season; we keep them all.
    """
    rows: List[Dict[str, str]] = []
    for club in clubs:
        if ";" in club:
            continue  # composite code from a mid-season transfer row, not a real club
        for entry in fetch_club_people(year, club, refetch):
            if entry.get("typeName") != "Coach":
                continue
            person = entry.get("person") or {}
            code, name = person.get("code"), person.get("name")
            if code and name:
                rows.append({"code": code, "name": name, "club": club})
    return rows


def build_position_map(year: int, clubs: List[str], refetch: bool) -> Dict[str, str]:
    """(personCode -> 'G'/'F'/'C') for every player across a season's clubs."""
    pos_by_code: Dict[str, str] = {}
    for club in clubs:
        for entry in fetch_club_people(year, club, refetch):
            if entry.get("typeName") != "Player":
                continue
            person = entry.get("person") or {}
            code = person.get("code")
            if not code:
                continue
            name = entry.get("positionName")
            pos = POS_MAP.get(name) or position_from_height(person.get("height") or 0)
            pos_by_code[code] = pos
    return pos_by_code


def true_shooting(pts: float, fga: float, fta: float) -> float:
    """TS% as a fraction. Guarded against zero-attempt players (returns 0.0)."""
    denom = 2.0 * (fga + 0.44 * fta)
    if denom <= 0:
        return 0.0
    return pts / denom


def build_record(row: Dict[str, Any], year: int) -> Dict[str, Any] | None:
    """Map one API stat row to a flat record, or None if it lacks identity."""
    player = row.get("player") or {}
    team = player.get("team") or {}
    code = player.get("code")
    team_code = team.get("code")
    if not code or not team_code:
        return None

    pts = float(row.get("pointsScored", 0.0))
    treb = float(row.get("totalRebounds", 0.0))
    ast = float(row.get("assists", 0.0))
    tov = float(row.get("turnovers", 0.0))
    stl = float(row.get("steals", 0.0))
    blk = float(row.get("blocks", 0.0))
    fga = float(row.get("twoPointersAttempted", 0.0)) + float(row.get("threePointersAttempted", 0.0))
    fta = float(row.get("freeThrowsAttempted", 0.0))

    cat = {
        "scoring": pts,
        "rebounding": treb,
        "playmaking": ast - tov,
        "defense": stl + blk,
        "efficiency": true_shooting(pts, fga, fta),
    }

    return {
        "season": year,
        "playerCode": code,
        "playerName": player.get("name", ""),
        "teamCode": team_code,
        "teamName": team.get("name", ""),
        "gp": float(row.get("gamesPlayed", 0.0)),
        "mpg": float(row.get("minutesPlayed", 0.0)),
        "cat": cat,
        # raw per-game box score for card display + the 6th-man usage proxy (FGA per minute).
        "box": {"pts": pts, "reb": treb, "ast": ast, "stl": stl, "blk": blk,
                "ts": cat["efficiency"], "fga": fga},
        "pir": float(row.get("pir", 0.0)),
    }


def qualifies(rec: Dict[str, Any]) -> bool:
    return rec["gp"] >= MIN_GAMES and rec["mpg"] >= MIN_MPG


def mean_std(values: List[float]) -> Dict[str, float]:
    n = len(values)
    if n == 0:
        return {"mean": 0.0, "std": 0.0}
    mean = sum(values) / n
    var = sum((v - mean) ** 2 for v in values) / n  # population std (ddof=0)
    return {"mean": mean, "std": math.sqrt(var)}


CATEGORIES = ["scoring", "rebounding", "playmaking", "defense", "efficiency"]


def main() -> int:
    ap = argparse.ArgumentParser(description="Fetch + bake the 38-0 player dataset.")
    ap.add_argument("--refetch", action="store_true", help="Ignore cache; hit the API.")
    args = ap.parse_args()

    all_players: List[Dict[str, Any]] = []
    seasons_meta: Dict[str, Any] = {}
    coaches: Dict[str, Dict[str, Any]] = {}  # code -> {name, seasons: [[club, year], ...]}

    print(f"Building E{FIRST_SEASON}..E{LAST_SEASON}  "
          f"(qualification: gp>={MIN_GAMES}, mpg>={MIN_MPG})\n")
    print(f"{'season':8} {'rows':>5} {'qual':>5}  notes")

    for year in range(FIRST_SEASON, LAST_SEASON + 1):
        payload = fetch_season(year, args.refetch)
        rows = payload.get("players", [])

        records = [r for r in (build_record(row, year) for row in rows) if r is not None]

        # Positions: fetch each club's roster once, join by player code, fall back to height.
        clubs = sorted({r["teamCode"] for r in records})
        pos_by_code = build_position_map(year, clubs, args.refetch)

        # Head coaches for this season (same cached roster payloads as the positions).
        for row in build_coach_rows(year, clubs, args.refetch):
            entry = coaches.setdefault(row["code"], {"name": row["name"], "seasons": []})
            entry["seasons"].append([row["club"], year])
        for r in records:
            r["pos"] = pos_by_code.get(r["playerCode"]) or "F"
            r["q"] = qualifies(r)

        qualified = [r for r in records if r["q"]]

        # Position-relative baselines: category mean/std computed PER POSITION over the
        # qualified players of that position. A guard's rebounding is judged against guards,
        # a center's playmaking against centers. Reliability shrinkage still applies at runtime.
        cat_stats = {}
        for pos in POSITIONS:
            pool = [r for r in qualified if r["pos"] == pos]
            cat_stats[pos] = {k: mean_std([r["cat"][k] for r in pool]) for k in CATEGORIES}
        seasons_meta[str(year)] = {"label": season_label(year), "catStats": cat_stats}

        all_players.extend(records)

        note = "" if qualified else "!! EMPTY qualified pool"
        # duplicate (player, team) rows within a season would signal a data quirk
        seen = set()
        dups = 0
        for r in qualified:
            key = (r["playerCode"], r["teamCode"])
            if key in seen:
                dups += 1
            seen.add(key)
        if dups:
            note = (note + f" dup(player,team) rows={dups}").strip()
        posspread = {p: sum(1 for r in records if r["pos"] == p) for p in POSITIONS}
        print(f"E{year:<7} {len(records):>5} {len(qualified):>5}  G/F/C={posspread['G']}/{posspread['F']}/{posspread['C']}  {note}")

    out = {
        "meta": {
            "source": "EuroLeague v3 API (api-live.euroleague.net)",
            "scope": f"E{FIRST_SEASON}..E{LAST_SEASON}",
            "statisticMode": "PerGame",
            "phase": "RS",
            "qualification": {"minGames": MIN_GAMES, "minMpg": MIN_MPG},
            "positionSource": "v2 club roster (positionName), fallback by height",
            "scoring_model": "position-relative: z-scores use per-(season,position) baselines",
            "categories": {
                "scoring": "pointsScored",
                "rebounding": "totalRebounds",
                "playmaking": "assists - turnovers",
                "defense": "steals + blocks",
                "efficiency": "TS% = pts / (2*(fga + 0.44*fta))",
            },
            "notAffiliated": "Not affiliated with EuroLeague Basketball.",
        },
        "seasons": seasons_meta,
        "players": all_players,
        "coaches": coaches,
    }

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=None)

    size_kb = os.path.getsize(OUT_PATH) / 1024
    q = sum(1 for r in all_players if r["q"])
    cs = sum(len(c["seasons"]) for c in coaches.values())
    print(f"\nWrote {os.path.relpath(OUT_PATH, HERE)}  "
          f"({len(all_players)} player-seasons, {q} qualified, "
          f"{len(coaches)} coaches over {cs} club-seasons, {size_kb:.0f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
