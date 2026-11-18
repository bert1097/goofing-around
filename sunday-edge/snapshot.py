#!/usr/bin/env python3
"""Save a dated snapshot of live NFL odds, props, projections and injuries.

Usage: python3 snapshot.py [--out DIR]

Each source is flattened to a CSV and written to
  DIR/<source>/<UTC timestamp>.csv.gz
A source is skipped when its content is identical to the previous snapshot.
Every attempt is logged to DIR/runs.csv. Standard library only (uses curl).
History that nflverse already hosts (play-by-play, weekly stats, closing
lines) is deliberately not stored here.
"""
import csv, gzip, hashlib, io, json, os, subprocess, sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else os.path.join(HERE, "data")
NOW = datetime.now(timezone.utc)
STAMP = NOW.strftime("%Y-%m-%dT%H%MZ")
SL = "https://api.sleeper.app"
POS = "position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF"


def get(url, headers=None):
    cmd = ["curl", "-gsSL", "-m", "60", "--compressed", "--retry", "2", "-A", "nfl-data-snapshot/1.0",
           "-H", "Accept: application/json", "-w", "\n%{http_code}", url]
    for k, v in (headers or {}).items():
        cmd += ["-H", f"{k}: {v}"]
    out = subprocess.run(cmd, capture_output=True, timeout=200).stdout
    body, _, code = out.rpartition(b"\n")
    if code != b"200":
        raise RuntimeError(f"HTTP {code.decode() or '000'}")
    return json.loads(body)


def g(d, *path):
    """Nested lookup that returns '' instead of raising."""
    for p in path:
        if isinstance(d, dict):
            d = d.get(p)
        elif isinstance(d, list) and isinstance(p, int) and len(d) > p:
            d = d[p]
        else:
            return ""
    return "" if d is None else d


# ---------- sources: each returns a list of dict rows ----------

def bovada(ctx):
    rows = []
    for block in get("https://www.bovada.lv/services/sports/event/coupon/events/A/description/football/nfl"):
        for e in block.get("events", []):
            for grp in e.get("displayGroups", []):
                for m in grp.get("markets", []):
                    for o in m.get("outcomes", []):
                        rows.append(dict(
                            event_id=e.get("id"), event=e.get("description"), start_ms=e.get("startTime"),
                            live=e.get("live"), group=grp.get("description"), market=m.get("description"),
                            period=g(m, "period", "description"), outcome=o.get("description"),
                            american=g(o, "price", "american"), decimal=g(o, "price", "decimal"),
                            handicap=g(o, "price", "handicap")))
    return rows


def espn_odds(ctx):
    rows = []
    url = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
    if ctx:  # without a week ESPN can return last week's finished games, which carry no odds
        url += f"?seasontype=2&week={ctx['week']}"
    for ev in get(url).get("events", []):
        c = g(ev, "competitions", 0)
        teams = {t.get("homeAway"): g(t, "team", "abbreviation") for t in g(c, "competitors") or []}
        for o in g(c, "odds") or []:
            rows.append(dict(
                game_id=ev.get("id"), kickoff=ev.get("date"), state=g(ev, "status", "type", "state"),
                away=teams.get("away"), home=teams.get("home"), book=g(o, "provider", "name"),
                spread_home=o.get("spread"), total=o.get("overUnder"),
                spread_home_open=g(o, "pointSpread", "home", "open", "line"),
                spread_home_odds=g(o, "pointSpread", "home", "close", "odds"),
                spread_away_odds=g(o, "pointSpread", "away", "close", "odds"),
                total_open=g(o, "total", "over", "open", "line"),
                over_odds=g(o, "total", "over", "close", "odds"),
                under_odds=g(o, "total", "under", "close", "odds"),
                ml_home=g(o, "moneyline", "home", "close", "odds"), ml_away=g(o, "moneyline", "away", "close", "odds"),
                ml_home_open=g(o, "moneyline", "home", "open", "odds"), ml_away_open=g(o, "moneyline", "away", "open", "odds")))
    return rows


def sleeper_projections(ctx):
    rows = []
    for p in get(f"{SL}/projections/nfl/{ctx['season']}/{ctx['week']}?season_type=regular&{POS}"):
        s = p.get("stats") or {}
        if not s.get("pts_ppr") and not s.get("pts_std"):
            continue
        rows.append(dict(
            season=ctx["season"], week=ctx["week"], player_id=p.get("player_id"),
            name=(g(p, "player", "first_name") + " " + g(p, "player", "last_name")).strip(),
            pos=g(p, "player", "position"), team=p.get("team"), opp=p.get("opponent"),
            injury=g(p, "player", "injury_status"), source=p.get("company"),
            pts_ppr=s.get("pts_ppr"), pts_half_ppr=s.get("pts_half_ppr"), pts_std=s.get("pts_std"),
            pass_att=s.get("pass_att"), pass_yd=s.get("pass_yd"), pass_td=s.get("pass_td"), pass_int=s.get("pass_int"),
            rush_att=s.get("rush_att"), rush_yd=s.get("rush_yd"), rush_td=s.get("rush_td"),
            rec_tgt=s.get("rec_tgt"), rec=s.get("rec"), rec_yd=s.get("rec_yd"), rec_td=s.get("rec_td")))
    return sorted(rows, key=lambda r: str(r["player_id"]))


def sleeper_ownership(ctx):
    d = get(f"{SL}/players/nfl/research/regular/{ctx['season']}/{ctx['week']}")
    return [dict(season=ctx["season"], week=ctx["week"], player_id=k, owned=v.get("owned"), started=v.get("started"))
            for k, v in sorted(d.items())]


