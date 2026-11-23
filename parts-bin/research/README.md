# Parts Bin research

Source checks for the starter data, run on 2026-11-23.

- `sources-*.json`: raw findings, one record per (part or firearm, source), each
  with a verdict (`confirmed`, `partly`, `contradicted`, `not_found`), the URL,
  a quote, and a note on anything wrong with the original rule.
- `sources-merged.json`: the same records after the starter rules were corrected
  to match them. Covers are mapped onto the app's rule keys, and records whose
  rule was rewritten carry `override_verdict` and an `app_note`.
- `gen_sources.js`: writes the `SEED_SOURCES` block into `../index.html`:

  ```
  REMOVED='["c-h-precision-optic-adapter-plate-rmr","bcm-gunfighter-charging-handle-mod-4"]' \
    node gen_sources.js ../index.html 2026-11-23 sources-merged.json
  ```

Quotes are verbatim where the page could be downloaded. Some pages block automated
fetches and were read through a page-reading tool; those records say so, and the app
shows "exact wording may differ slightly".
