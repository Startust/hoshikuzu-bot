"""Build the pinned packaging-only variant; verify source, license and wheel code."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
import zipfile


ROOT = Path(__file__).resolve().parent
sha256 = lambda data: hashlib.sha256(data).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def build(output, cache):
    provenance = json.loads((ROOT / 'upstream.json').read_text(encoding='utf-8'))
    patch = ROOT / 'inference-extras.patch'
    require(sha256(patch.read_bytes()) == provenance['patchSha256'], 'Patch hash mismatch')
    require(sha256((ROOT / 'LICENSE').read_bytes()) == provenance['licenseSha256'], 'License hash mismatch')
    output.mkdir(parents=True, exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)
    archive = cache / 'voxcpm-2.0.3.tar.gz'
    if not archive.exists():
        with urllib.request.urlopen(provenance['sdist']['url'], timeout=60) as response:
            archive.write_bytes(response.read())
    require(sha256(archive.read_bytes()) == provenance['sdist']['sha256'], 'Upstream sdist hash mismatch')
    with tempfile.TemporaryDirectory(prefix='voxcpm-build-') as temp:
        staging = Path(temp)
        with tarfile.open(archive, 'r:gz') as source:
            for item in source.getmembers():
                parts = PurePosixPath(item.name).parts
                if not parts or parts[0] != 'voxcpm-2.0.3' or '..' in parts or '\\' in item.name:
                    raise ValueError('Unsafe source archive path')
                target = staging.joinpath(*parts)
                if item.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                elif item.isfile():
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(source.extractfile(item).read())
                else:
                    raise ValueError('Unsupported archive entry')
        source_root = staging / 'voxcpm-2.0.3'
        require(sha256((source_root / 'pyproject.toml').read_bytes()) == provenance['pyprojectSha256'], 'Source/tag metadata mismatch')
        require(sha256((source_root / 'LICENSE').read_bytes()) == provenance['licenseSha256'], 'Source license mismatch')
        for path, expected in provenance['sourceFiles'].items():
            require(sha256((source_root / path).read_bytes()) == expected, f'Source/tag mismatch: {path}')
        for mode in ['--check', '--apply']:
            subprocess.run(['git', 'apply', mode, '--', str(patch)], cwd=source_root, check=True)
        env = dict(os.environ, SOURCE_DATE_EPOCH=str(provenance['sourceDateEpoch']), PYTHONHASHSEED='0', SETUPTOOLS_SCM_PRETEND_VERSION_FOR_VOXCPM=provenance['localVersion'])
        built = staging / 'wheel'
        subprocess.run([sys.executable, '-m', 'build', '--wheel', '--no-isolation', '--outdir', str(built), str(source_root)], env=env, check=True)
        wheels = list(built.glob('*.whl'))
        require(len(wheels) == 1 and provenance['localVersion'] in wheels[0].name, 'Unexpected build outputs')
        destination = output / wheels[0].name
        with zipfile.ZipFile(wheels[0]) as wheel:
            package_files = {p for p in wheel.namelist() if p.startswith('voxcpm/') and not p.endswith('/')}
            expected_files = {p.removeprefix('src/') for p in provenance['sourceFiles']}
            require(package_files == expected_files, 'Wheel package inventory differs from upstream')
            for path, expected in provenance['sourceFiles'].items():
                require(sha256(wheel.read(path.removeprefix('src/'))) == expected, f'Wheel source changed: {path}')
            license_name = next(p for p in wheel.namelist() if p.endswith('.dist-info/licenses/LICENSE'))
            require(sha256(wheel.read(license_name)) == provenance['licenseSha256'], 'Wheel license mismatch')
            # Canonical ZIP metadata makes builds reproducible across host filesystems.
            with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as canonical:
                for name in sorted(wheel.namelist()):
                    info = zipfile.ZipInfo(name, (2026, 4, 28, 0, 0, 0))
                    info.create_system = 3
                    info.external_attr = 0o100644 << 16
                    info.compress_type = zipfile.ZIP_DEFLATED
                    canonical.writestr(info, wheel.read(name))
        digest = sha256(destination.read_bytes())
        if provenance.get('wheelSha256'):
            require(digest == provenance['wheelSha256'], 'Rebuilt wheel differs from reviewed artifact')
        result = {'wheel': destination.name, 'sha256': digest, 'upstreamCommit': provenance['commit'], 'patchSha256': provenance['patchSha256'], 'unchangedSourceFiles': len(provenance['sourceFiles']), 'licenseVerified': True}
        (output / 'build-provenance.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(result, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--cache', type=Path, required=True)
    args = parser.parse_args()
    build(args.output.resolve(), args.cache.resolve())
