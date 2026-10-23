import importlib.util
import json
import subprocess
import sys
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("security_scan", Path(__file__).resolve().parents[1] / "security_scan.py")
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


class GateTests(unittest.TestCase):
    def test_builder_rejects_corrupt_source_even_with_optimization(self):
        builder = Path(__file__).resolve().parents[2] / "third_party/voxcpm/build_local.py"
        with tempfile.TemporaryDirectory() as temp:
            cache = Path(temp) / "cache"
            cache.mkdir()
            (cache / "voxcpm-2.0.3.tar.gz").write_bytes(b"invalid fixture")
            result = subprocess.run([sys.executable, "-O", str(builder), "--output", str(Path(temp) / "wheel"), "--cache", str(cache)], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Upstream sdist hash mismatch", result.stderr)

    def test_local_version_requires_explicit_provenance(self):
        with self.assertRaises(ValueError):
            gate.osv_python_version("voxcpm", "2.0.3+hoshikuzu.1")
        provenance = {"localVersion": "2.0.3+hoshikuzu.1", "upstreamVersion": "2.0.3"}
        self.assertEqual(gate.osv_python_version("voxcpm", "2.0.3+hoshikuzu.1", provenance), "2.0.3")
        with self.assertRaises(ValueError):
            gate.osv_python_version("voxcpm", "2.0.3+unreviewed", provenance)

    def test_installed_closure_and_code_must_match(self):
        pins = {"voxcpm": "2.0.3+fixture"}
        provenance = {"localVersion": pins["voxcpm"], "wheelMetadataSha256": "metadata", "sourceFiles": {"src/voxcpm/core.py": "source"}, "licenseSha256": "license"}
        report = {"packages": dict(pins), "voxcpm": {"version": pins["voxcpm"], "metadataSha256": "metadata", "sourceHashes": dict(provenance["sourceFiles"]), "licenseSha256": "license"}}
        gate.validate_installed(report, pins, provenance)
        report["packages"]["unscanned"] = "1.0"
        with self.assertRaisesRegex(ValueError, "closure differs"):
            gate.validate_installed(report, pins, provenance)
        report["packages"] = dict(pins)
        report["voxcpm"]["sourceHashes"]["src/voxcpm/core.py"] = "changed"
        with self.assertRaisesRegex(ValueError, "code, metadata or license"):
            gate.validate_installed(report, pins, provenance)

    def test_patch_tampering_fails(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "third_party/voxcpm"
            root.mkdir(parents=True)
            (root / "upstream.json").write_text(json.dumps({"patchSha256": "expected"}))
            (root / "inference-extras.patch").write_text("tampered")
            with self.assertRaisesRegex(ValueError, "provenance mismatch"):
                gate.validate_vendor(Path(temp))

    def test_cuda_versions_are_explicitly_normalized_or_rejected(self):
        self.assertEqual(gate.osv_python_version("torch", "2.11.0+cu128"), "2.11.0")
        self.assertEqual(gate.osv_python_version("torch", "2.14.1+cu130"), "2.14.1")
        self.assertEqual(gate.osv_python_version("torchcodec", "0.17.0+cu130"), "0.17.0")
        self.assertEqual(gate.osv_python_version("cryptography", "50.0.2"), "50.0.2")
        for name, version in [("torch", "2.14.1+unreviewed"), ("fixture", "1.0+cu130")]:
            with self.assertRaisesRegex(ValueError, "Unsupported local version"):
                gate.osv_python_version(name, version)

    def test_clean_requires_exact_coverage(self):
        report = {"results": [{"source": {"path": "yarn.lock"}, "packages": [{"package": {"name": "fixture", "version": "1.0.0", "ecosystem": "npm"}}]}]}
        self.assertEqual(gate.validate_report(report, {"yarn.lock": {("fixture", "1.0.0")}}), [])
        with self.assertRaisesRegex(ValueError, "Coverage mismatch"):
            gate.validate_report(report, {"yarn.lock": {("fixture", "1.0.0"), ("omitted", "1.0.0")}})

    def test_missing_and_malformed_reports_fail(self):
        for report in [{}, {"results": []}]:
            with self.assertRaises(ValueError):
                gate.validate_report(report, {"yarn.lock": {("fixture", "1.0.0")}})

    def test_vulnerabilities_are_retained(self):
        report = {"results": [{"source": {"path": "yarn.lock"}, "packages": [{"package": {"name": "fixture", "version": "1.0.0", "ecosystem": "npm"}, "vulnerabilities": [{"id": "GHSA-fixture", "aliases": ["CVE-fixture"]}]}]}]}
        findings = gate.validate_report(report, {"yarn.lock": {("fixture", "1.0.0")}})
        self.assertEqual(findings[0]["aliases"], ["CVE-fixture"])

    def test_unpinned_python_and_manifest_drift_fail(self):
        with tempfile.TemporaryDirectory() as temp:
            lock = Path(temp) / "lock.txt"
            lock.write_text("fixture>=1\n")
            with self.assertRaises(ValueError):
                gate.python_inventory(lock)
            lock.write_text("fixture==2.0\n")
            with self.assertRaises(ValueError):
                gate.validate_manifest(lock, {"fixture": "1.0"})

    def test_scanner_failure_cannot_pass_and_writes_summary(self):
        repo = Path(__file__).resolve().parents[2]
        with tempfile.TemporaryDirectory() as temp, patch.object(gate.subprocess, "run", side_effect=OSError("fixture scanner unavailable")):
            self.assertEqual(gate.run_gate(repo, Path(temp), "fixture"), 1)
            self.assertIn("incomplete", (Path(temp) / "summary.json").read_text())


if __name__ == "__main__":
    unittest.main()
