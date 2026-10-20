#!/usr/bin/env node
/**
 * Sandforge Template Validator
 *
 * Validates every active sandbox template in templates/ against:
 * 1. JSON Schema (eval/schema/template.schema.json)
 * 2. Sandforge trust invariants (MEMORY.md §Trust envelope invariants)
 * 3. Runtime-specific structural checks (e.g. devcontainer.json present)
 *
 * Exit 0 = all green. Non-zero = at least one failure.
 * Run: node eval/run.mjs            (the CLI, MCP server and hooks import the same checks)
 */

import { readFileSync, readdirSync, existsSync, statSync, realpathSync } from "fs";
import { join, resolve, dirname, basename } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, "..");
export const TEMPLATES_DIR = join(REPO_ROOT, "templates");
const SCHEMA_PATH = join(__dirname, "schema", "template.schema.json");

// Capabilities that let code inside a sandbox reach the host or other processes (TODOS S2.4).
export const DANGEROUS_CAPS = ["ALL", "SYS_ADMIN", "NET_ADMIN", "SYS_PTRACE", "SYS_MODULE", "DAC_READ_SEARCH"];

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function loadSchema() {
  return loadJson(SCHEMA_PATH);
}

// ─── Minimal JSON Schema validator (no external deps) ───────────────────────
// Validates required fields, types, enum values, patterns and additionalProperties: false.
// Not a full ajv — handles the subset our schema actually uses.

export function validateSchema(data, schema, path = "#") {
  const errors = [];

  if (schema.type === "object") {
    if (typeof data !== "object" || Array.isArray(data) || data === null) {
      errors.push(`${path}: expected object, got ${typeof data}`);
      return errors;
    }
    for (const req of schema.required ?? []) {
      if (!(req in data)) {
        errors.push(`${path}: missing required field "${req}"`);
      }
    }
    for (const [key, subSchema] of Object.entries(schema.properties ?? {})) {
      if (key in data) {
        errors.push(...validateSchema(data[key], subSchema, `${path}.${key}`));
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(data)) {
        if (!(key in (schema.properties ?? {}))) errors.push(`${path}: unknown field "${key}"`);
      }
    }
  } else if (schema.type === "string") {
    if (typeof data !== "string") {
      errors.push(`${path}: expected string, got ${typeof data}`);
    } else {
      if (schema.enum && !schema.enum.includes(data)) {
        errors.push(`${path}: "${data}" not in enum [${schema.enum.join(", ")}]`);
      }
      if (schema.pattern && !new RegExp(schema.pattern).test(data)) {
        errors.push(`${path}: "${data}" does not match pattern ${schema.pattern}`);
      }
      if (schema.minLength !== undefined && data.length < schema.minLength) {
        errors.push(`${path}: string too short (${data.length} < ${schema.minLength})`);
      }
      if (schema.maxLength !== undefined && data.length > schema.maxLength) {
        errors.push(`${path}: string too long (${data.length} > ${schema.maxLength})`);
      }
    }
  } else if (schema.type === "number") {
    if (typeof data !== "number") {
      errors.push(`${path}: expected number, got ${typeof data}`);
    } else {
      if (schema.minimum !== undefined && data < schema.minimum) {
        errors.push(`${path}: ${data} < minimum ${schema.minimum}`);
      }
      if (schema.maximum !== undefined && data > schema.maximum) {
        errors.push(`${path}: ${data} > maximum ${schema.maximum}`);
      }
    }
  } else if (schema.type === "boolean") {
    if (typeof data !== "boolean") {
      errors.push(`${path}: expected boolean, got ${typeof data}`);
    }
  } else if (schema.type === "array") {
    if (!Array.isArray(data)) {
      errors.push(`${path}: expected array, got ${typeof data}`);
    } else {
      if (schema.minItems !== undefined && data.length < schema.minItems) {
        errors.push(`${path}: array length ${data.length} < minItems ${schema.minItems}`);
      }
      if (schema.items) {
        for (let i = 0; i < data.length; i++) {
          errors.push(...validateSchema(data[i], schema.items, `${path}[${i}]`));
        }
      }
    }
  }

  return errors;
}

// ─── Trust invariant checks ─────────────────────────────────────────────────

export function checkTrustInvariants(tmpl) {
  const errors = [];
  const trust = tmpl.trustEnvelope ?? {};

  // Invariant 1: allowNetworkEgress=false ⟹ allowedEgressDomains must be empty
  if (!trust.allowNetworkEgress && (trust.allowedEgressDomains ?? []).length > 0) {
    errors.push(
      "allowNetworkEgress=false but allowedEgressDomains is non-empty — contradictory trust envelope"
    );
  }

  // Invariant 2: compute.timeoutSeconds must be set (already validated by schema; belt+suspenders)
  if (!tmpl.compute || typeof tmpl.compute.timeoutSeconds !== "number") {
    errors.push("compute.timeoutSeconds missing or non-numeric");
  }

  // Invariant 3: compute.estimatedHourlyCost must be a non-empty string
  if (!tmpl.compute || typeof tmpl.compute.estimatedHourlyCost !== "string" || tmpl.compute.estimatedHourlyCost.trim() === "") {
    errors.push("compute.estimatedHourlyCost must be a non-empty string");
  }

  // Invariant 4: capAdd present and array (may be empty — that's fine)
  if (!Array.isArray(trust.capAdd)) {
    errors.push("trustEnvelope.capAdd must be an array (can be empty)");
  } else {
    // Invariant 4b (TODOS S2.4): no capability that reaches the host or other processes
    const dangerous = trust.capAdd.filter((c) => DANGEROUS_CAPS.includes(String(c).toUpperCase().replace(/^CAP_/, "")));
    if (dangerous.length > 0) {
      errors.push(`trustEnvelope.capAdd grants dangerous capabilities (${dangerous.join(", ")}) — never allowed in a template`);
    }
  }

  // Invariant 5: notes must explain any widened permissions
  if (trust.allowNetworkEgress && (!trust.notes || trust.notes.length < 20)) {
    errors.push("Network egress is enabled — trustEnvelope.notes must explain why (>= 20 chars)");
  }

  return errors;
}