def sleeper_trending(ctx):
    rows = []
    for kind in ("add", "drop"):
        for i, r in enumerate(get(f"{SL}/v1/players/nfl/trending/{kind}?limit=100&lookback_hours=24"), 1):
            rows.append(dict(kind=kind, rank=i, player_id=r.get("player_id"), count=r.get("count")))
    return rows


def espn_injuries(ctx):
    rows = []
    for t in get("https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries").get("injuries", []):
        for x in t.get("injuries", []):
            rows.append(dict(
                team=t.get("displayName"), player=g(x, "athlete", "displayName"),
                pos=g(x, "athlete", "position", "abbreviation"), status=x.get("status"),
                fantasy_status=g(x, "details", "fantasyStatus", "abbreviation"), injury=g(x, "details", "type"),
                return_date=g(x, "details", "returnDate"), updated=x.get("date"), note=x.get("shortComment")))
    return rows


def dk_salaries(ctx):
    groups = get("https://www.draftkings.com/lobby/getcontests?sport=NFL").get("DraftGroups", [])
    classic = [x for x in groups if x.get("ContestTypeId") == 21]
    if not classic:
        return []
    grp = max(classic, key=lambda x: x.get("GameCount", 0))
    seen, rows = set(), []
    for a in get(f"https://api.draftkings.com/draftgroups/v1/draftgroups/{grp['DraftGroupId']}/draftables").get("draftables", []):
        if a.get("playerId") in seen:
            continue
        seen.add(a.get("playerId"))
        rows.append(dict(
            draft_group=grp["DraftGroupId"], games=grp.get("GameCount"), dk_player_id=a.get("playerId"),
            name=a.get("displayName"), pos=a.get("position"), team=a.get("teamAbbreviation"),
            salary=a.get("salary"), status=a.get("status"), game=g(a, "competition", "name"),
            kickoff=g(a, "competition", "startTime")))
    return rows


def yahoo_salaries(ctx):
    res = g(get("https://dfyql-ro.sports.yahoo.com/v2/external/playersFeed/nfl"), "players", "result") or []
    return [dict(player_code=p.get("playerCode"), name=p.get("name"), pos=p.get("position"), team=p.get("team"),
                 salary=p.get("salary"), fppg=p.get("fppg"), home=p.get("homeTeam"), away=p.get("awayTeam"),
                 kickoff=p.get("gameStartTime")) for p in res]


def fantasycalc_values(ctx):
    rows = []
    for kind, q in (("redraft", "isDynasty=false&numQbs=1"), ("dynasty_sf", "isDynasty=true&numQbs=2")):
        for r in get(f"https://api.fantasycalc.com/values/current?{q}&numTeams=12&ppr=1"):
            rows.append(dict(
                format=kind, name=g(r, "player", "name"), pos=g(r, "player", "position"),
                team=g(r, "player", "maybeTeam"), sleeper_id=g(r, "player", "sleeperId"),
                value=r.get("value"), overall_rank=r.get("overallRank"), pos_rank=r.get("positionRank"),
                trend_30d=r.get("trend30Day"), tier=r.get("maybeTier")))
    return rows


def polymarket(ctx):
    rows = []
    for e in get("https://gamma-api.polymarket.com/events?tag_slug=nfl&closed=false&limit=200"):
        for m in e.get("markets", []):
            try:
                names, prices = json.loads(m.get("outcomes") or "[]"), json.loads(m.get("outcomePrices") or "[]")
            except ValueError:
                continue
            for n, p in zip(names, prices):
                rows.append(dict(event=e.get("title"), market=m.get("question"), outcome=n, price=p,
                                 best_bid=m.get("bestBid"), best_ask=m.get("bestAsk"),
                                 volume=m.get("volume"), ends=m.get("endDate")))
    return rows


SOURCES = [bovada, espn_odds, sleeper_projections, sleeper_ownership, sleeper_trending,
           espn_injuries, dk_salaries, yahoo_salaries, fantasycalc_values, polymarket]


def main():
    os.makedirs(OUT, exist_ok=True)
    state_path = os.path.join(OUT, "state.json")
    state = json.load(open(state_path)) if os.path.exists(state_path) else {}
    try:
        st = get(f"{SL}/v1/state/nfl")
        ctx = dict(season=st["season"], week=st["week"] or 1)
    except Exception as ex:
        print(f"could not read current week: {ex}")
        ctx = None
    log, ok = [], 0
    for fn in SOURCES:
        name = fn.__name__
        try:
            if ctx is None and name.startswith("sleeper"):
                raise RuntimeError("no current week")
            rows = fn(ctx)
            if not rows:
                raise RuntimeError("no rows")
            buf = io.StringIO()
            w = csv.DictWriter(buf, fieldnames=list(rows[0].keys()), lineterminator="\n")
            w.writeheader()
            w.writerows(rows)
            text = buf.getvalue()
            digest = hashlib.sha256(text.encode()).hexdigest()
            ok += 1
            if state.get(name) == digest:
                status = "unchanged"
            else:
                d = os.path.join(OUT, name)
                os.makedirs(d, exist_ok=True)
                with gzip.GzipFile(os.path.join(d, STAMP + ".csv.gz"), "wb", mtime=0) as f:
                    f.write(text.encode())
                state[name] = digest
                status = "saved"
            log.append((name, len(rows), status))
        except Exception as ex:
            log.append((name, 0, f"failed: {ex}"[:120]))
    json.dump(state, open(state_path, "w"), indent=1, sort_keys=True)
    runs = os.path.join(OUT, "runs.csv")
    new = not os.path.exists(runs)
    with open(runs, "a", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        if new:
            w.writerow(["run_utc", "source", "rows", "status"])
        for name, n, status in log:
            w.writerow([STAMP, name, n, status])
            print(f"{name:<22} {n:>6}  {status}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
