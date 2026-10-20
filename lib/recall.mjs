/**
 * sandforge recall — the searchable layer over sandforge's own memory: identity/ (SOUL, MEMORY, LEARNINGS,
 * HEARTBEAT), the session logs in memory/, the skills, the repo's sub-agents and every template's README.
 * Markdown is split into sections by heading. Ranking: sections matching more distinct query terms first,
 * then TF-IDF.
 *
 *   sandforge recall "egress allowlist"      (CLI)
 *   recall("egress allowlist", root, 5)      (code)
 */
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { dirname, join, relative, resolve } from "path";
import { fileURLToPath } from "url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const tokens = (s) => (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length > 1);

function markdownFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? markdownFiles(p) : n.endsWith(".md") ? [p] : [];
  });
}

function sections(root) {
  const out = [];
  const dirs = ["identity", "memory", "skills", ".claude/agents", "templates"];
  for (const path of dirs.flatMap((d) => markdownFiles(join(root, d)))) {
    const file = relative(root, path);
    let heading = file;
    let buf = [];
    const flush = () => {
      if (buf.join("").trim()) out.push({ file, heading, text: buf.join("\n") });
      buf = [];
    };
    for (const line of readFileSync(path, "utf8").split("\n")) {
      if (/^#{1,4}\s/.test(line)) {
        flush();
        heading = line.replace(/^#+\s*/, "");
      } else buf.push(line);
    }
    flush();
  }
  return out;
}

/** Search sandforge's memory; returns the top `limit` sections, most relevant first. */
export function recall(query, root = ROOT, limit = 5) {
  const q = [...new Set(tokens(query))];
  const docs = sections(root).map((s) => ({ ...s, toks: tokens(`${s.heading} ${s.text}`) }));
  const df = new Map(q.map((t) => [t, docs.filter((d) => d.toks.includes(t)).length]));
  return docs
    .map((d) => {
      let matched = 0;
      let score = 0;
      for (const t of q) {
        const tf = d.toks.filter((x) => x === t).length;
        if (!tf) continue;
        matched++;
        score += (1 + Math.log(tf)) * Math.log(1 + docs.length / (df.get(t) || 1));
      }
      const line = d.text.split("\n").find((l) => q.some((t) => l.toLowerCase().includes(t))) ?? "";
      return { file: d.file, heading: d.heading, snippet: line.trim().slice(0, 200), matched, score };
    })
    .filter((h) => h.matched > 0)
    .sort((a, b) => b.matched - a.matched || b.score - a.score)
    .slice(0, limit);
}
