# Dependency audit — 2026-10-23

Historical first-phase report. The [approved isolated Python migration](python-migration-2026-10-23.md) supersedes the candidate status and Python validation limits below; it retains this baseline and first-phase evidence.

At the end of this phase, Node dependencies were clean in the retained OSV scan. The Python candidate had **46 unique advisories in 6 package versions**, and the new security gate correctly failed. No advisory was suppressed.

## Identity and boundaries

- Origin: `https://github.com/Startust/hoshikuzu-bot.git`; validation used an isolated Windows checkout.
- Original checkout: `main` at `1e9826068b465458cb955b3ff61698f898df33f6`. Four modified TTS files and untracked `run-hidden.vbs` were preserved.
- Independent clone: branch `security/dependency-audit-20261023`, separate from the original checkout and live installation.
- Candidate base: remote `main`, `6c83b56296d9d34a665f12f3dac3e168efeda251`. The intervening commit only adds Node `24.22.1` and setup documentation; dependency locks match the original baseline.
- GitHub deployment metadata reports that same commit successful in production at `2026-10-23T00:27:30Z`. This is deployment metadata, not a live health or installed-package inspection.
- Local scheduled task `Hoshikuzu Pronunciation Batch` remains Ready and points to the original checkout's `local-tts/scripts/run-hidden.vbs`.
- The original Python 3.11.9 environment, global Node 24.21.0, task configuration, credentials and live data were not modified. Tests used a workspace-only Node 24.22.1 distribution, an isolated Python helper environment, fixtures and mocks. No bot login, model download, live batch, migration, push, PR, release or deployment was performed.
- No repository/ancestor `AGENTS.md`, repository `.agents` or applicable repository skill was found. Available user `.agents/skills` were unrelated frontend/design skills. Local Codex memories were not updated.

## Baseline and result

OSV-Scanner **2.7.0** was downloaded from its official release and SHA-256 verified. Scans request every package and advisory, without severity filters, ignore rules or call-analysis suppression. Advisory aliases are unioned before counting; repeated package/version occurrences are reported separately.

| Scope                                        | Baseline package versions | Baseline affected versions | Unique baseline advisories | Candidate package versions | Candidate unique advisories |
| -------------------------------------------- | ------------------------: | -------------------------: | -------------------------: | -------------------------: | --------------------------: |
| Bot runtime, including `tsx` used by `start` |                       101 |                          3 |                         28 |                         96 |                           0 |
| Node build/dev                               |                       179 |                         16 |                         69 |                        229 |                           0 |
| Optional other-platform runtime packages     |                        31 |                          0 |                          0 |                         31 |                           0 |
| TTS runtime                                  |                       147 |                         15 |                         82 |                        147 |                          45 |
| Python installer/build tools                 |                         3 |                          2 |                          8 |                          3 |                           1 |
| Total                                        |                   **461** |                     **36** |                    **187** |                    **506** |                      **46** |

Baseline: 206 distinct affected-package/advisory pairs. Candidate: 46 pairs in 6 package versions. All 356 candidate Node lock entries have zero OSV findings. The 150 Python entries are a **candidate lock**, not an assertion that the live installation was upgraded.

The initial attempt to resolve unpinned requirements failed on CUDA local versions; that error log is retained. The complete baseline instead uses exact installed Python metadata, obtained without loading the TTS module. `torch`, `torchaudio` and `torchvision` versions ending in `+cu128` are explicitly mapped to their upstream version for advisory lookup; their actual build versions are retained separately. This does not audit bundled CUDA/native components.

## Compatible changes

- Prisma client, MariaDB adapter and CLI stay on major 7, now `7.10.1`; MariaDB moves from `3.4.5` to `3.5.4`. Transitive build/dev dependencies were refreshed within declared ranges.
- Direct/Cheerio Undici stays on major 7 (`7.29.1`). Discord's separately pinned major 6 copy is patched to `6.28.1`; its REST dependency resolves a clean major 6 version. Existing unrelated resolutions are retained.
- Yarn version is recorded as `1.22.22`; `test`, `typecheck` and `build` scripts are added. Node remains the existing remote-main requirement, `24.22.1`.
- Python patch candidates: aiohttp `3.14.4`, anyio `4.14.2`, brotli `1.2.1`, certifi `2026.10.19`, hydra-core `1.3.7`, msgpack `1.2.1`, multidict `6.9.1`, Pillow `12.3.0`, pip `26.2`, python-dotenv `1.2.2`, setuptools `78.1.1`, starlette `1.3.1`, urllib3 `2.8.0`, and aiohttp-required yarl `1.25.1`.
- The complete Windows/Python 3.11 lock is now retained. Setup consumes it, preserves the existing CUDA 12.8 versions, and runs `pip check`. The setup script itself was not run against the live environment.

