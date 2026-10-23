# Isolated Python migration - 2026-10-23

Historical migration report. The approved [inference-only package audit](inference-package-audit-2026-10-23.md) supersedes its candidate status; these results and limitations remain as evidence for this phase.

The approved isolated migration is installed and functionally tested. The full OSV scan covers **506 package versions**: 356 Node entries with no findings, and 150 Python entries with **41 unique advisories in three packages**. The security gate fails with exit 1 for those findings. This is a verified local candidate, not a live upgrade or a security-clean release.

The [first-phase audit](security-audit-2026-10-23.md) retains the original 187-advisory baseline and the compatible phase's 46-advisory result. This document supersedes its candidate status and Python validation limits; historical evidence is preserved.

## Installed changes

| Dependency   | Previous candidate | Installed and locked candidate |
| ------------ | ------------------ | ------------------------------ |
| cryptography | 48.0.1             | 50.0.2                         |
| PyTorch      | 2.11.0+cu128       | 2.14.1+cu130                   |
| torchvision  | 0.26.0+cu128       | 0.29.1+cu130                   |
| torchaudio   | 2.11.0+cu128       | 2.11.0+cu130                   |
| TorchCodec   | 0.14.0             | 0.17.0+cu130                   |
| setuptools   | 78.1.1             | 84.2.1                         |

All 150 packages were installed into `../tools/python-migration` using Python 3.11.9. The installed package/version inventory exactly equals `local-tts/requirements-lock.txt`, and `pip check` passes. No dependency constraint was overridden and no required feature was removed. Node fixes and their previously passing typecheck, build, lint and six offline tests remain unchanged.

