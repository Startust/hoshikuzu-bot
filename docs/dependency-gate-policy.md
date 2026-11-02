# Dependency gate policy

The gate scans every Node lock entry, the complete Python inference lock, the
local-wheel build lock and the upstream VoxCPM commit. Raw OSV JSON, all findings
and extraction coverage remain available. A policy pass can include warnings;
it does **not** mean there are zero known vulnerabilities.

## Blocking and warning findings

Runtime dependencies, build tools, installation hooks, Python dependencies and
upstream source findings block. A Node package version is warning-only when
**every** path to that version starts at a reviewed lint/check-only root. A
shared runtime/build path wins over a check-only path. Unknown roots and orphan
packages do not qualify. Scanner errors, incomplete reports, missing graph
edges or stale review evidence fail closed, even when no advisory is reported.

This is usage classification, not a package-name or advisory exception. There
is no severity threshold or ignore list. All versions of a peer package name
present in the lock are conservatively connected; this can over-block but
avoids losing shared peer usage. Missing peers are recorded as absent: Yarn
Classic does not install undeclared peers automatically. Every required and
optional lock edge must resolve, including non-Windows optional packages.

The reviewed roots are in `scripts/security-policy.json`. ESLint and its
direct config/plugin imports are currently check-only. `typescript` and
`@types/node` remain build dependencies because `tsc` emits application code;
`prisma` generates the runtime client and supports migrations; `tsx` runs the
bot. Prettier remains unknown/blocking because formatting is outside the narrow
check-only policy. The repository source/config review found no runtime or
build imports of the lint roots. The build commands are `tsc` and
`prisma generate`, separate from `eslint .`.

All dependency `preinstall`, `install` and `postinstall` hooks create additional
blocking build roots. A tarball's root `binding.gyp` also creates a blocking
implicit `node-gyp rebuild` hook when no install script is declared. Registry tarball `prepare` is not an installation hook
in the pinned Yarn version; see [Yarn 1.22.22 INSTALL_STAGES](https://github.com/yarnpkg/yarn/blob/v1.22.22/src/package-install-scripts.js).
Git/local package sources and unsupported lock syntax are rejected, rather than
assuming their preparation behavior matches registry tarballs.

## Evidence and maintenance

Yarn Classic does not store peer requirements, so
`scripts/node-package-metadata.json` retains graph-relevant official registry
metadata from integrity-verified tarballs for **all** locked package versions. Each record includes its source
URL and integrity; the gate requires exact identity, integrity, dependency and
optional-dependency agreement with the lock. Metadata must cover exactly the
scanned inventory. The review fetched each exact archive, verified its bytes
against locked integrity, and read its manifest without extracting or executing
it. Explicit empty dependency/peer/lifecycle maps and native-hook/bundle flags
distinguish verified absence from missing evidence. Bundled package archives
are rejected until their nested inventories have separate reviewed coverage.
Exact resolution targets must be locked; path-scoped overrides add conservative
edges to every same-name dependency, rather than narrowing away runtime overlap.

The review snapshot covers the current lock, manifest, metadata, application
source, scripts, tests, configuration and workflows, including new unignored
files. Documentation and the review file itself are excluded. Text hashes
normalize CRLF to LF so Windows and Linux checkouts agree. Adding, deleting or
changing executable inputs invalidates the review. This deliberately requires
a fresh usage review after routine source or dependency changes. It does not
silently reclassify new dependencies from their `devDependencies` label.

This is a reviewed-source/lock contract, not attestation of a live deployment or
arbitrary ignored/generated files. Existing build and installed-closure checks
still matter; runtime imports and build commands were additionally tested with
a guard that rejects loading any classified check-only package.

To update evidence, first review changed entry points, scripts, imports,
generated-code tools and dependency/peer/lifecycle metadata. Verify exact npm
package metadata against locked integrity and edges, and review every direct
root role. Only then update the metadata and `reviewedInputs` hashes (the
`node_usage_policy.reviewed_inputs` helper computes them). Recompute the graph
and inspect every warning's root paths. Do not use a stale snapshot or copy an
old warning result for a new lock/source state.

The existing frozen installation and installed Python closure/provenance checks
remain required. This lock-based Node graph is deliberately conservative;
the Python installed gate continues to require exact inference/build package
sets and verified VoxCPM code, metadata and license.

## Reports and local verification

`summary.json` separates `scannerExit`, `rawScannerStatus`, `gateExit`,
`blockingFindings` and `warningFindings`. `passed-with-warnings` is an exit-zero
policy result with retained vulnerabilities. `summary.md` shows every advisory
and its consumer paths. `dependency-usage.json` contains the complete graph,
root roles and review hashes. `osv.json` remains the unmodified raw scan.

```text
python -m unittest discover -s scripts/tests -v
python scripts/security_scan.py --scanner <verified-osv-scanner>
```

The installed inference/build command remains documented in
`third_party/voxcpm/README.md`. Tests exercise production, build, shared,
optional, peer and installation-hook paths; warning-only and zero-finding
outcomes; unknown/stale/inconsistent evidence; scanner failures; exact coverage
and Python provenance. No hosted CI or deployment was run for this local policy
validation.
