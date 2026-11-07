# Contributing to GPT2DSH

GPT2DSH retains the upstream plugin's engineering conventions below. Read [UPSTREAM.md](../UPSTREAM.md), [third-party notices](../THIRD_PARTY_NOTICES.md) and [privacy rules](PRIVACY.md) before contributing. Use synthetic fixtures only. Installation and project links are in the root README; inherited general-tool documentation may still use the compatible `dsh-chat-import` identifier. This fork does not publish to the upstream npm package.

Thanks for considering a contribution. `dsh-chat-import` imports conversation
history from other agents into DeepSeek Harness as full-fidelity, resumable
sessions. The user-facing contract lives in [README.md](../README.md) and its
Chinese counterpart; the engineering rules — layout, commit discipline, DSH
plugin constraints, quality conventions — live in [AGENTS.md](../AGENTS.md).

## Dev setup

- **Node.js >= 22.13**, the first release where `node:sqlite` works without a flag
- Use **npm 11.12.1** when updating `package-lock.json`; CI pins the same version.
  Harness integration tests run on Node.js 24 because the current host CLI requires it.
- `npm ci` installs document parsing libraries, development dependencies and host peers.
- `npm test` runs the `node:test` suite: converter unit tests, export unit tests,
  and host-mock integration tests
- `npm run check:linux` is the cross-platform path-discipline guard, also enforced
  in CI
- `npm run lint` runs eslint with the flat config
- `npm run build` is the publish-surface self-check: files whitelist, syntax, and
  lockfile version

## What counts as a change

- **Behavior changes stay honest.** The two READMEs must stay in sync (CI compares
  their heading structure). Tests describe the behavior. Any file newly reached
  from `index.mjs`, or referenced by a README, has to join the `files` whitelist in
  `package.json`.
- **Plugin, not engine.** New behavior goes through public dsh host services
  (`sessionPersistence` / `fs` / `tools` / `workspaceRegistry`, optionally
  `webServer` / `commands`). Never modify the dsh engine, apiproxy, or the
  official UI packages.
- **Imported session logs are append-only.** Never rewrite history events; surface
  events carry `surfaceOp: 'append'`.
- **Fail loudly.** Malformed lines and suspected secrets are counted and reported,
  never silently swallowed.

## CHANGELOG

Release notes are taken verbatim from the matching CHANGELOG section, so that
section **is** the release note. Write it for users, not as a summary of the diff.
Since 0.19.0 every section follows the dsh release-note layout: a
`[中文](#cn-x.y.z) | [English](#en-x.y.z)` switch line, then an
`<h3 id="cn-x.y.z">新增功能</h3>` block in Chinese, then an
`<h3 id="en-x.y.z">New Features</h3>` block in English. Within each language the
groups come in this order: `### 体验优化` / `### 问题修复` / `### 其他变更`
(English: `### Improvements` / `### Bug Fixes` / `### Chores`). Empty groups are
omitted as a whole, and the section ends with
`**Full Changelog**: [v-prev...v-this](compare url)`.

One bullet covers one verifiable behavior or contract, not the implementation
journey. Call out contract changes explicitly: tool names, output schema, whether a
source is still supported. Performance work should carry measured numbers, and
user-facing behavior changes should be reflected in the READMEs. Anchor ids carry
the version so several sections can share one page.

## Releases

GPT2DSH distributes source builds and does not publish to the upstream npm
namespace. `package.json` has `private: true` to enforce this boundary.
The manual **build-plugin** workflow in `.github/workflows/release.yml` runs
tests, lint, the leak scan and build checks, then uploads an installable `.tgz`
as a GitHub Actions artifact. It does not publish to npm or create a release.
Only files declared in the package allowlist are packed; private backups,
local configuration and the `dev/` directory must never be included.

## Commits & PRs

- Use conventional commits (`feat:` / `fix:` / `refactor:` / `chore:` / `docs:` /
  `test:`), one logical change per commit. The existing history uses Chinese
  descriptions.
- Before pushing, `npm test` and `npm run check:linux` must pass and the working
  tree must be clean: nothing from `dev/` or `node_modules/`, no snapshots staged.
  Also run `git diff --cached --check`.
- Fork, branch as `feature/<name>`, then open a PR (a template is included). The
  repo pushes straight to `main`; please don't rewrite published history.
- PRs are welcome for new import sources, fidelity upgrades, and the items on
  [ROADMAP.md](ROADMAP.md).

## Security & privacy

Never commit credentials, real user transcripts, or anything under `dev/` (the
local engineering surface, which is gitignored). In issues and PRs, use
**synthetic** fixtures only, with no real conversation content.

