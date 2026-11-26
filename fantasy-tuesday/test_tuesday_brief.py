import unittest

from tuesday_brief import Sleeper, build_brief, render_text

PLAYERS = {
    "q1": {"full_name": "Alpha QB", "position": "QB", "team": "KC"},
    "q2": {"full_name": "Beta QB", "position": "QB", "team": "BUF"},
    "r1": {"full_name": "Rb One", "position": "RB", "team": "SF"},
    "r2": {"full_name": "Rb Two", "position": "RB", "team": "DAL", "injury_status": "Out"},
    "r3": {"full_name": "Rb Three", "position": "RB", "team": "NYG"},
    "w1": {"full_name": "Wr One", "position": "WR", "team": "MIA"},
    "w2": {"full_name": "Wr Two", "position": "WR", "team": "DET"},
    "fa": {"full_name": "Free Agent", "position": "RB", "team": "LAR"},
}
PROJ = {"q1": 20, "q2": 18, "r1": 15, "r2": 14, "r3": 9, "w1": 12, "w2": 8, "fa": 13}


def fake(url):
    if "projections" in url:
        return [{"player_id": k, "stats": {"pts_ppr": v}} for k, v in PROJ.items()]
    path = url.split("/v1", 1)[1]
    return {
        "/state/nfl": {"season": "2026", "week": 13},
        "/league/L": {"name": "Test League", "scoring_settings": {"rec": 1},
                      "roster_positions": ["QB", "RB", "WR", "FLEX", "BN", "BN"]},
        "/league/L/users": [{"user_id": "u1", "display_name": "ann", "metadata": {"team_name": "Ann's Team"}},
                            {"user_id": "u2", "display_name": "bo"}],
        "/league/L/rosters": [
            {"roster_id": 1, "owner_id": "u1", "players": ["q1", "r1", "r2", "r3", "w1"],
             "starters": ["q1", "r2", "w1", "r3"], "settings": {"wins": 8, "losses": 4}},
            {"roster_id": 2, "owner_id": "u2", "players": ["q2", "w2"],
             "starters": ["q2", "0", "w2", "0"], "settings": {"wins": 3, "losses": 9}},
        ],
        "/league/L/matchups/13": [{"roster_id": 1, "matchup_id": 1}, {"roster_id": 2, "matchup_id": 1}],
        "/players/nfl": PLAYERS,
        "/players/nfl/trending/add?lookback_hours=72&limit=200": [{"player_id": "fa", "count": 5000}],
    }[path]


class BriefTest(unittest.TestCase):
    def test_brief(self):
        b = build_brief(Sleeper(fake), "L")
        ann = next(m for m in b["managers"] if m["manager"] == "ann")
        self.assertEqual(ann["matchup"]["opponent"], "bo")
        self.assertGreater(ann["matchup"]["win_pct"], 50)
        self.assertEqual(ann["moves"][0]["start"]["name"], "Rb One")
        self.assertEqual(ann["moves"][0]["bench"]["name"], "Rb Two")
        self.assertEqual(ann["waivers"][0]["name"], "Free Agent")
        self.assertIn("Start Rb One over Rb Two", render_text(b, ann))


if __name__ == "__main__":
    unittest.main()
