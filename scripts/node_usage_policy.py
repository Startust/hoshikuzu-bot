"""Conservative, reviewed-use classification of the complete Yarn Classic graph.

No package or advisory is exempt. A name/version is check-only only when every
root path is reviewed as check-only. Peer edges deliberately include *all*
locked versions of a peer name; this may over-block but cannot hide overlap.
"""
from collections import deque
import hashlib
import json
from pathlib import Path
import re
import shlex
import subprocess


POLICY = 'scripts/security-policy.json'
METADATA = 'scripts/node-package-metadata.json'


def text_hash(path):
    return hashlib.sha256(path.read_bytes().replace(b'\r\n', b'\n')).hexdigest()


def reviewed_inputs(repo):
    result = subprocess.run(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
                            cwd=repo, capture_output=True, check=True)
    paths = set(result.stdout.decode('utf-8').split('\0')) - {''}
    # Documentation has no executable role. New/removed code, configuration and
    # workflow files must be represented, not just the previously listed paths.
    paths = {p for p in paths if p != POLICY and not p.lower().endswith('.md')}
    return {p: text_hash(repo / p) for p in sorted(paths)}


def read_yarn_graph(lock):
    text = lock.read_text(encoding='utf-8-sig')
    if '# yarn lockfile v1' not in text:
        raise ValueError('Expected Yarn Classic v1 graph')
    records, selectors, current, section = [], {}, None, None
    for line in text.splitlines():
        if not line or line.startswith('#'):
            continue
        if not line.startswith(' '):
            if not line.endswith(':'):
                raise ValueError('Unsupported Yarn graph header')
            names = [json.loads(s) if s.startswith('"') else s for s in line[:-1].split(', ')]
            if any(not re.fullmatch(r'(@[^/@\s]+/[^@\s]+|[^@\s]+)@[0-9A-Za-z.*^~<>| =+\-]+', s) for s in names):
                raise ValueError(f'Unsupported or ambiguous Yarn graph selector: {names}')
            package_names = {s.rsplit('@', 1)[0] for s in names}
            if len(package_names) != 1:
                raise ValueError('Mixed package identities in Yarn graph record')
            current = {'name': package_names.pop(), 'selectors': names, 'dependencies': {}, 'optionalDependencies': {}}
            records.append(current)
            section = None
            for selector in names:
                if selector in selectors:
                    raise ValueError('Duplicate Yarn selector')
                selectors[selector] = current
        elif current is None:
            raise ValueError('Yarn graph field without header')
        elif line.startswith('    ') and not line.startswith('     '):
            tokens = shlex.split(line.strip())
            if section not in ('dependencies', 'optionalDependencies') or len(tokens) != 2:
                raise ValueError('Unsupported Yarn graph edge')
            if tokens[0] in current[section]:
                raise ValueError('Duplicate Yarn graph edge')
            current[section][tokens[0]] = tokens[1]
        elif line.startswith('  ') and not line.startswith('   '):
            if line.strip() in ('dependencies:', 'optionalDependencies:'):
                section = line.strip()[:-1]
            else:
                section = None
                tokens = shlex.split(line.strip())
                if len(tokens) != 2 or tokens[0] not in ('version', 'resolved', 'integrity') or tokens[0] in current:
                    raise ValueError('Unsupported Yarn graph field')
                current[tokens[0]] = tokens[1]
        else:
            raise ValueError('Unsupported Yarn graph indentation')
    for record in records:
        if not all(record.get(k) for k in ('version', 'resolved', 'integrity')):
            raise ValueError('Incomplete locked package identity')
        if not re.fullmatch(r'https://registry\.(npmjs\.org|yarnpkg\.com)/[^\s]+\.tgz(?:#[0-9a-f]+)?', record['resolved']):
            raise ValueError('Only reviewed registry tarballs are supported; Git/local dependencies need a new audit')
        for group in ('dependencies', 'optionalDependencies'):
            for name, version_range in record[group].items():
                if f'{name}@{version_range}' not in selectors:
                    raise ValueError(f'Missing locked dependency edge: {name}@{version_range}')
    if not records:
        raise ValueError('Empty Yarn graph')
    return records, selectors