// ─── Runtime-specific checks ─────────────────────────────────────────────────

export function checkRuntimeSpecific(tmpl, templateDir) {
  const errors = [];

  if (tmpl.runtime === "devcontainer") {
    const dcPath = join(templateDir, "devcontainer.json");
    if (!existsSync(dcPath)) {
      errors.push("devcontainer runtime requires a devcontainer.json file in the template directory");
    } else {
      // Validate it's parseable JSON
      try {
        loadJson(dcPath);
      } catch (e) {
        errors.push(`devcontainer.json is invalid JSON: ${e.message}`);
      }
    }
  }

  return errors;
}

// ─── One template, then all of them ─────────────────────────────────────────

/** Validate one template directory. Returns { name, template, checks: [{ label, ok, reason }] }. */
export function validateTemplateDir(templateDir, schema = loadSchema()) {
  const name = basename(templateDir);
  const checks = [];
  const add = (label, reason) => checks.push(reason ? { label, ok: false, reason } : { label, ok: true });
  const templatePath = join(templateDir, "template.json");

  // 0. template.json must exist
  if (!existsSync(templatePath)) {
    add("template.json present", "file not found");
    return { name, template: null, checks };
  }

  let tmpl;
  try {
    tmpl = loadJson(templatePath);
  } catch (e) {
    add("template.json parseable", `invalid JSON: ${e.message}`);
    return { name, template: null, checks };
  }
  add("template.json parseable");

  // 1. id matches directory name
  add("id matches directory", tmpl.id !== name ? `template.json id="${tmpl.id}" but directory="${name}"` : null);

  // 2. JSON Schema validation
  const schemaErrors = validateSchema(tmpl, schema);
  if (schemaErrors.length > 0) schemaErrors.forEach((e) => add("schema", e));
  else add("schema valid");

  // 3. Trust invariants
  const trustErrors = checkTrustInvariants(tmpl);
  if (trustErrors.length > 0) trustErrors.forEach((e) => add("trust invariant", e));
  else add("trust invariants pass");

  // 4. Status check — only active templates are expected to pass
  add(
    "status=active",
    tmpl.status !== "active" ? `template status="${tmpl.status}" — only active templates are validated (move to archive/ if deprecated)` : null
  );

  // 5. README.md present
  add("README.md present", existsSync(join(templateDir, "README.md")) ? null : "file not found");

  // 6. Runtime-specific checks
  const runtimeErrors = checkRuntimeSpecific(tmpl, templateDir);
  if (runtimeErrors.length > 0) runtimeErrors.forEach((e) => add("runtime-specific", e));
  else add(`runtime-specific checks (${tmpl.runtime})`);

  return { name, template: tmpl, checks };
}

/** Names of the active template directories (archive/ excluded). */
export function listTemplateNames(templatesDir = TEMPLATES_DIR) {
  if (!existsSync(templatesDir)) return [];
  return readdirSync(templatesDir)
    .filter((name) => name !== "archive" && statSync(join(templatesDir, name)).isDirectory())
    .sort();
}

/** Validate every active template. Returns { templates, failures, results }. */
export function validateAll(templatesDir = TEMPLATES_DIR) {
  const schema = loadSchema();
  const results = listTemplateNames(templatesDir).map((name) => validateTemplateDir(join(templatesDir, name), schema));
  const failures = results.reduce((n, r) => n + r.checks.filter((c) => !c.ok).length, 0);
  return { templates: results.length, failures, results };
}

// ─── Main ─────────────────────────────────────────────────────────────────

export function main(templatesDir = TEMPLATES_DIR) {
  const { templates, failures, results } = validateAll(templatesDir);

  if (templates === 0) {
    console.error("No templates found in templates/ (excluding archive/)");
    return 1;
  }

  for (const r of results) {
    console.log(`\n[${r.name}]`);
    for (const c of r.checks) {
      if (c.ok) process.stdout.write(`  ✓ ${c.label}\n`);
      else process.stderr.write(`  ✗ ${c.label}: ${c.reason}\n`);
    }
  }

  console.log(`\n${"─".repeat(50)}`);
  if (failures === 0) {
    console.log(`✓ All ${templates} template(s) passed validation.`);
    return 0;
  }
  console.error(`✗ ${failures} failure(s) across ${templates} template(s).`);
  return 1;
}

// Run only when executed directly. realpath: an npx bin is a symlink, so argv[1] may not equal this file's path.
const invokedDirectly = (() => {
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();
if (invokedDirectly) process.exit(main(process.argv[2] ? resolve(process.argv[2]) : TEMPLATES_DIR));
