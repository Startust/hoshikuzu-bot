"""Read installed metadata and hashes without importing application packages."""
import hashlib
import importlib.metadata
import json
from pathlib import Path
import re
import sys


def probe(provenance_path):
    provenance = json.loads(Path(provenance_path).read_text(encoding='utf-8'))
    packages = {}
    for dist in importlib.metadata.distributions():
        name = re.sub(r'[-_.]+', '-', dist.metadata['Name']).lower()
        if name in packages:
            raise ValueError(f'Duplicate installed distribution: {name}')
        packages[name] = dist.version
    result = {'packages': packages}
    if 'voxcpm' in packages:
        dist = importlib.metadata.distribution('voxcpm')
        result['voxcpm'] = {
            'version': dist.version,
            'metadataSha256': hashlib.sha256(dist.locate_file(f'voxcpm-{dist.version}.dist-info/METADATA').read_bytes()).hexdigest(),
            'sourceHashes': {path: hashlib.sha256(dist.locate_file(path.removeprefix('src/')).read_bytes()).hexdigest() for path in provenance['sourceFiles']},
            'licenseSha256': hashlib.sha256(dist.locate_file(f'voxcpm-{dist.version}.dist-info/licenses/LICENSE').read_bytes()).hexdigest(),
        }
    return result


if __name__ == '__main__':
    print(json.dumps(probe(sys.argv[1]), indent=2))