def classify_graph(records, selectors, manifest, root_usage, metadata):
    def identity(record):
        return f"{record['name']}@{record['version']}"

    nodes = {identity(r): {'name': r['name'], 'version': r['version'], 'edges': set()} for r in records}
    if set(metadata) != set(nodes):
        raise ValueError('Missing or extra package metadata in graph evidence')
    by_name = {}
    for key, node in nodes.items():
        by_name.setdefault(node['name'], set()).add(key)
    override_targets = {}
    resolutions = manifest.get('resolutions', {})
    if not isinstance(resolutions, dict):
        raise ValueError('Malformed Yarn resolutions')
    for pattern, version in resolutions.items():
        if not isinstance(pattern, str) or not isinstance(version, str) or not re.fullmatch(r'\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?', version):
            raise ValueError('Unsupported resolution; require reviewed exact versions')
        parts = pattern.split('/')
        if any(not part or (('*' in part or '?' in part or '[' in part) and part != '**') for part in parts) or parts[-1] == '**':
            raise ValueError('Unsupported resolution pattern')
        name = '/'.join(parts[-2:]) if len(parts) >= 2 and parts[-2].startswith('@') else parts[-1]
        selector = f'{name}@{version}'
        if selector not in selectors or selectors[selector]['version'] != version:
            raise ValueError(f'Unresolved exact override target: {selector}')
        override_targets.setdefault(name, set()).add(identity(selectors[selector]))
    absent_peers = []
    for record in records:
        key = identity(record)
        package = metadata[key]
        for field in ('dependencies', 'optionalDependencies', 'peerDependencies', 'lifecycleScripts'):
            if field not in package or not isinstance(package[field], dict) or any(not isinstance(k, str) or not isinstance(v, str) for k, v in package[field].items()):
                raise ValueError(f'Missing or malformed package {field} evidence: {key}')
        if type(package.get('bindingGyp')) is not bool:
            raise ValueError(f'Missing tarball implicit-install evidence: {key}')
        if package.get('bundledPackages') is not False:
            raise ValueError(f'Bundled package inventory absent or unsupported: {key}')
        if package['name'] != record['name'] or package['version'] != record['version'] or package['integrity'] != record['integrity']:
            raise ValueError(f'Package metadata identity/integrity mismatch: {key}')
        optional = package.get('optionalDependencies', {})
        dependencies = {k: v for k, v in package.get('dependencies', {}).items() if k not in optional}
        if dependencies != record['dependencies'] or optional != record['optionalDependencies']:
            raise ValueError(f'Package metadata/lock edges disagree: {key}')
        for group in ('dependencies', 'optionalDependencies'):
            nodes[key]['edges'].update(identity(selectors[f'{n}@{v}']) for n, v in record[group].items())
            for name in record[group]:
                # Path-scoped resolutions can change hoisted identities. Add
                # every reviewed same-name target instead of narrowing paths.
                nodes[key]['edges'].update(override_targets.get(name, set()))
        for peer, constraint in package.get('peerDependencies', {}).items():
            # Yarn Classic does not auto-install missing peers. Record absence
            # explicitly, and include every present version, even outside range.
            targets = by_name.get(peer, set())
            nodes[key]['edges'].update(targets)
            if not targets:
                absent_peers.append({'consumer': key, 'peer': peer, 'range': constraint})

    roots = {}
    declared = set(manifest.get('dependencies', {})) | set(manifest.get('devDependencies', {}))
    if set(root_usage) != declared or manifest.get('optionalDependencies') or manifest.get('peerDependencies') or manifest.get('workspaces'):
        raise ValueError('Missing/unreviewed root roles or unsupported manifest roots')
    paths = {key: {} for key in nodes}
    def trace(root_name, root_key, role):
        queue = deque([(root_key, [root_key])])
        seen = set()
        while queue:
            key, route = queue.popleft()
            if key in seen:
                continue
            seen.add(key)
            paths[key][root_name] = {'role': role, 'path': route}
            queue.extend((child, route + [child]) for child in sorted(nodes[key]['edges']) if child not in seen)

    for group in ('dependencies', 'devDependencies'):
        for name, version_range in manifest.get(group, {}).items():
            role = root_usage[name]['role']
            if role not in ('runtime', 'build', 'check-only', 'unknown') or not root_usage[name].get('evidence'):
                raise ValueError('Missing reviewed root usage evidence')
            if group == 'dependencies' and role != 'runtime':
                raise ValueError('Production root cannot be downgraded')
            selector = f'{name}@{version_range}'
            if selector not in selectors:
                raise ValueError(f'Unresolved manifest root: {selector}')
            root_key = identity(selectors[selector])
            roots[name] = {'role': role, 'instance': root_key, 'evidence': root_usage[name]['evidence']}
            trace(name, root_key, role)
            for target in override_targets.get(name, set()):
                trace(name, target, role)
    for key, package in metadata.items():
        # Yarn 1.22.22 package-install-scripts.js INSTALL_STAGES excludes prepare
        # for registry tarballs. Git/local sources are rejected above; the root
        # manifest's prepare/build scripts are separately bound by usage review.
        install_scripts = {k: v for k, v in package.get('lifecycleScripts', {}).items()
                           if k in ('preinstall', 'install', 'postinstall')}
        if package['bindingGyp'] and not install_scripts.get('install'):
            install_scripts['install'] = 'node-gyp rebuild (implicit Yarn binding.gyp hook)'
        if install_scripts:
            name = f'install:{key}'
            roots[name] = {'role': 'build', 'instance': key, 'evidence': install_scripts}
            trace(name, key, 'build')
    if any(not routes for routes in paths.values()):
        raise ValueError('Orphan/unknown package path in full locked graph')
    return {'roots': roots, 'absentPeers': absent_peers,
            'conservativeResolutionTargets': {name: sorted(targets) for name, targets in override_targets.items()}, 'packages': {
        key: {'name': node['name'], 'version': node['version'], 'edges': sorted(node['edges']),
              'classification': 'check-only' if all(p['role'] == 'check-only' for p in paths[key].values()) else 'blocking',
              'rootPaths': paths[key]}
        for key, node in sorted(nodes.items())}}


