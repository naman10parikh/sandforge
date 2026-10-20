/**
 * sandforge boot — prove a template's trust envelope in a live E2B Firecracker microVM.
 *
 * A template only declares its envelope. `planBoot` turns an e2b template into the exact options passed to
 * `Sandbox.create` (template, timeout, internet access or an egress allowlist) and the probes that check the
 * declaration from inside the VM: each preinstalled tool and its version, egress blocked or allowed as declared,
 * and no secret-looking variable the template did not declare. `bootInE2B` creates the VM, runs every probe,
 * reports the cold start and kills the VM. It needs E2B_API_KEY and the optional `e2b` package; one boot is one
 * short-lived sandbox on your E2B account, so nothing in CI boots on a push.
 */
import { existsSync, statSync } from "fs";
import { basename, dirname, join, resolve } from "path";
import { TEMPLATES_DIR, validateTemplateDir } from "../eval/run.mjs";

const PROBE_HOST = "example.com"; // a host no template allowlists, to prove egress is closed

/** Load a template by id (under templates/) or by path (a template directory or its template.json). */
export function loadTemplate(ref, templatesDir = TEMPLATES_DIR) {
  const asPath = resolve(ref);
  let dir = join(templatesDir, ref);
  if (existsSync(asPath) && statSync(asPath).isDirectory()) dir = asPath;
  else if (existsSync(asPath) && basename(asPath) === "template.json") dir = dirname(asPath);
  if (!existsSync(join(dir, "template.json"))) return { error: `no template '${ref}' (looked in ${dir})` };
  const validation = validateTemplateDir(dir);
  const failed = validation.checks.filter((c) => !c.ok);
  return { dir, template: validation.template, failed };
}

/** The options sandforge passes to E2B's Sandbox.create for this template. */
export function toE2BOptions(tmpl) {
  if (tmpl.runtime !== "e2b") throw new Error(`template '${tmpl.id}' targets ${tmpl.runtime}; only e2b templates boot in E2B`);
  const trust = tmpl.trustEnvelope;
  const opts = {
    template: tmpl.baseImage?.source || "base",
    timeoutMs: tmpl.compute.timeoutSeconds * 1000,
    metadata: { sandforge: `${tmpl.id}@${tmpl.version}` },
  };
  if (!trust.allowNetworkEgress) opts.allowInternetAccess = false;
  else if ((trust.allowedEgressDomains ?? []).length > 0) {
    opts.network = { allowOut: [...trust.allowedEgressDomains], denyOut: ["0.0.0.0/0"] };
  }
  return opts;
}

/** The checks run inside the VM, each a shell command and what its result must show. */
export function probesFor(tmpl) {
  const probes = (tmpl.preinstalledTools ?? []).map((t) => ({
    name: `tool ${t.name} ${t.version}`,
    kind: "tool",
    tool: t,
    command: `${t.name} --version`,
  }));
  const trust = tmpl.trustEnvelope;
  // curl when present, else wget; exit 127 means neither exists and the probe could not run
  const fetch = (host) =>
    `if command -v curl; then curl -sS -m 8 -o /tmp/sandforge-egress https://${host}; else wget -q -T 8 -O /tmp/sandforge-egress https://${host}; fi`;
  if (!trust.allowNetworkEgress) {
    probes.push({ name: `egress closed (${PROBE_HOST})`, kind: "egress-closed", command: fetch(PROBE_HOST) });
  } else if ((trust.allowedEgressDomains ?? []).length > 0) {
    probes.push({ name: `egress open to ${trust.allowedEgressDomains[0]}`, kind: "egress-open", command: fetch(trust.allowedEgressDomains[0]) });
    probes.push({ name: `egress closed to other hosts (${PROBE_HOST})`, kind: "egress-closed", command: fetch(PROBE_HOST) });
  }
  // awk prints variable names only, never a value, and a multi-line value cannot pose as a name
  probes.push({ name: "no undeclared secrets in the environment", kind: "secrets", command: "awk 'BEGIN { for (k in ENVIRON) print k }'" });
  probes.push({ name: "who runs the code", kind: "note", command: "id; sudo -n true && echo 'passwordless sudo: yes' || echo 'passwordless sudo: no'" });
  probes.push({ name: "compute seen inside", kind: "note", command: "echo cpus=$(nproc); grep MemTotal /proc/meminfo" });
  return probes;
}

/** A boot plan: the create options and the probes, without creating anything. */
export function planBoot(tmpl) {
  return { template: tmpl.id, version: tmpl.version, options: toE2BOptions(tmpl), probes: probesFor(tmpl).map(({ name, command }) => ({ name, command })) };
}

