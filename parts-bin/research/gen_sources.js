// Build the SEED_SOURCES block from the research JSON files and splice it into index.html.
// Usage: node gen_sources.js <index.html> <checked-date> <sources1.json> [...]
// Drops: not_found entries, entries without a URL/quote, and covers keys that the (corrected)
// rules no longer have. Reports what it dropped so nothing disappears silently.
const fs = require("fs");
const [, , htmlPath, checked, ...files] = process.argv;
let html = fs.readFileSync(htmlPath, "utf8");
const js = html.match(/<script>([\s\S]*)<\/script>/)[1];
const cut = js.indexOf("/* ================= State");
const env = new Function(js.slice(0, cut) + ";return {SEED_PARTS,SEED_PLATFORMS,partRuleKeys,platRuleKeys};")();
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const keysFor = {};
env.SEED_PARTS.forEach(p => { keysFor[slug(p.brand + "-" + p.name)] = env.partRuleKeys(p); });
env.SEED_PLATFORMS.forEach(p => { keysFor["platform:" + p.id] = env.platRuleKeys(p); });

const out = {}; const dropped = []; let n = 0;
for (const f of files) {
  for (const e of JSON.parse(fs.readFileSync(f, "utf8"))) {
    if (e.verdict === "not_found" || !e.url || !/^https?:\/\//.test(e.url)) { dropped.push(`${e.part}: ${e.verdict}${e.note ? " — " + e.note : ""}`); continue; }
    const valid = keysFor[e.part];
    if (!valid) { dropped.push(`${e.part}: unknown part id`); continue; }
    const covers = (e.covers || []).filter(k => valid.includes(k));
    const bad = (e.covers || []).filter(k => !valid.includes(k));
    if (bad.length) dropped.push(`${e.part}: covers not in rules: ${bad.join(", ")}`);
    if (!covers.length) continue;
    (out[e.part] = out[e.part] || []).push({
      id: "s" + (++n), url: e.url, publisher: e.publisher || "", title: e.title || "", kind: e.kind || "other",
      quote: (e.quote || "").slice(0, 400), verdict: e.override_verdict || e.verdict, checked, covers,
      ...(e.app_note ? { note: e.app_note } : {}),
    });
  }
}
const block = `/* SEED_SOURCES:BEGIN (generated from the research pass; see README) */\nconst SEED_SOURCES = ${JSON.stringify(out, null, 1)};\nconst SEED_REMOVED = ${JSON.stringify(JSON.parse(process.env.REMOVED || "[]"))};\n/* SEED_SOURCES:END */`;
html = html.replace(/\/\* SEED_SOURCES:BEGIN[\s\S]*?\/\* SEED_SOURCES:END \*\//, block);
fs.writeFileSync(htmlPath, html);
console.log(`sources: ${n} across ${Object.keys(out).length} parts/firearms`);
console.log("dropped/notes:\n  " + dropped.join("\n  "));
