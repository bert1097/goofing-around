#!/usr/bin/env python3
"""Tuesday Brief: weekly fantasy football notes for every manager in a Sleeper league.

For each manager it builds:
  * a matchup preview (opponent, records, projected totals, rough win chance)
  * lineup advice (best projected lineup vs. current starters, injury/bye flags)
  * the best players on waivers (projection, estimated rostered %, add/drop trend)

and sends it to Discord, Slack and/or email. Standard library only.

Usage:
  python tuesday_brief.py --config config.json            # send notifications
  python tuesday_brief.py --config config.json --dry-run  # print only
  python tuesday_brief.py --config config.json --json brief.json  # also write JSON
"""
from __future__ import annotations

import argparse
import json
import math
import os
import smtplib
import sys
import urllib.request
from email.message import EmailMessage

API = "https://api.sleeper.app/v1"
PROJ_API = "https://api.sleeper.com/projections/nfl"
POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"]
FLEX_ELIGIBLE = {
    "FLEX": {"RB", "WR", "TE"},
    "WRRB_FLEX": {"RB", "WR"},
    "REC_FLEX": {"WR", "TE"},
    "SUPER_FLEX": {"QB", "RB", "WR", "TE"},
}
BENCH_SLOTS = {"BN", "IR", "TAXI"}
BAD_STATUS = {"Out", "IR", "Doubtful", "PUP", "Sus", "NA"}


# ---------------------------------------------------------------- data access
class Sleeper:
    def __init__(self, fetch=None):
        self._fetch = fetch or _http_json

    def get(self, path):
        return self._fetch(API + path)

    def projections(self, season, week):
        """Map player_id -> stats dict. Tries the newer endpoint, then the older one."""
        qs = "&".join(f"position[]={p}" for p in POSITIONS)
        try:
            rows = self._fetch(f"{PROJ_API}/{season}/{week}?season_type=regular&{qs}")
            return {r["player_id"]: r.get("stats") or {} for r in rows or []}
        except Exception:
            pass
        try:
            return self._fetch(f"{API}/projections/nfl/regular/{season}/{week}") or {}
        except Exception:
            return {}


def _http_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "tuesday-brief/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


# ---------------------------------------------------------------- helpers
def scoring_key(scoring):
    rec = (scoring or {}).get("rec", 0)
    return "pts_ppr" if rec >= 1 else "pts_half_ppr" if rec >= 0.5 else "pts_std"


def player_name(players, pid):
    p = players.get(pid) or {}
    if p.get("position") == "DEF":
        return f"{p.get('team', pid)} D/ST"
    return p.get("full_name") or f"{p.get('first_name', '')} {p.get('last_name', '')}".strip() or pid


def player_line(players, proj, pid):
    p = players.get(pid) or {}
    return {
        "id": pid,
        "name": player_name(players, pid),
        "pos": p.get("position", "?"),
        "team": p.get("team") or "FA",
        "proj": round(proj.get(pid, 0.0), 1),
        "status": p.get("injury_status") or "",
    }


def eligible(slot, pos):
    return pos in FLEX_ELIGIBLE.get(slot, {slot})


def best_lineup(slots, roster_ids, players, proj):
    """Greedy optimal lineup: fill the strictest slots first, flexes last."""
    slots = [s for s in slots if s not in BENCH_SLOTS]
    order = sorted(range(len(slots)), key=lambda i: len(FLEX_ELIGIBLE.get(slots[i], {slots[i]})))
    pool = sorted(roster_ids, key=lambda pid: -usable_proj(players, proj, pid))
    chosen = [None] * len(slots)
    used = set()
    for i in order:
        for pid in pool:
            pos = (players.get(pid) or {}).get("position")
            if pid not in used and eligible(slots[i], pos):
                chosen[i] = pid
                used.add(pid)
                break
    return slots, chosen


def usable_proj(players, proj, pid):
    status = (players.get(pid) or {}).get("injury_status")
    return 0.0 if status in BAD_STATUS else proj.get(pid, 0.0)


def win_chance(mine, theirs):
    # Weekly team scores spread roughly +/- 20 points; difference of two ~ sd 28.
    diff = mine - theirs
    return round(100 * 0.5 * (1 + math.erf(diff / (28 * math.sqrt(2)))))


def record(roster):
    s = roster.get("settings") or {}
    w, l, t = s.get("wins", 0), s.get("losses", 0), s.get("ties", 0)
    return f"{w}-{l}" + (f"-{t}" if t else "")