def load_usage_graph(repo, expected_inventory):
    policy = json.loads((repo / POLICY).read_text(encoding='utf-8'))
    if policy.get('schemaVersion') != 1 or policy.get('reviewedInputs') != reviewed_inputs(repo):
        raise ValueError('Usage evidence missing or stale: review changed source, scripts, configuration and locks')
    metadata = json.loads((repo / METADATA).read_text(encoding='utf-8'))
    if metadata.get('schemaVersion') != 1 or metadata.get('yarnLockSha256') != text_hash(repo / 'yarn.lock'):
        raise ValueError('Package graph evidence does not match current lock')
    records, selectors = read_yarn_graph(repo / 'yarn.lock')
    if {(r['name'], r['version']) for r in records} != expected_inventory:
        raise ValueError('Graph and scanned inventory disagree')
    graph = classify_graph(records, selectors, json.loads((repo / 'package.json').read_text()), policy['rootUsage'], metadata['packages'])
    graph['review'] = {'policySha256': text_hash(repo / POLICY), 'metadataSha256': text_hash(repo / METADATA),
                       'reviewedInputCount': len(policy['reviewedInputs']), 'method': 'full locked dependencies/optional edges plus conservative present peer edges; audited root usage and source snapshot'}
    return graph


def classify_findings(findings, graph):
    result = []
    for finding in findings:
        item = dict(finding)
        node = graph['packages'].get(f"{finding['package']}@{finding['version']}") if finding['source'] == 'yarn.lock' else None
        warning = node is not None and node['classification'] == 'check-only'
        item['disposition'] = 'warning' if warning else 'blocking'
        item['reason'] = 'Every reviewed consumer path is check-only' if warning else 'Runtime, build, shared, Python/upstream, or unknown use remains blocking'
        item['rootPaths'] = node['rootPaths'] if node else {}
        result.append(item)
    return result