const versionOf = (text) => {
  const m = String(text).match(/(\d+)\.(\d+)(?:\.(\d+))?/) ?? String(text).match(/v?(\d+)/);
  return m ? m.slice(1).filter((x) => x !== undefined).map(Number) : null;
};

/** Does an observed version satisfy a declared one (">=3.11", ">=18" or a bare major such as "22")? */
export function versionSatisfies(observed, declared) {
  const have = versionOf(observed);
  const want = versionOf(declared);
  if (!have || !want) return false;
  if (!String(declared).trim().startsWith(">=")) return have[0] === want[0];
  for (let i = 0; i < want.length; i++) {
    const h = have[i] ?? 0;
    if (h !== want[i]) return h > want[i];
  }
  return true;
}

const SECRET_NAME = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL)/i;

/** Judge one probe's result against what the template declares. Never echoes a variable's value. */
export function judge(probe, result, tmpl) {
  const out = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (probe.kind === "tool") {
    if (result.exitCode === 0 && versionSatisfies(out, probe.tool.version)) return { ok: true, detail: out.split("\n")[0] };
    if (result.exitCode === 127 || /not found/i.test(out)) {
      return probe.tool.required ? { ok: false, detail: "not installed, but the template says it is required" } : { ok: true, detail: "not installed (optional)" };
    }
    return { ok: !probe.tool.required, detail: `found '${out.split("\n")[0]}', declared ${probe.tool.version}` };
  }
  if (probe.kind === "egress-closed") {
    if (result.exitCode === 127) return { ok: false, detail: "neither curl nor wget is installed, so the probe could not run" };
    return result.exitCode === 0 ? { ok: false, detail: "the request went through: egress is open" } : { ok: true, detail: `blocked (exit ${result.exitCode})` };
  }
  if (probe.kind === "egress-open") {
    return result.exitCode === 0 ? { ok: true, detail: "reached" } : { ok: false, detail: `declared open but blocked (exit ${result.exitCode})` };
  }
  if (probe.kind === "secrets") {
    const declared = new Set(tmpl.trustEnvelope.secretSlots ?? []);
    if (result.exitCode !== 0) return { ok: false, detail: `could not list the environment (exit ${result.exitCode})` };
    const names = String(result.stdout ?? "").split("\n").map((l) => l.trim()).filter((n) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(n) && SECRET_NAME.test(n) && !declared.has(n));
    return names.length === 0 ? { ok: true, detail: "none" } : { ok: false, detail: `undeclared: ${names.join(", ")}` };
  }
  return { ok: true, note: true, detail: out.replace(/\s*\n\s*/g, "; ") };
}

/** Boot the template in a fresh E2B microVM, run every probe, kill the VM. Never throws. */
export async function bootInE2B(tmpl, { probeTimeoutSec = 20 } = {}) {
  let options;
  try {
    options = toE2BOptions(tmpl);
  } catch (e) {
    return { ok: false, error: e.message, probes: [] };
  }
  if (!process.env.E2B_API_KEY) return { ok: false, error: "E2B_API_KEY is not set", options, probes: [] };
  let Sandbox;
  try {
    const pkg = "e2b"; // a variable, so nothing loads the optional package until a boot needs it
    ({ Sandbox } = await import(pkg));
  } catch {
    return { ok: false, error: "the optional `e2b` package is not installed (npm install e2b)", options, probes: [] };
  }
  let sbx = null;
  const started = Date.now();
  try {
    sbx = await Sandbox.create(options);
    const coldStartMs = Date.now() - started;
    const probes = [];
    for (const probe of probesFor(tmpl)) {
      let result;
      try {
        const r = await sbx.commands.run(probe.command, { timeoutMs: probeTimeoutSec * 1000 });
        result = { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr };
      } catch (e) {
        // The SDK throws on a non-zero exit (the error carries the fields) and on a timeout (it does not)
        result = typeof e?.exitCode === "number" ? { exitCode: e.exitCode, stdout: e.stdout, stderr: e.stderr } : { exitCode: -1, stderr: `no answer in ${probeTimeoutSec} s` };
      }
      probes.push({ name: probe.name, ...judge(probe, result, tmpl) });
    }
    return { ok: probes.every((p) => p.ok), template: tmpl.id, sandboxId: sbx.sandboxId, coldStartMs, options, probes };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), options, probes: [] };
  } finally {
    await sbx?.kill().catch(() => undefined); // Intentionally silent: the VM also expires on its own timeout.
  }
}