This follows the official [TorchAudio stable ABI policy](https://docs.pytorch.org/audio/stable/installation.html): TorchAudio 2.11 supports PyTorch 2.11 and later, so matching minor version numbers are no longer necessary. The selected torchvision declares torch >=2.14.0. [TorchCodec 0.17](https://github.com/meta-pytorch/torchcodec) also supports the stable ABI and FFmpeg 9. The official CUDA 13.0 wheel index supplies all four CUDA builds.

CUDA 13 needs an NVIDIA driver of at least 580 under [NVIDIA's compatibility policy](https://docs.nvidia.com/deploy/cuda-compatibility/minor-version-compatibility.html). The validation host has an RTX 5080 and driver 616.92; no driver or system CUDA change was needed or made.

## Runtime validation

The retained full-environment validator completed **21/21 checks**:

- cryptography 50.0.2 / OpenSSL 4.0.3: real Aliyun SDK RSA-SHA256 signing with a newly generated fixture key, independent signature verification, AES-GCM round-trip and OSS SDK import. No service call or production key was used.
- Imports of 17 runtime modules, including VoxCPM, Gradio, datasets, fsspec, FunASR, ModelScope, PyTorch, TorchAudio, torchvision and TorchCodec.
- CUDA matrix multiplication against a CPU reference, torchvision CUDA NMS and TorchAudio CUDA resampling.
- TorchCodec-backed `torchaudio.load` of a locally generated WAV fixture.
- Actual VoxCPM2 GPU synthesis of synthetic English text: 115,200 finite, non-silent samples at 48 kHz (2.40 seconds). A second synthesis used only this newly generated audio as its reference and produced 61,440 samples (1.28 seconds). Peak GPU allocation was 5,862,011,392 bytes. The model check took 30 seconds.

The validator does not import the application's batch entrypoint. It clears service-related environment variables, enables offline modes, isolates model caches and blocks Python socket `connect`; **zero connection attempts** were recorded. This is process-level instrumentation, not an OS firewall or proof about every possible native network API.

Only six existing model data files were copied into the workspace after matching the official `openbmb/VoxCPM2` revision `32279effe8c19989596f05d353d1447f51d9e915` through LFS SHA-256 or Git blob hashes. No model Python code was copied, downloaded or executed. The reviewed official VoxCPM wheel uses built-in `LlamaTokenizerFast`, safetensors and `torch.load(weights_only=True)` for these files. Denoising and optimization were disabled. No model weights were downloaded.

The first runtime check exposed missing FFmpeg shared DLLs: the existing FFmpeg 8.0.1 executable is a static build. Those two failed checks and their logs are retained. A workspace-only [Gyan FFmpeg 9.0.2 shared build](https://github.com/GyanD/codexffmpeg/releases/tag/9.0.2), linked by the [official FFmpeg download page](https://ffmpeg.org/download.html), fixed the audio decoding path. Its ZIP hash matches the digest published on the GitHub release asset; the SHA-256 is `8d31e162f1616e37aab3fa2db991b97e1b8dbeb1c8465fd81a81be16ff91b328`. The validator uses `os.add_dll_directory` and a process-only PATH; system PATH and the live installation are unchanged. A future deployment must explicitly provision shared libraries for the actual runtime process. The Python lock alone does not provision or audit FFmpeg.

Five offline application tests also pass in the complete candidate environment, covering multilingual preprocessing, fixture WAV generation, SQL parameterization, mocked upload arguments and mocked GPU-error abort handling. Six fail-closed scanner tests pass, including CUDA-version normalization and rejection of unknown local builds. Actionlint and PowerShell parsing pass.

This validates model loading, synthesis and the synthetic reference path. It does not validate subjective pronunciation quality, the optional denoiser, optimized/compiled inference, the complete production batch, external storage/database/Discord integration, or scheduled execution.

## Remaining supported-upstream constraints

| Locked package  | Unique advisories | Fixed release needed | Confirmed upstream conflict                                                      |
| --------------- | ----------------: | -------------------- | -------------------------------------------------------------------------------- |
| Pillow 12.3.0   |                39 | >=13.0.0             | Gradio 6.17.3 requires Pillow <13; even latest Gradio 6.30.0 retains this limit. |
| datasets 3.6.0  |                 1 | >=5.0.1              | Latest VoxCPM 2.0.3 and its inspected main branch still require datasets >=3,<4. |
| fsspec 2025.3.0 |                 1 | >=2026.6.0           | datasets 3.6.0 requires fsspec <=2025.3.0.                                       |

Each contradiction was reproduced with the resolver and retained as a failing result. PyPI release metadata and the VoxCPM main-branch pyproject were saved. Upgrading to the newest Gradio alone cannot remove the Pillow conflict. Forcing pins outside these constraints would not be an upstream-supported solution.

The smallest next step is a separately approved, reviewed **VoxCPM packaging fork that makes training and web-UI dependencies optional**, while preserving the current VoxCPM2 inference API and testing all required inference paths. Source inspection found datasets in training code and Gradio in the UI dependency path, but this has not yet been implemented or validated as a reduced installation. The tradeoff is responsibility for maintaining the fork and explicit decisions about training/UI support. It is not a blanket license to uninstall dependencies or force overrides.

Alternatives are to wait for upstream compatible releases while keeping the security gate red, or evaluate another inference engine with larger behavior and quality changes. No dependency exclusions, ignore rules, severity thresholds or reachability assumptions hide these 41 findings.

## Scan coverage and reproduction

| Scope                                  | Package versions | Affected versions | Unique advisories |
| -------------------------------------- | ---------------: | ----------------: | ----------------: |
| Bot runtime, including operational tsx |               96 |                 0 |                 0 |
| Node build/dev                         |              229 |                 0 |                 0 |
| Other-platform optional runtime        |               31 |                 0 |                 0 |
| TTS runtime dependency tree            |              147 |                 3 |                41 |
| Python install/build tools             |                3 |                 0 |                 0 |
| Total                                  |          **506** |             **3** |            **41** |

The security gate maps the four reviewed `+cu130` wheel versions to their public upstream versions for OSV, retaining both versions in the report. Unknown local-version suffixes fail closed. This is a package-advisory audit, not an audit of embedded CUDA, OpenSSL, FFmpeg or operating-system components.

The first final scan failed because the restricted environment could not resolve `api.osv.dev`; it correctly reported incomplete coverage and is retained under `final-security`. The approved network-enabled rerun under `final-security-online` completed all 506 entries and failed only on the 41 retained advisories. Full JSON retains aliases, severity, affected ranges and fixed versions. The classified summary unions advisory aliases, so these are unique advisory counts rather than raw report-record counts.

The PR/push/manual/weekly CI remains fail-closed with complete artifacts. Its Windows job verifies lock closure against the CUDA 13.0 index and runs offline helper tests; it does **not** claim hosted GPU inference coverage. Hosted CI has not run because nothing was published.

For repeatable local runtime validation, use a separate environment containing the exact lock, an already verified local model-data copy and shared FFmpeg DLLs:

```powershell
# From the isolated repository. Paths below are workspace-only.
..\tools\python-migration\Scripts\python.exe -m pip check
..\tools\python-migration\Scripts\python.exe -m unittest discover -s local-tts/tests -v
..\tools\python-migration\Scripts\python.exe local-tts/scripts/validate-runtime.py --output ..\evidence\python-migration\repeat-validation --model-root ..\tools\model-assets\VoxCPM2 --ffmpeg-bin ..\tools\ffmpeg-shared\ffmpeg-9.0.2-full_build-shared\bin
..\tools\python-audit\Scripts\python.exe scripts/security_scan.py --scanner ..\tools\osv-scanner.exe --report-dir ..\evidence\python-migration\repeat-security
```

The validator creates only synthetic audio in its output directory. Omitting `--model-root` runs imports/crypto/GPU/audio checks without loading a model. Do not use `run-once.ps1` or production credentials for validation.

## Preservation and deliverables

The original checkout remains `main` at `1e9826068b465458cb955b3ff61698f898df33f6`; its five pre-existing user files have unchanged SHA-256 hashes. All 150 live Python package versions match the original baseline. The original scheduled task remains Ready and points to the original `run-hidden.vbs`. The candidate remains on `security/dependency-audit-20261023`, base `6c83b56296d9d34a665f12f3dac3e168efeda251`.

Evidence is retained in sibling `../evidence/python-migration/`: full OSV output, per-advisory findings, installation and closure logs, metadata, failed constraint probes, all runtime results (including initial failures), model provenance, synthetic WAVs and preservation checks. Historical phase-one evidence is unchanged. The source patch and evidence archive are local review deliverables only.

No live bot or actual TTS batch was started; no production credential/data access, external message, upload, driver/security/settings change, push, PR, merge or deployment occurred. Codex memories were not updated. The remaining blocker is a dependency strategy decision, not a denied or pending tool operation.
