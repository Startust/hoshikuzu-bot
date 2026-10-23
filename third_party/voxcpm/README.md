# Local VoxCPM inference package

This is a local, packaging-only maintenance variant of OpenBMB VoxCPM 2.0.3,
versioned **2.0.3+hoshikuzu.1**. It is not an upstream release. The Apache-2.0
[LICENSE](LICENSE), upstream authorship and all 34 package source files are
preserved unchanged. The modified `pyproject.toml` carries a local-change notice.

- Upstream: <https://github.com/OpenBMB/VoxCPM>, tag `2.0.3`, commit
  `19b6bf7590025418821a86dcb817504e0ad7e5df`.
- Local maintenance checkout: sibling `VoxCPM-inference`, branch
  `security/inference-extras-20261023`; its only source-tree change is
  `pyproject.toml` (three removed lines, three added lines).
- Patch SHA-256: `19a37cabbbb80842315bff46749b074520ea2602cacb3dabaaf43ee1f76791c9`.
- Wheel SHA-256: `236d351877c6470b15f6cde04675ef12945e48a8583a10e152e164f9f530341d`.

The patch moves `datasets>=3,<4` into the `training` extra, and `gradio>=6,<7`
plus `spaces` into the `webui` extra. All other requirements stay unchanged.
The complete production inference lock installs neither extra. Pillow and fsspec
remain real inference dependencies and are upgraded to 13.0.0 and 2026.9.0.

**Training and Web UI extras remain unsafe for production.** A separately
resolved 149-package combined-extras profile still has 41 unique OSV advisories:
39 in Pillow 12.3.0, one in datasets 3.6.0, and one in fsspec 2025.3.0. That profile
was scanned but not installed or functionally validated. Selecting extras against
the production lock requires a new dependency review and separate environment;
do not force overrides or install them into the inference environment.

## Reproducible build and installation

The validated target is Windows x64 / Python 3.11. The build uses nine pinned
tools in `build-requirements-lock.txt`, a SHA-256-pinned official PyPI sdist,
the exact patch, a fixed local version and canonical ZIP headers. Repeated builds
on this target produced identical wheel hashes. Cross-platform wheel byte
reproducibility has not been claimed.

```powershell
# From a fresh isolated repository checkout, using Python 3.11.
python -m venv .build-voxcpm
.\.build-voxcpm\Scripts\python.exe -m pip install -r third_party/voxcpm/build-requirements-lock.txt
.\.build-voxcpm\Scripts\python.exe third_party/voxcpm/build_local.py --output .wheelhouse --cache .voxcpm-source-cache
python -m venv .inference-venv
.\.inference-venv\Scripts\python.exe -m pip install .wheelhouse/voxcpm-2.0.3+hoshikuzu.1-py3-none-any.whl -r local-tts/requirements-lock.txt --extra-index-url https://download.pytorch.org/whl/cu130
.\.inference-venv\Scripts\python.exe -m pip check
.\.inference-venv\Scripts\python.exe scripts/security_scan.py --scanner <verified-osv-scanner> --installed-python .inference-venv/Scripts/python.exe --installed-build-python .build-voxcpm/Scripts/python.exe
```

The builder rejects source, patch, license or artifact hash mismatches. It checks
every source file against the official Git-tag hashes, then checks the wheel has
exactly those source files. `upstream.json` records all provenance and the reviewed
wheel metadata hash. `.gitattributes` keeps hash-sensitive text files in LF form.
Use a fresh environment: ordinary `pip install` over an old environment can retain
unused vulnerable packages. `local-tts/scripts/setup.ps1` therefore refuses to
modify existing runtime or build environments. Neither setup nor the application
batch was run against the live installation.

The OSV gate compares installed distributions exactly with both locks, checks the
installed local package's code/metadata/license hashes, scans every dependency,
maps the unchanged package code to upstream 2.0.3 and additionally queries the
upstream Git commit. Missing packages, unexpected packages, unreviewed local
versions, incomplete reports and network/scanner errors fail the gate. A clean
OSV result does not constitute a general audit of the upstream code.

## Maintenance and retirement

1. On a proposed upstream update, fetch and inspect its official tag/release and
   packaging changes. Keep this exact base and patch until the replacement is
   reviewed; no automatic floating Git dependency is used.
2. Determine whether upstream supports inference-only installation, or whether
   its default dependency closure is now fully patched. If a local patch remains
   necessary, rebase only the dependency split and review every additional change.
3. Recreate the source/tag/wheel provenance, preserve license notices, update the
   local version and build/runtime locks, and rebuild twice. A changed artifact
   hash requires review; do not change a hash simply to silence a failed check.
4. Run installed-closure scans, API and offline application tests, Node regression,
   and synthetic GPU/reference/text-normalization regression before promotion.
   Review optional extras separately; the default profile's clean result does not
   cover those extras.
5. Retire this patch when an official package meets the same dependency and
   inference checks. Replace the local pin with that official release, regenerate
   the full lock and repeat validation before removing the local builder and
   provenance mapping. Keep the historical reports and license attribution.

The patch is maintained in this repository; no separate remote fork is required.
Ongoing upstream tracking is a maintenance obligation, not a newly scheduled
automation. Building or reviewing this package does not deploy it.