## Decisions required before further remediation

| Candidate package     | Remaining unique advisories | Fixed version needed | Compatibility decision                                                                                                                                                          |
| --------------------- | --------------------------: | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `datasets 3.6.0`      |                           1 | `5.0.1+`             | VoxCPM `2.0.3` requires `datasets>=3,<4`; requires upstream support, a reviewed fork or replacement of that dependency path. Do not force an incompatible override.             |
| `fsspec 2025.3.0`     |                           1 | `2026.6.0+`          | datasets `3.6.0` requires `fsspec<=2025.3.0`; address with the datasets migration.                                                                                              |
| `Pillow 12.3.0`       |                          39 | `13.0.0+`            | Gradio `6.17.3` requires `Pillow<13`; migration or a reviewed removal of the unused UI dependency path is needed.                                                               |
| `torch 2.11.0+cu128`  |                           1 | upstream `2.13.0+`   | Upgrade the matched CUDA/PyTorch/torchvision/torchaudio set together and validate actual GPU inference in a separate approved stage. torchvision currently pins torch `2.11.0`. |
| `setuptools 78.1.1`   |                           1 | `83.0.0+`            | Current torch declares `setuptools<82`; address with the GPU stack migration.                                                                                                   |
| `cryptography 48.0.1` |                           3 | `50.0.0+`            | Crosses two major versions; review removed APIs and the Aliyun/OSS dependency path before changing it. No claim of a hard resolver conflict here.                               |

The exact IDs, aliases, severity and affected/fixed ranges are retained in the raw OSV reports and complete findings tables. A dependency finding does not by itself prove exploitation through this bot; no reachability assertion is used to hide it.

## Verification

- Frozen baseline installation (scripts disabled), Prisma generation using a dummy unreachable DB URL, TypeScript and lint: passed.
- Candidate installation, Prisma generation, TypeScript, build and lint: passed. Node tests: **6 passed**, including mocked pagination/Unicode/medal parsing, HTTP failure and blocked network access, ID-based rename/transfer detection, Discord component serialization, separate Undici 6 fetch, and MariaDB adapter SQL parameter binding with a fake pool.
- Python helper tests: **5 passed**, including multilingual preprocessing, deterministic filenames/URLs, normalization and real WAV round-trip using a fake model, parameterized SQL using fake cursors, mocked upload commands, and transient GPU-error abort handling using a fake connection/model.
- Gate tests: **5 passed**, covering exact inventory coverage, malformed/empty output, advisory retention, manifest drift/unpinned packages, and scanner failure. The real final gate returns **1** for the retained Python vulnerabilities.
- Python full lock resolution and exact closure recheck: passed using uv `0.11.19` for Windows/Python 3.11. Only eight helper-test dependency packages were installed in the isolated environment; the complete GPU stack was not installed or inference-tested.
- GitHub workflow passes actionlint `1.7.12`; the PowerShell setup script parses successfully. Frozen installation preserves the final lockfile. Hosted Actions execution has not occurred because publication is not authorized.

## CI and reproduction

`.github/workflows/security.yml` covers pull requests, all pushes, manual dispatch and weekly scheduled scans. Actions are pinned by commit, permissions are read-only, and checkout credentials are not persisted. The scan includes all Node lock entries and every Python lock entry, including tools. Scanner/download failures, manifest drift, missing sources, empty results and package omissions fail the job. Full JSON, logs, normalized input, hashes, coverage and a Markdown summary are uploaded even when findings fail the job. This does not enable branch protection or change repository settings.

```powershell
# Run from the isolated checkout, with Node 24.22.1 and Yarn 1.22.22.
yarn install --frozen-lockfile --ignore-scripts --non-interactive
$env:DATABASE_URL = 'mysql://audit:audit@127.0.0.1:1/audit'
yarn prisma:generate
yarn typecheck
yarn build
yarn lint
yarn test
python -m unittest discover -s local-tts/tests -v
python -m unittest discover -s scripts/tests -v
python scripts/security_scan.py --scanner <verified-osv-scanner-path>
```

The local evidence packet is in the sibling `../evidence/` directory, including full baseline and candidate OSV JSON, installed Python metadata, original manifests, dependency classifications, resolution logs, test logs and deployment metadata. `security-reports/` is ignored so repeated local scans do not pollute source changes.

Coverage limits: no live service, database, S3, Discord, model weights, GPU inference, OS packages or bundled native-library audit. The live environment retains its original findings until an approved deployment/migration changes it. Memory handling: **none**; no Codex memory files were modified.
