# Inference-only dependency audit - 2026-10-23

This is the retained local-validation snapshot before publication. Hosted CI
results must be checked separately on the pull request's current commit.

## Publication follow-up

The first [hosted scan](https://github.com/Startust/hoshikuzu-bot/actions/runs/40033663819)
correctly failed on newly indexed
[GHSA-v4x8-3wr5-3wq8](https://github.com/advisories/GHSA-v4x8-3wr5-3wq8)
in filelock 3.29.0. The affected range ends at 4.2.0. The inference lock now
uses official 4.2.4, accepted by every installed dependent's declared constraints.
The 4.0 protocol change concerns SoftReadWriteLock; the actual inference
dependencies use ordinary FileLock wrappers. No shared live lock/cache directory
was used or migrated.

The isolated 117-package installation passes `pip check`, all eight application/API
tests (including cross-process exclusion and release through Hugging Face,
ModelScope and PyTorch lock wrappers), all ten gate tests and all 19 runtime/GPU
checks. All three synthetic waveforms match the preceding validated environment
byte for byte. The refreshed 482-entry scan again has zero known advisories.

The unchanged, separately retained 149-package optional-extras profile now has
**44 unique advisories in four package versions**: Pillow 12.3.0 has 41,
datasets 3.6.0 one, fsspec 2025.3.0 one, and filelock 3.29.0 one. The two new
Pillow records are GHSA-5x8w-8jj5-q52h and GHSA-654x-cwwv-5j9c; inference already
uses their fixed Pillow 13.0.0. This extras profile remains uninstalled and
unapproved. The 41-advisory result below is the earlier retained snapshot.

The [next hosted scan](https://github.com/Startust/hoshikuzu-bot/actions/runs/40034289455)
captured three more newly indexed Undici advisories, represented by five
package/advisory pairs across its two installed versions:
GHSA-4qv8-2p9j-2685, GHSA-xjj6-f33q-929c and GHSA-f72v-6w45-q472.
Discord's separate major-6 copy is now 6.29.1; direct/Cheerio major 7 is now
7.30.1. These are upstream fixes within the existing major versions. Prisma
generation against a dummy unreachable DB URL, typecheck, build, lint and all
six offline Node tests pass again. Failed hosted reports remain available on
their original runs; no advisory was ignored to make the gate pass.
Deduplicating the major-6 entries leaves 355 distinct Node package versions.
The latest complete local scan covers **481 profile entries** (355 Node, 117
installed inference and nine installed build tools), with zero known advisories.

## Original local-validation snapshot

The approved local VoxCPM packaging split is built, installed and verified. The
production-candidate profiles have **zero known OSV advisories** across 356 Node
lock entries, 117 actually installed Python inference packages and nine actually
installed local-package build tools. The retained scans cover 482 profile entries;
shared packages appear in more than one profile. The unchanged upstream source
commit query also returned no known advisories. This applies to the isolated
candidate only; the live bot and TTS installation have not been upgraded.

Historical evidence remains intact: [original baseline and compatible phase](security-audit-2026-10-23.md)
and [the installed Python/GPU migration](python-migration-2026-10-23.md). The original
baseline had 187 unique advisories; the previous candidate had 41. This stage both
changes the installed dependency closure and patches the remaining required
libraries; it is not an advisory-ignore or severity-filter change.

## What changed

The official source base is OpenBMB/VoxCPM tag `2.0.3`, commit
`19b6bf7590025418821a86dcb817504e0ad7e5df`. The sibling local checkout is on
`security/inference-extras-20261023`. Its source-tree diff is exactly one file,
`pyproject.toml`, with three deletions and three additions: datasets becomes an
optional training dependency; Gradio and spaces become optional Web UI
dependencies. No inference, training or UI implementation code was modified.

The resulting package is `voxcpm==2.0.3+hoshikuzu.1`. All 34 packaged source files
match both the official Git base and the hash-pinned PyPI source distribution.
The Apache-2.0 license is preserved. Two Windows/Python 3.11 builds produced the
same wheel hash. The installed package's source, metadata and license hashes
also match that reviewed wheel.

| Artifact                     | SHA-256                                                            |
| ---------------------------- | ------------------------------------------------------------------ |
| Official source distribution | `db11caa8b24eb91ba94190f3707b06dbca82bb6b6911c04eccd12bde5b59086f` |
| Local dependency patch       | `19a37cabbbb80842315bff46749b074520ea2602cacb3dabaaf43ee1f76791c9` |
| Local wheel                  | `236d351877c6470b15f6cde04675ef12945e48a8583a10e152e164f9f530341d` |

The actual inference environment contains 117 distributions, compared with 150
in the preceding environment: 33 packages are no longer installed. In particular,
datasets, Gradio and spaces are absent. Pillow remains installed and moves from
12.3.0 to **13.0.0**; fsspec remains installed and moves from 2025.3.0 to
**2026.9.0**. The full installed inventory equals the complete runtime lock.
Cryptography 50.0.2, PyTorch 2.14.1+cu130, TorchAudio 2.11.0+cu130,
TorchCodec 0.17.0+cu130 and setuptools 84.2.1 remain from the tested migration.
Torchvision was a transitive dependency of the removed UI path; it is not part of
the actual inference closure or the current CUDA regression test.

## Findings and scope

| Profile                                          | Entries | Affected versions | Unique advisories |
| ------------------------------------------------ | ------: | ----------------: | ----------------: |
| Node runtime, including operational tsx          |      96 |                 0 |                 0 |
| Node build/dev                                   |     229 |                 0 |                 0 |
| Node optional other-platform runtime             |      31 |                 0 |                 0 |
| Python inference runtime                         |     114 |                 0 |                 0 |
| Python inference installer tools                 |       3 |                 0 |                 0 |
| Isolated local-package build tools               |       9 |                 0 |                 0 |
| Separately resolved optional training/UI profile |     149 |                 3 |            **41** |

The optional combined-extras profile is **not production-approved**. Its full
OSV report still contains 39 Pillow 12.3.0 advisories, one datasets 3.6.0 advisory
and one fsspec 2025.3.0 advisory. It was resolved and scanned separately, without
installation or execution. These findings are retained with IDs, aliases,
severity and affected/fixed ranges. They are not covered by the inference
profile's zero-advisory result. Enabling extras requires a new reviewed lock and
separate environment.

No advisory is ignored, severity-filtered or suppressed based on inferred
reachability. CUDA local versions map to public upstream release versions for
OSV matching. The verified packaging-only VoxCPM variant maps to upstream 2.0.3,
with a separate commit query; it is not silently skipped as an unknown package.

## Verification

- Installed inference and builder package/version sets exactly match their locks;
  `pip check` passes. Package source, wheel metadata, license and patch hashes pass.
- **19 runtime checks pass** in the new inference-only environment, including
  imports, real Aliyun SDK fixture-key signing and verification, AES-GCM round-trip,
  Pillow/fsspec fixture I/O, inference API/provenance, CUDA matrix multiplication,
  CUDA resampling and TorchCodec WAV decoding.
- Real VoxCPM2 GPU synthesis and reference-audio synthesis pass using only the six
  previously verified local model-data files and synthetic input. The two baseline
  utterances are retained for waveform regression comparison. An additional
  reference-conditioned utterance with `normalize=True` also passes, covering the
  normalization path used when creating the application's reference voice.
  The first two outputs have 115,200 and 61,440 samples at 48 kHz (2.40 and 1.28
  seconds). No Python socket connection attempt was recorded.
- **Seven offline application/API tests pass**, including two new tests for
  optional dependency markers/absence and the preserved synthesis/reference API.
  Database, uploads and the application batch-control test use isolated fixtures
  and mocks; the actual batch entrypoint was not launched against live services.
- **Ten fail-closed scanner/build tests pass**, including extra/missing installed
  packages, source tampering, provenance mismatch, unknown local versions,
  incomplete reports and rejection of a corrupt source archive even under
  Python optimization.
- Node Prisma generation with a dummy unreachable database URL, typecheck, build,
  lint and all **six offline Node regression tests pass**. No database connection
  or bot login occurred.
- Actionlint and PowerShell syntax checks pass. Hosted Actions had not run at this
  local-validation checkpoint. The new Windows CI job builds the pinned local
  wheel, installs complete fresh environments, verifies installed inventories and
  scans them; the Linux job separately scans all locked profiles and provenance.
  PR, push, manual and weekly triggers remain enabled in the prepared workflow,
  with full reports and hashes retained on failure. Hosted jobs do not claim GPU
  inference coverage.

Two initial filesystem tests failed because the restricted sandbox denied atomic
renames in its temporary directories: setuptools metadata replacement and the
fixture WAV replacement. Approved reruns outside that sandbox passed without
disabling tests or changing the application. The first package-integrity probe
also detected a metadata hash mismatch caused by text newline conversion; it was
corrected to hash raw installed bytes. All failed logs remain in the evidence.
There was no automatic-review denial or unresolved local-validation blocker at
this checkpoint.

## Installation, maintenance and limits

[Local package instructions](../third_party/voxcpm/README.md) contain reproducible
build/install commands, exact provenance, maintenance responsibilities and the
conditions for retiring this patch. The setup script requires fresh environments
to prevent leftover vulnerable packages. Both inference and build tool locks are
complete and scanned. No setup script was run against the live installation.

GPU checks used the existing RTX 5080 / driver 616.92 and task-local FFmpeg 9.0.2
shared libraries, whose ZIP hash matches the published release digest. System
PATH, CUDA, drivers, security settings and the scheduled task were unchanged.
FFmpeg provisioning for an eventual runtime remains explicit; a Python lock
does not install or security-audit native FFmpeg/CUDA/OS libraries.

Validation covers the current non-optimized, denoiser-disabled VoxCPM2 inference
path, synthetic reference conditioning and normalization. Optional denoising,
compiled inference, training/UI, LoRA weight loading, subjective pronunciation
quality and complete production integrations were not runtime-validated. No
unrecognized model code was downloaded or executed, and no model weights were
downloaded.

At this local-validation checkpoint, the original checkout remained at
`1e9826068b465458cb955b3ff61698f898df33f6`, with
the five original user files' hashes unchanged. All 150 live Python package
versions remain at their original baseline. The scheduled task still points to
the original checkout. The bot candidate was based on
`6c83b56296d9d34a665f12f3dac3e168efeda251` on
`security/dependency-audit-20261023`. No remote fork, push, PR, merge, release,
deployment, production credential/data access, external message or upload occurred.
Codex memories were not modified.

Complete current evidence is in sibling `../evidence/inference-split/`, alongside
all historical reports. It includes exact installed inventories, raw scans,
the optional-profile findings, wheel/source/patch provenance, synthetic audio,
reproducible-build logs, regression results and preservation checks.
