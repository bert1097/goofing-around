#!/usr/bin/env python3
"""Probe free NFL / fantasy / betting data endpoints and report which respond.

Usage: python3 probe_apis.py [--json out.json]
Standard library only; shells out to curl so it honours the system proxy.
Nothing here needs an account. Endpoints marked "undocumented" are public
JSON that the site's own pages use; they can change or block without notice.
"""
import json, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

SEASON, WEEK = 2026, 11
NV = "https://github.com/nflverse/nflverse-data/releases/download"
ESPN = "https://site.api.espn.com/apis/site/v2/sports/football/nfl"
CORE = "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl"
EFF = f"https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{SEASON}"
SL = "https://api.sleeper.app"
MFL = f"https://api.myfantasyleague.com/{SEASON}/export"

# (group, name, url, extra headers)
T = [
 # --- Sleeper (documented, no key) ---
 ("Sleeper", "NFL state (current week)", f"{SL}/v1/state/nfl", {}),
 ("Sleeper", "All players", f"{SL}/v1/players/nfl", {}),
 ("Sleeper", "Trending adds", f"{SL}/v1/players/nfl/trending/add?limit=50", {}),
 ("Sleeper", "Trending drops", f"{SL}/v1/players/nfl/trending/drop?limit=50", {}),
 ("Sleeper", "Weekly projections", f"{SL}/projections/nfl/{SEASON}/{WEEK}?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE", {}),
 ("Sleeper", "Weekly stats", f"{SL}/stats/nfl/{SEASON}/{WEEK-1}?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE", {}),
 ("Sleeper", "Season schedule", f"{SL}/schedule/nfl/regular/{SEASON}", {}),
 ("Sleeper", "Ownership / start %", f"{SL}/players/nfl/research/regular/{SEASON}/{WEEK}", {}),
 # --- ESPN site + core (undocumented, no key) ---
 ("ESPN", "Scoreboard", f"{ESPN}/scoreboard", {}),
 ("ESPN", "Teams", f"{ESPN}/teams", {}),
 ("ESPN", "Team roster (DET)", f"{ESPN}/teams/8/roster", {}),
 ("ESPN", "News", f"{ESPN}/news?limit=50", {}),
 ("ESPN", "Injuries", f"{ESPN}/injuries", {}),
 ("ESPN", "Standings", "https://site.web.api.espn.com/apis/v2/sports/football/nfl/standings", {}),
 ("ESPN", "Power index (FPI)", "https://site.web.api.espn.com/apis/fitt/v3/sports/football/nfl/powerindex", {}),
 ("ESPN", "Events list", f"{CORE}/events?limit=20", {}),
 ("ESPN", "Athletes list", f"{CORE}/athletes?limit=20&active=true", {}),
 ("ESPN", "Futures", f"{CORE}/seasons/{SEASON}/futures", {}),
 ("ESPN", "Draft", f"{CORE}/seasons/{SEASON}/draft", {}),
 # --- ESPN fantasy (undocumented, no key for public data) ---
 ("ESPN Fantasy", "Player pool", f"{EFF}/players?scoringPeriodId=0&view=players_wl", {"X-Fantasy-Filter": '{"filterActive":{"value":true}}'}),
 ("ESPN Fantasy", "Players + projections + ownership", f"{EFF}/segments/0/leaguedefaults/3?view=kona_player_info", {"X-Fantasy-Filter": '{"players":{"limit":50,"sortPercOwned":{"sortPriority":1,"sortAsc":false}}}'}),
 ("ESPN Fantasy", "Pro team schedules / byes", f"{EFF}?view=proTeamSchedules_wl", {}),
 # --- NFL ---
 ("NFL", "Next Gen Stats receiving", f"https://nextgenstats.nfl.com/api/statboard/receiving?season={SEASON}&seasonType=REG", {"Referer": "https://nextgenstats.nfl.com/stats/receiving"}),
 ("NFL", "Next Gen Stats rushing", f"https://nextgenstats.nfl.com/api/statboard/rushing?season={SEASON}&seasonType=REG", {"Referer": "https://nextgenstats.nfl.com/stats/rushing"}),
 ("NFL", "Next Gen Stats passing", f"https://nextgenstats.nfl.com/api/statboard/passing?season={SEASON}&seasonType=REG", {"Referer": "https://nextgenstats.nfl.com/stats/passing"}),
 ("NFL", "Next Gen top speeds", f"https://nextgenstats.nfl.com/api/leaders/speed/ballCarrier?season={SEASON}&seasonType=REG", {"Referer": "https://nextgenstats.nfl.com/stats/top-plays/fastest-ball-carriers"}),
 ("NFL", "NFL.com fantasy player stats", f"https://api.fantasy.nfl.com/v1/players/stats?statType=weekStats&season={SEASON}&week={WEEK-1}&format=json", {}),
 ("NFL", "NFL.com fantasy projections", f"https://api.fantasy.nfl.com/v1/players/stats?statType=weekProjectedStats&season={SEASON}&week={WEEK}&format=json", {}),
 ("NFL", "NFL.com editor rankings", f"https://api.fantasy.nfl.com/v1/players/editorweekranks?season={SEASON}&week={WEEK}&format=json", {}),
 # --- Other fantasy platforms ---
 ("MyFantasyLeague", "Players", f"{MFL}?TYPE=players&JSON=1", {}),
 ("MyFantasyLeague", "ADP", f"{MFL}?TYPE=adp&JSON=1", {}),
 ("MyFantasyLeague", "Injuries", f"{MFL}?TYPE=injuries&JSON=1", {}),
 ("MyFantasyLeague", "NFL schedule", f"{MFL}?TYPE=nflSchedule&W={WEEK}&JSON=1", {}),
 ("MyFantasyLeague", "Bye weeks", f"{MFL}?TYPE=nflByeWeeks&JSON=1", {}),
 ("MyFantasyLeague", "Top adds", f"{MFL}?TYPE=topAdds&JSON=1", {}),
 ("MyFantasyLeague", "Who should I start", f"{MFL}?TYPE=whoShouldIStart&JSON=1", {}),
 ("Fleaflicker", "Player listing", "https://www.fleaflicker.com/api/FetchPlayerListing?sport=NFL", {}),
 ("FF Calculator", "ADP (PPR, 12 team)", f"https://fantasyfootballcalculator.com/api/v1/adp/ppr?teams=12&year={SEASON}", {}),
 ("FantasyCalc", "Trade values (redraft)", "https://api.fantasycalc.com/values/current?isDynasty=false&numQbs=1&numTeams=12&ppr=1", {}),
 ("FantasyCalc", "Trade values (dynasty)", "https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=12&ppr=1", {}),
 ("CBS", "Fantasy player list", "https://api.cbssports.com/fantasy/players/list?version=3.0&SPORT=football&response_format=json", {}),
 ("CBS", "Fantasy average draft position", "https://api.cbssports.com/fantasy/players/average-draft-position?version=3.0&SPORT=football&response_format=json", {}),
 ("Yahoo", "DFS player feed", "https://dfyql-ro.sports.yahoo.com/v2/external/playersFeed/nfl", {}),
 ("DynastyProcess", "Player ID crosswalk", "https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv", {}),
 ("DynastyProcess", "Trade values", "https://raw.githubusercontent.com/dynastyprocess/data/master/files/values.csv", {}),
 ("DynastyProcess", "FantasyPros expert rankings", "https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_fpecr_latest.csv", {}),
 # --- Odds, props, prediction markets ---
 ("Odds", "Action Network multi-book scoreboard", "https://api.actionnetwork.com/web/v1/scoreboard/nfl?period=game", {}),
 ("Odds", "Bovada NFL events", "https://www.bovada.lv/services/sports/event/coupon/events/A/description/football/nfl", {}),
 ("Odds", "DraftKings DFS contests + salaries", "https://www.draftkings.com/lobby/getcontests?sport=NFL", {}),
 ("Odds", "Underdog pick'em lines", "https://api.underdogfantasy.com/beta/v6/over_under_lines", {}),
 ("Odds", "PrizePicks projections", "https://api.prizepicks.com/projections?league_id=9&per_page=250", {}),
 ("Odds", "Kalshi NFL game markets", "https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=KXNFLGAME&limit=100", {}),
 ("Odds", "Kalshi series list (sports)", "https://api.elections.kalshi.com/trade-api/v2/series?category=Sports", {}),
 ("Odds", "Polymarket NFL events", "https://gamma-api.polymarket.com/events?tag_slug=nfl&closed=false&limit=50", {}),
 # --- Need a free key (expect 401/403 without one) ---
 ("Key needed", "The Odds API", "https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?regions=us", {}),
 ("Key needed", "BallDontLie NFL", "https://api.balldontlie.io/nfl/v1/teams", {}),
 ("Key needed", "FantasyPros", f"https://api.fantasypros.com/public/v2/json/nfl/{SEASON}/consensus-rankings?position=WR&week={WEEK}", {}),
 ("Key needed", "SportsDataIO", "https://api.sportsdata.io/v3/nfl/scores/json/Teams", {}),
 ("Key needed", "MySportsFeeds", f"https://api.mysportsfeeds.com/v2.1/pull/nfl/{SEASON}-regular/games.json", {}),
 ("Key needed", "Sportradar", f"https://api.sportradar.com/nfl/official/trial/v7/en/games/{SEASON}/REG/schedule.json", {}),
 # --- Weather ---
 ("Weather", "NWS point lookup (Detroit)", "https://api.weather.gov/points/42.34,-83.05", {}),
 ("Weather", "Open-Meteo forecast", "https://api.open-meteo.com/v1/forecast?latitude=42.34&longitude=-83.05&hourly=temperature_2m,wind_speed_10m,precipitation&forecast_days=2", {}),
 # --- nflverse files (not APIs, but stable URLs) ---
 ("nflverse", "Play-by-play", f"{NV}/pbp/play_by_play_{SEASON}.parquet", {}),
 ("nflverse", "Player weekly stats", f"{NV}/stats_player/stats_player_week_{SEASON}.csv", {}),
 ("nflverse", "Games + closing lines", f"{NV}/schedules/games.csv", {}),
 ("nflverse", "Next Gen Stats receiving", f"{NV}/nextgen_stats/ngs_receiving.csv.gz", {}),
 ("nflverse", "Snap counts", f"{NV}/snap_counts/snap_counts_{SEASON}.csv", {}),
 ("nflverse", "FTN play charting", f"{NV}/ftn_charting/ftn_charting_{SEASON}.csv", {}),
 ("nflverse", "Injuries", f"{NV}/injuries/injuries_{SEASON}.csv", {}),
 ("nflverse", "Expected fantasy points", f"https://github.com/ffverse/ffopportunity/releases/download/latest-data/ep_weekly_{SEASON}.csv", {}),
]


