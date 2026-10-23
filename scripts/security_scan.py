"""Full OSV gate. Any finding, extraction gap, malformed report or tool failure fails."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import urllib.request

from packaging.requirements import Requirement
from packaging.utils import canonicalize_name


def python_inventory(lock):
    result = {}
    for line in lock.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        match = re.fullmatch(r"([A-Za-z0-9_.-]+)==([A-Za-z0-9.+_-]+)", line)
        if not match:
            raise ValueError(f"Expected an exact package pin: {line}")
        name, version = canonicalize_name(match[1]), match[2]
        if name in result:
            raise ValueError(f"Duplicate Python pin: {name}")
        result[name] = version
    if not result:
        raise ValueError("Empty Python lock")
    return result


def validate_manifest(manifest, pins):
    for line in manifest.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        req = Requirement(line)
        name = canonicalize_name(req.name)
        if req.url or req.marker or req.extras or name not in pins or pins[name] not in req.specifier:
            raise ValueError(f"Python manifest/lock mismatch: {line}")


def osv_python_version(name, version, provenance=None):
    # Official CUDA wheels share the upstream Python release's advisories.
    # Preserve the full installed version in the report; reject other local
    # versions rather than silently dropping a suffix we have not reviewed.
    if "+" not in version:
        return version
    if name == "voxcpm" and provenance and version == provenance["localVersion"]:
        return provenance["upstreamVersion"]
    upstream, build = version.split("+", 1)
    if name not in {"torch", "torchaudio", "torchvision", "torchcodec"} or build not in {"cu128", "cu130"}:
        raise ValueError(f"Unsupported local version: {name}=={version}")
    return upstream


def validate_vendor(repo):
    root = repo / "third_party/voxcpm"
    provenance = json.loads((root / "upstream.json").read_text(encoding="utf-8"))
    for filename, key in [("inference-extras.patch", "patchSha256"), ("LICENSE", "licenseSha256"), ("build-requirements-lock.txt", "buildLockSha256")]:
        if hashlib.sha256((root / filename).read_bytes()).hexdigest() != provenance[key]:
            raise ValueError(f"VoxCPM provenance mismatch: {filename}")
    if not re.fullmatch(r"[0-9a-f]{40}", provenance["commit"]) or not provenance["sourceFiles"]:
        raise ValueError("Missing upstream source identity")
    return provenance


def validate_installed(report, pins, provenance):
    if report.get("packages") != pins:
        raise ValueError("Installed Python closure differs from lock (extra, missing or wrong versions)")
    package = report.get("voxcpm", {})
    if package.get("version") != provenance["localVersion"] or package.get("metadataSha256") != provenance["wheelMetadataSha256"] or package.get("sourceHashes") != provenance["sourceFiles"] or package.get("licenseSha256") != provenance["licenseSha256"]:
        raise ValueError("Installed VoxCPM code, metadata or license differs from reviewed wheel")
    if {"datasets", "gradio", "spaces"}.intersection(pins):
        raise ValueError("Training/UI extras must not be installed in the inference environment")


def query_upstream_commit(provenance, output):
    query = {"commit": provenance["commit"]}
    (output / "upstream-query.json").write_text(json.dumps(query) + "\n", encoding="utf-8")
    request = urllib.request.Request("https://api.osv.dev/v1/query", data=json.dumps(query).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=60) as response:
        report = json.load(response)
    (output / "upstream-git.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    if not isinstance(report, dict) or not isinstance(report.get("vulns", []), list) or report.get("next_page_token") or "error" in report:
        raise ValueError("Malformed upstream commit query")
    findings = []
    for vuln in report.get("vulns", []):
        if not isinstance(vuln.get("id"), str):
            raise ValueError("Malformed upstream commit advisory")
        findings.append({"source": "upstream-git", "package": "voxcpm", "version": provenance["commit"], "id": vuln["id"], "aliases": vuln.get("aliases", []), "summary": vuln.get("summary", "")})
    return findings


def yarn_inventory(lock):
    # Yarn Classic grammar for this repository. Reject unsupported lines instead
    # of silently declaring coverage when a future lockfile format is introduced.
    text = lock.read_text(encoding="utf-8-sig")
    if "# yarn lockfile v1" not in text:
        raise ValueError("Expected Yarn Classic v1 lockfile")
    result, name = set(), None
    for line in text.splitlines():
        if not line or line.startswith("#"):
            continue
        if not line.startswith(" "):
            if not line.endswith(":"):
                raise ValueError(f"Unsupported lock header: {line}")
            selector = line[:-1].split(", ")[0].strip('"')
            if "@npm:" in selector:
                selector = selector.split("@npm:", 1)[1]
            name = selector.rsplit("@", 1)[0]
            if not name:
                raise ValueError("Missing package name in Yarn lock")
        elif line.startswith("  version "):
            match = re.fullmatch(r'  version "([^\"]+)"', line)
            if not name or not match:
                raise ValueError("Unsupported Yarn version record")
            result.add((name, match[1]))
    if not result:
        raise ValueError("Empty Yarn lock")
    return result


def validate_report(report, expected):
    results = report.get("results")
    if not isinstance(results, list) or not results:
        raise ValueError("Missing OSV results")
    found = {name: set() for name in expected}
    findings = []
    for source in results:
        filename = Path(source["source"]["path"]).name
        if filename not in expected:
            raise ValueError(f"Unexpected scan source: {filename}")
        packages = source.get("packages")
        if not isinstance(packages, list) or not packages:
            raise ValueError(f"Empty scan source: {filename}")
        for item in packages:
            package = item["package"]
            ecosystem = "npm" if filename == "yarn.lock" else "PyPI"
            if package.get("ecosystem") != ecosystem:
                raise ValueError("Unexpected package ecosystem")
            name = package["name"]
            if ecosystem == "PyPI":
                name = canonicalize_name(name)
            found[filename].add((name, package["version"]))
            vulns = item.get("vulnerabilities", [])
            if not isinstance(vulns, list):
                raise ValueError("Malformed vulnerabilities")
            for vuln in vulns:
                if not isinstance(vuln.get("id"), str):
                    raise ValueError("Malformed advisory")
                findings.append({"source": filename, "package": name, "version": package["version"], "id": vuln["id"], "aliases": vuln.get("aliases", []), "summary": vuln.get("summary", "")})
    for name, wanted in expected.items():
        if found[name] != wanted:
            raise ValueError(f"Coverage mismatch in {name}: missing={sorted(wanted-found[name])}; unexpected={sorted(found[name]-wanted)}")
    return findings


def run_gate(repo, output, scanner, installed_python=None, installed_build_python=None):
    output.mkdir(parents=True, exist_ok=True)
    summary = {"status": "incomplete", "coverage": {}, "limits": [
        "Python lock targets Windows x64 / Python 3.11; reviewed official CUDA +cu128/+cu130 wheels are mapped to upstream versions for OSV matching (including TorchCodec).",
        "Includes every Node lock entry (runtime, dev, optional platforms) and every Python lock entry (runtime and installer tools). No severity threshold or advisory ignore list.",
        "Does not scan model weights, bundled native libraries, OS packages, live deployments, credentials, or GPU behavior.",
        "Local VoxCPM package maps to its verified unchanged upstream code release and commit; a clean OSV query is not a source-code security review.",
        "Optional training/UI extras are not part of the inference install and remain unsupported for production; their historical findings are retained in the audit evidence.",
    ]}
    try:
        lock = repo / "local-tts/requirements-lock.txt"
        pins = python_inventory(lock)
        validate_manifest(repo / "local-tts/requirements.txt", pins)
        provenance = validate_vendor(repo)
        summary["localPackageProvenance"] = {k: v for k, v in provenance.items() if k != "sourceFiles"}
        if installed_python:
            probe = subprocess.run([str(installed_python), "-I", str(repo / "scripts/python_inventory_probe.py"), str(repo / "third_party/voxcpm/upstream.json")], capture_output=True, text=True, encoding="utf-8", check=True, timeout=60)
            installed = json.loads(probe.stdout)
            (output / "installed-inventory.json").write_text(json.dumps(installed, indent=2) + "\n", encoding="utf-8")
            validate_installed(installed, pins, provenance)
            summary["installedClosure"] = {"status": "verified", "packages": len(pins), "unchangedSourceFiles": len(provenance["sourceFiles"])}
            pins = installed["packages"]
        else:
            summary["installedClosure"] = {"status": "not requested; manifest-only scan"}
        normalized = {name: osv_python_version(name, version, provenance) for name, version in pins.items()}
        scan_input = output / "requirements-scan.txt"
        scan_input.write_text("".join(f"{n}=={v}\n" for n, v in sorted(normalized.items())), encoding="utf-8")
        build_pins = python_inventory(repo / "third_party/voxcpm/build-requirements-lock.txt")
        if installed_build_python:
            probe = subprocess.run([str(installed_build_python), "-I", str(repo / "scripts/python_inventory_probe.py"), str(repo / "third_party/voxcpm/upstream.json")], capture_output=True, text=True, encoding="utf-8", check=True, timeout=60)
            installed_build = json.loads(probe.stdout)
            (output / "installed-build-inventory.json").write_text(json.dumps(installed_build, indent=2) + "\n", encoding="utf-8")
            if installed_build.get("packages") != build_pins:
                raise ValueError("Installed build environment differs from build lock")
            summary["installedBuildClosure"] = {"status": "verified", "packages": len(build_pins)}
        else:
            summary["installedBuildClosure"] = {"status": "not requested; manifest-only scan"}
        build_input = output / "voxcpm-build-requirements.txt"
        build_input.write_text("".join(f"{n}=={v}\n" for n, v in sorted(build_pins.items())), encoding="utf-8")
        empty_config = output / "osv-scanner.toml"
        empty_config.write_text("# Intentionally no ignores or severity filters.\n", encoding="utf-8")
        (output / "osv.json").unlink(missing_ok=True)
        expected = {"yarn.lock": yarn_inventory(repo / "yarn.lock"), "requirements-scan.txt": set(normalized.items()), "voxcpm-build-requirements.txt": set(build_pins.items())}
        summary["coverage"] = {name: len(packages) for name, packages in expected.items()}
        summary["sha256"] = {str(p.relative_to(repo)): hashlib.sha256(p.read_bytes()).hexdigest() for p in [repo / "package.json", repo / "yarn.lock", repo / "local-tts/requirements.txt", lock]}
        summary["cudaNormalization"] = {n: {"locked": pins[n], "queried": v} for n, v in normalized.items() if pins[n] != v}
        command = [scanner, "scan", "source", "--no-resolve", "--all-packages", "--all-vulns", "--config", str(empty_config), "--lockfile", str(repo / "yarn.lock"), "--lockfile", str(scan_input), "--lockfile", str(build_input), "--format", "json", "--output-file", str(output / "osv.json")]
        completed = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=600)
        log = completed.stdout + completed.stderr
        (output / "scanner.log").write_text(log, encoding="utf-8")
        summary["scannerExit"] = completed.returncode
        if completed.returncode not in {0, 1}:
            raise ValueError(f"OSV scanner failed: exit {completed.returncode}")
        report = json.loads((output / "osv.json").read_text(encoding="utf-8-sig"))
        findings = validate_report(report, expected)
        summary["findings"] = findings
        if re.search(r"failed|error during extraction|unscannable|filtered \d", log, re.I):
            raise ValueError("OSV reported an extraction or scan error; inspect scanner.log")
        if completed.returncode == 1 and not findings:
            raise ValueError("OSV failed without a vulnerability explanation")
        findings.extend(query_upstream_commit(provenance, output))
        summary["status"] = "vulnerabilities" if findings else "clean"
    except Exception as error:
        summary["error"] = str(error)
    finally:
        (output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
        lines = ["# Dependency security", "", f"Status: **{summary['status']}**", "", f"Coverage: `{json.dumps(summary['coverage'])}`", ""]
        if "error" in summary:
            lines.extend([f"Error: {summary['error']}", ""])
        lines.extend(f"- {limit}" for limit in summary["limits"])
        lines.extend(["", "## All advisory records (aliases remain in the full JSON)", ""])
        lines.extend(f"- {f['source']}: {f['package']}@{f['version']} — [{f['id']}](https://osv.dev/{f['id']})" for f in summary.get("findings", []))
        (output / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in summary.items() if k != "findings"}, indent=2))
    return 0 if summary["status"] == "clean" else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--scanner", default="osv-scanner")
    parser.add_argument("--report-dir", default="security-reports")
    parser.add_argument("--installed-python", type=Path, help="Verify and scan the actual installed inference closure and local package hashes")
    parser.add_argument("--installed-build-python", type=Path, help="Verify the actual local-wheel builder closure against its complete lock")
    args = parser.parse_args()
    raise SystemExit(run_gate(Path(__file__).resolve().parents[1], Path(args.report_dir).resolve(), args.scanner, args.installed_python.resolve() if args.installed_python else None, args.installed_build_python.resolve() if args.installed_build_python else None))