# ---------------------------------------------------------------- brief
def build_brief(client, league_id, week=None, waiver_count=5):
    state = client.get("/state/nfl")
    season = state.get("season")
    week = week or state.get("week") or state.get("display_week")
    league = client.get(f"/league/{league_id}")
    users = {u["user_id"]: u for u in client.get(f"/league/{league_id}/users")}
    rosters = client.get(f"/league/{league_id}/rosters")
    matchups = client.get(f"/league/{league_id}/matchups/{week}") or []
    players = client.get("/players/nfl")
    key = scoring_key(league.get("scoring_settings"))
    raw = client.projections(season, week)
    proj = {pid: float((s or {}).get(key) or 0) for pid, s in raw.items()}

    slots_cfg = league.get("roster_positions") or []
    rostered = {pid for r in rosters for pid in (r.get("players") or [])}
    trending = client.get("/players/nfl/trending/add?lookback_hours=72&limit=200") or []
    trend_count = {t["player_id"]: t.get("count", 0) for t in trending}
    dropping = client.get("/players/nfl/trending/drop?lookback_hours=72&limit=200") or []
    drop_count = {t["player_id"]: t.get("count", 0) for t in dropping}

    by_roster = {r["roster_id"]: r for r in rosters}
    team_of = {}
    for r in rosters:
        u = users.get(r.get("owner_id")) or {}
        team_of[r["roster_id"]] = {
            "manager": u.get("display_name") or f"Team {r['roster_id']}",
            "user_id": r.get("owner_id"),
            "team": (u.get("metadata") or {}).get("team_name") or u.get("display_name") or f"Team {r['roster_id']}",
        }

    lineups = {}
    for r in rosters:
        ids = r.get("players") or []
        slots, best = best_lineup(slots_cfg, ids, players, proj)
        lineups[r["roster_id"]] = (slots, best, r.get("starters") or [])

    def total(rid, which):
        slots, best, cur = lineups[rid]
        ids = best if which == "best" else cur
        return round(sum(usable_proj(players, proj, p) for p in ids if p and p != "0"), 1)

    opp_of = {}
    groups = {}
    for m in matchups:
        if m.get("matchup_id"):
            groups.setdefault(m["matchup_id"], []).append(m["roster_id"])
    for ids in groups.values():
        if len(ids) == 2:
            opp_of[ids[0]], opp_of[ids[1]] = ids[1], ids[0]

    free = [pid for pid in set(trend_count) | {p for p in proj if proj[p] > 0}
            if pid not in rostered and (players.get(pid) or {}).get("position") in POSITIONS
            and (players.get(pid) or {}).get("injury_status") not in BAD_STATUS]

    managers = []
    for rid, r in by_roster.items():
        slots, best, cur = lineups[rid]
        me = team_of[rid]
        opp = opp_of.get(rid)
        mine_proj = total(rid, "best")
        entry = {
            **me,
            "roster_id": rid,
            "record": record(r),
            "points_for": (r.get("settings") or {}).get("fpts", 0),
            "matchup": None,
            "lineup": [],
            "moves": [],
            "flags": [],
        }
        if opp:
            theirs = total(opp, "best")
            o = team_of[opp]
            opp_starters = [player_line(players, proj, p) for p in lineups[opp][1] if p]
            entry["matchup"] = {
                "opponent": o["team"],
                "opponent_manager": o["manager"],
                "opponent_record": record(by_roster[opp]),
                "my_proj": mine_proj,
                "opp_proj": theirs,
                "win_pct": win_chance(mine_proj, theirs),
                "opp_threats": sorted(opp_starters, key=lambda x: -x["proj"])[:3],
            }

        for slot, pid in zip(slots, best):
            entry["lineup"].append({"slot": slot, **(player_line(players, proj, pid) if pid else
                                                    {"name": "(empty)", "pos": "", "team": "", "proj": 0, "status": "", "id": None})})

        cur_set = {p for p in cur if p and p != "0"}
        best_set = {p for p in best if p}
        outs = sorted(cur_set - best_set, key=lambda p: proj.get(p, 0))
        ins = sorted(best_set - cur_set, key=lambda p: -proj.get(p, 0))
        for a, b in zip(ins, outs):
            pa, pb = player_line(players, proj, a), player_line(players, proj, b)
            why = f"{pb['name']} is {pb['status']}" if pb["status"] in BAD_STATUS else \
                f"+{round(pa['proj'] - pb['proj'], 1)} projected"
            entry["moves"].append({"start": pa, "bench": pb, "why": why})
        for pid in (r.get("players") or []):
            pl = player_line(players, proj, pid)
            if pl["status"] in BAD_STATUS or pl["status"] == "Questionable":
                entry["flags"].append(pl)

        managers.append(entry)

    return {"league": league.get("name", "League"), "season": season, "week": week,
            "scoring": key.replace("pts_", "").replace("_", "-").upper(),
            "waivers": rank_waivers(free, players, proj, trend_count, drop_count, waiver_count),
            "managers": managers}


def est_rostered(player):
    """Sleeper doesn't publish roster %. Its search_rank tracks popularity closely,
    so map it to a rough league-wide rostered % (rank 1 ~ 100%, ~300 ~ 30%, 900+ ~ 3%)."""
    rank = player.get("search_rank")
    if not isinstance(rank, (int, float)) or rank <= 0 or rank > 5000:
        return 1
    return max(1, min(99, round(100 * math.exp(-rank / 250))))