def shape(body):
    """One-line description of a JSON body's top level."""
    try:
        j = json.loads(body)
    except Exception:
        return ""
    if isinstance(j, list):
        inner = sorted(j[0].keys())[:8] if j and isinstance(j[0], dict) else ""
        return f"list[{len(j)}] {inner}"
    if isinstance(j, dict):
        parts = []
        for k, v in list(j.items())[:8]:
            n = f"[{len(v)}]" if isinstance(v, (list, dict)) else ""
            parts.append(f"{k}{n}")
        return "{" + ", ".join(parts) + "}"
    return type(j).__name__


def probe(t):
    group, name, url, hdr = t
    cmd = ["curl", "-gsSL", "-m", "40", "--compressed", "-A", "nfl-data-probe/1.0",
           "-H", "Accept: application/json, text/csv, */*", "-w", "\n%{http_code}", url]
    for k, v in hdr.items():
        cmd += ["-H", f"{k}: {v}"]
    try:
        out = subprocess.run(cmd, capture_output=True, timeout=60).stdout
        body, _, code = out.rpartition(b"\n")
        code = code.decode() or "000"
    except Exception:
        body, code = b"", "000"
    return dict(group=group, name=name, url=url, code=code, bytes=len(body),
                shape=shape(body) if code == "200" else body[:80].decode("utf-8", "replace").replace("\n", " "))


if __name__ == "__main__":
    with ThreadPoolExecutor(8) as ex:
        res = list(ex.map(probe, T))
    for r in res:
        print(f"{r['code']} {r['bytes']:>9} {r['group']:<16} {r['name']:<36} {r['shape'][:110]}")
    ok = sum(r["code"] == "200" and r["bytes"] > 200 for r in res)
    print(f"\n{ok} of {len(res)} responded with data")
    if "--json" in sys.argv:
        json.dump(res, open(sys.argv[sys.argv.index("--json") + 1], "w"), indent=1)
