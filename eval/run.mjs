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
 * Run: node eval/run.mjs
 */

import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const TEMPLATES_DIR = join(REPO_ROOT, "templates");
const SCHEMA_PATH = join(__dirname, "schema", "template.schema.json");

// ─── Helpers ────────────────────────────────────────────────────────────────

function pass(label) {
  process.stdout.write(`  ✓ ${label}\n`);
}

function fail(label, reason) {
  process.stderr.write(`  ✗ ${label}: ${reason}\n`);
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

// ─── Minimal JSON Schema validator (no external deps) ───────────────────────
// Validates required fields, types, enum values, and patterns.
// Not a full ajv — handles the subset our schema actually uses.

function validateSchema(data, schema, path = "#") {
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

function checkTrustInvariants(tmpl) {
  const errors = [];
  const trust = tmpl.trustEnvelope;

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
  }

  // Invariant 5: notes must explain any widened permissions
  if (trust.allowNetworkEgress && (!trust.notes || trust.notes.length < 20)) {
    errors.push("Network egress is enabled — trustEnvelope.notes must explain why (>= 20 chars)");
  }

  return errors;
}

// ─── Runtime-specific checks ─────────────────────────────────────────────────

function checkRuntimeSpecific(tmpl, templateDir) {
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

// ─── Main ─────────────────────────────────────────────────────────────────

const schema = loadJson(SCHEMA_PATH);
let totalTemplates = 0;
let totalFailures = 0;

const entries = readdirSync(TEMPLATES_DIR).filter(
  (name) => name !== "archive" && statSync(join(TEMPLATES_DIR, name)).isDirectory()
);

if (entries.length === 0) {
  console.error("No templates found in templates/ (excluding archive/)");
  process.exit(1);
}

for (const name of entries) {
  const templateDir = join(TEMPLATES_DIR, name);
  const templatePath = join(templateDir, "template.json");

  console.log(`\n[${name}]`);
  totalTemplates++;

  // 0. template.json must exist
  if (!existsSync(templatePath)) {
    fail("template.json present", "file not found");
    totalFailures++;
    continue;
  }

  let tmpl;
  try {
    tmpl = loadJson(templatePath);
  } catch (e) {
    fail("template.json parseable", `invalid JSON: ${e.message}`);
    totalFailures++;
    continue;
  }
  pass("template.json parseable");

  // 1. id matches directory name
  if (tmpl.id !== name) {
    fail("id matches directory", `template.json id="${tmpl.id}" but directory="${name}"`);
    totalFailures++;
  } else {
    pass("id matches directory");
  }

  // 2. JSON Schema validation
  const schemaErrors = validateSchema(tmpl, schema);
  if (schemaErrors.length > 0) {
    for (const e of schemaErrors) fail("schema", e);
    totalFailures += schemaErrors.length;
  } else {
    pass("schema valid");
  }

  // 3. Trust invariants
  const trustErrors = checkTrustInvariants(tmpl);
  if (trustErrors.length > 0) {
    for (const e of trustErrors) fail("trust invariant", e);
    totalFailures += trustErrors.length;
  } else {
    pass("trust invariants pass");
  }

  // 4. Status check — only active templates are expected to pass
  if (tmpl.status !== "active") {
    fail("status", `template status="${tmpl.status}" — only active templates are validated (move to archive/ if deprecated)`);
    totalFailures++;
  } else {
    pass("status=active");
  }

  // 5. README.md present
  const readmePath = join(templateDir, "README.md");
  if (!existsSync(readmePath)) {
    fail("README.md present", "file not found");
    totalFailures++;
  } else {
    pass("README.md present");
  }

  // 6. Runtime-specific checks
  const runtimeErrors = checkRuntimeSpecific(tmpl, templateDir);
  if (runtimeErrors.length > 0) {
    for (const e of runtimeErrors) fail("runtime-specific", e);
    totalFailures += runtimeErrors.length;
  } else {
    pass(`runtime-specific checks (${tmpl.runtime})`);
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
if (totalFailures === 0) {
  console.log(`✓ All ${totalTemplates} template(s) passed validation.`);
  process.exit(0);
} else {
  console.error(`✗ ${totalFailures} failure(s) across ${totalTemplates} template(s).`);
  process.exit(1);
}