def rank_waivers(free, players, proj, adds, drops, count):
    """Best available players league-wide, ignoring any one team's needs.
    Score = 50% projection + 30% estimated rostered % + 20% net adds (each scaled 0-1)."""
    rows = []
    for pid in free:
        pl = player_line(players, proj, pid)
        net = adds.get(pid, 0) - drops.get(pid, 0)
        if pl["proj"] <= 0 and net <= 0:
            continue
        rows.append({**pl, "rostered": est_rostered(players.get(pid) or {}),
                     "adds": adds.get(pid, 0), "drops": drops.get(pid, 0), "net": net})
    if not rows:
        return []
    top = lambda k: max(max(r[k] for r in rows), 1)
    pmax, rmax, nmax = top("proj"), top("rostered"), top("net")
    for r in rows:
        r["score"] = round(100 * (0.5 * r["proj"] / pmax + 0.3 * r["rostered"] / rmax
                                  + 0.2 * max(r["net"], 0) / nmax))
        r["trend"] = "hot" if r["net"] >= 0.5 * nmax and r["net"] > 0 else "rising" if r["net"] > 0 else "cooling"
    return sorted(rows, key=lambda r: -r["score"])[:count]


# ---------------------------------------------------------------- rendering
def render_text(brief, m):
    L = [f"🏈 Tuesday Brief: {brief['league']}, Week {brief['week']}",
         f"{m['team']} ({m['record']})", ""]
    mu = m["matchup"]
    if mu:
        L += [f"MATCHUP vs {mu['opponent']} ({mu['opponent_record']})",
              f"Projected {mu['my_proj']} to {mu['opp_proj']}: about {mu['win_pct']}% to win.",
              "Their top threats: " + ", ".join(f"{t['name']} ({t['proj']})" for t in mu["opp_threats"]), ""]
    else:
        L += ["No matchup this week (bye or playoffs).", ""]
    L.append("LINEUP")
    if m["moves"]:
        L += [f"• Start {x['start']['name']} over {x['bench']['name']} ({x['why']})" for x in m["moves"]]
    else:
        L.append("• Your current starters are already your best projected lineup.")
    if m["flags"]:
        L.append("• Watch: " + ", ".join(f"{f['name']} ({f['status']})" for f in m["flags"]))
    L += ["", "BEST ON WAIVERS"]
    for i, w in enumerate(brief["waivers"], 1):
        L.append(f"{i}. {w['name']} {w['pos']} {w['team']}: {w['proj']} proj, ~{w['rostered']}% rostered, "
                 f"net {w['net']:+,} adds ({w['trend']})")
    return "\n".join(L)


# ---------------------------------------------------------------- delivery
def post_json(url, payload):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    urllib.request.urlopen(req, timeout=30).read()


def send(recipient, subject, text):
    if recipient.get("discord_webhook"):
        post_json(recipient["discord_webhook"], {"content": text[:1990]})
    if recipient.get("slack_webhook"):
        post_json(recipient["slack_webhook"], {"text": text})
    if recipient.get("email"):
        msg = EmailMessage()
        msg["Subject"], msg["From"], msg["To"] = subject, os.environ["SMTP_FROM"], recipient["email"]
        msg.set_content(text)
        with smtplib.SMTP(os.environ.get("SMTP_HOST", "smtp.gmail.com"), int(os.environ.get("SMTP_PORT", 587))) as s:
            s.starttls()
            s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"])
            s.send_message(msg)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default=os.environ.get("TUESDAY_BRIEF_CONFIG", "config.json"))
    ap.add_argument("--week", type=int)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--json", help="also write the brief as JSON (for the web viewer)")
    a = ap.parse_args(argv)
    raw = os.environ.get("TUESDAY_BRIEF_CONFIG_JSON")
    cfg = json.loads(raw) if raw else json.load(open(a.config))

    brief = build_brief(Sleeper(), cfg["league_id"], a.week, cfg.get("waiver_count", 10))
    if a.json:
        json.dump(brief, open(a.json, "w"), indent=2)
    recipients = {r["manager"].lower(): r for r in cfg.get("recipients", [])}
    for m in brief["managers"]:
        text = render_text(brief, m)
        r = recipients.get(m["manager"].lower()) or recipients.get(m["team"].lower())
        if a.dry_run or not r:
            print(text, "\n" + "-" * 40)
            continue
        send(r, f"Week {brief['week']} brief: {m['team']}", text)
        print(f"sent to {m['manager']}")
    if cfg.get("league_channel_webhook") and not a.dry_run:
        post_json(cfg["league_channel_webhook"], {"content": f"Week {brief['week']} briefs are out. Check your DMs."})


if __name__ == "__main__":
    sys.exit(main())
