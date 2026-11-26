# Tuesday Brief

Every Tuesday, each manager in a Sleeper league gets a note with:

- **Matchup**: opponent, records, projected scores, a rough win chance and their top threats.
- **Lineup advice**: your best projected lineup vs. who you're starting now, plus injury flags.
- **Waiver targets**: unrostered players ranked by projection, trending adds and how much they'd upgrade your weakest starter.

## Setup
1. Copy `config.example.json`, fill in your league ID (from the Sleeper league URL) and one entry per manager (Sleeper username + Discord webhook, Slack webhook or email). Managers without an entry are skipped.
2. Add it as the repo secret `TUESDAY_BRIEF_CONFIG_JSON`. For email also set `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`.
3. `.github/workflows/tuesday-brief.yml` runs it Tuesdays at 14:07 UTC (also runnable by hand).

Try it locally: `python tuesday_brief.py --config config.json --dry-run --json brief.json`.
`brief.json` can be pasted into the shared web viewer to see every manager's brief.

Tests: `python -m unittest`. Projections come from Sleeper's unofficial projections endpoint.
