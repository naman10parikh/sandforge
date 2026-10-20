# devcontainer-default — Dev Environment Template

**Version:** 1.0.0  
**Runtime:** devcontainer (Docker, VSCode, Codespaces)  
**Trust level:** Local dev (network to known registries, workspace mount allowed)

## What this is

The default Energy devcontainer for local harness development and CI. Zero cost with local Docker,
~$0.18/hr on GitHub Codespaces (2-core). Use this template when:

- A developer (or agent) needs a reproducible local dev environment for an Energy harness
- CI needs a consistent build container
- A team member wants to open the repo in VSCode Dev Containers or Codespaces

## Trust envelope

| Property | Value |
|---|---|
| Network egress | **Allowed** to: npmjs.org, pypi.org, github.com, api.anthropic.com |
| Host mounts | Workspace folder (read-write) |
| Secret injection | Via `.env` file (gitignored) — `ANTHROPIC_API_KEY`, `E2B_API_KEY` |
| Dropped caps | NET_ADMIN, SYS_ADMIN |

> **Note:** This template is for developer environments, not for running untrusted LLM-generated code.
> For that, use `e2b-default`.

## Usage

### VSCode Dev Containers

1. Install the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
2. Copy `devcontainer.json` to your repo's `.devcontainer/devcontainer.json`
3. Open Command Palette → "Dev Containers: Reopen in Container"

### GitHub Codespaces

1. Copy `devcontainer.json` to your repo's `.devcontainer/devcontainer.json`
2. Click "Code" → "Open with Codespaces" on GitHub

### CI (GitHub Actions)

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    container:
      image: mcr.microsoft.com/devcontainers/typescript-node:1-22
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - run: pnpm build
```

## Validation

```bash
# From repo root
node eval/run.mjs
# Expect: ✓ devcontainer-default: schema valid | trust invariants pass | devcontainer.json present
```

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-06-03 | Initial template — local dev envelope |
