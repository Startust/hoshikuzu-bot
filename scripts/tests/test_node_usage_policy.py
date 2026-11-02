import contextlib
import copy
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import node_usage_policy as usage
import security_scan as gate


def fixture(roles=None):
    roles = roles or {'checker': 'check-only'}
    records, selectors, metadata = [], {}, {}
    for name in [*roles, 'target']:
        deps = {'target': '^1.0.0'} if name in roles else {}
        record = {'name': name, 'version': '1.0.0', 'selectors': [name+'@^1.0.0'],
                  'dependencies': deps, 'optionalDependencies': {}, 'integrity': 'sha512-fixture'}
        records.append(record)
        selectors[name+'@^1.0.0'] = record
        metadata[name+'@1.0.0'] = {'name': name, 'version': '1.0.0', 'dependencies': dict(deps),
                                  'optionalDependencies': {}, 'peerDependencies': {},
                                  'integrity': 'sha512-fixture', 'lifecycleScripts': {}, 'bindingGyp': False, 'bundledPackages': False}
    manifest = {'dependencies': {n:'^1.0.0' for n,r in roles.items() if r == 'runtime'},
                'devDependencies': {n:'^1.0.0' for n,r in roles.items() if r != 'runtime'}}
    root_usage = {n:{'role':r,'evidence':'reviewed fixture input'} for n,r in roles.items()}
    return records, selectors, manifest, root_usage, metadata


def finding(source='yarn.lock', name='target'):
    return {'source':source,'package':name,'version':'1.0.0','id':'GHSA-fixture','aliases':['CVE-fixture']}


class GraphPolicyTests(unittest.TestCase):
    def test_check_only_warning_retains_advisory_and_paths(self):
        graph = usage.classify_graph(*fixture())
        item, = usage.classify_findings([finding()], graph)
        self.assertEqual(item['disposition'], 'warning')
        self.assertEqual(item['aliases'], ['CVE-fixture'])
        self.assertEqual(item['rootPaths']['checker']['path'], ['checker@1.0.0','target@1.0.0'])

    def test_runtime_build_unknown_and_overlapping_paths_block(self):
        for role in ('runtime','build','unknown'):
            with self.subTest(role=role):
                graph = usage.classify_graph(*fixture({'checker':'check-only','other':role}))
                item, = usage.classify_findings([finding()], graph)
                self.assertEqual(item['disposition'], 'blocking')
                self.assertEqual(set(item['rootPaths']), {'checker','other'})

    def test_peer_and_optional_runtime_paths_block(self):
        for edge in ('peerDependencies','optionalDependencies'):
            data = fixture({'checker':'check-only','app':'runtime'})
            records, selectors, manifest, roles, metadata = data
            app = selectors['app@^1.0.0']
            app['dependencies'] = {}
            metadata['app@1.0.0']['dependencies'] = {}
            metadata['app@1.0.0'][edge] = {'target':'^1.0.0'}
            if edge == 'optionalDependencies':
                app[edge] = {'target':'^1.0.0'}
            item, = usage.classify_findings([finding()], usage.classify_graph(*data))
            self.assertEqual(item['disposition'], 'blocking')

    def test_install_hooks_block_but_registry_prepare_is_not_executed(self):
        for hook, expected in [('postinstall','blocking'),('preinstall','blocking'),('install','blocking'),('prepare','warning')]:
            data = fixture()
            data[-1]['checker@1.0.0']['lifecycleScripts'] = {hook:'node fixture.js'}
            item, = usage.classify_findings([finding()], usage.classify_graph(*data))
            self.assertEqual(item['disposition'], expected)

    def test_metadata_mismatch_missing_unknown_roots_and_orphans_fail(self):
        mutations = [
            lambda d: d[-1].pop('target@1.0.0'),
            lambda d: d[-1]['checker@1.0.0'].update(dependencies={}),
            lambda d: d[-1]['checker@1.0.0'].update(integrity='changed'),
            lambda d: d[-1]['checker@1.0.0'].pop('lifecycleScripts'),
            lambda d: d[-1]['checker@1.0.0'].pop('peerDependencies'),
            lambda d: d[-1]['checker@1.0.0'].pop('bindingGyp'),
            lambda d: d[-1]['checker@1.0.0'].pop('bundledPackages'),
            lambda d: d[-1]['checker@1.0.0'].update(bundledPackages=True),
            lambda d: d[3].clear(),
            lambda d: (d[0][0].update(dependencies={}), d[-1]['checker@1.0.0'].update(dependencies={})),
        ]
        for mutate in mutations:
            data = fixture()
            mutate(data)
            with self.assertRaises(ValueError):
                usage.classify_graph(*data)

    def test_implicit_binding_gyp_install_blocks(self):
        data = fixture()
        data[-1]['checker@1.0.0']['bindingGyp'] = True
        graph = usage.classify_graph(*data)
        item, = usage.classify_findings([finding()], graph)
        self.assertEqual(item['disposition'], 'blocking')
        self.assertIn('install:checker@1.0.0', item['rootPaths'])

    def test_unlocked_or_unsupported_resolution_fails(self):
        for resolutions in ({'checker/target':'2.0.0'},{'target':'^1.0.0'},{'target*':'1.0.0'}):
            data = fixture()
            data[2]['resolutions'] = resolutions
            with self.assertRaises(ValueError):
                usage.classify_graph(*data)

    def test_scoped_resolution_adds_conservative_runtime_overlap(self):
        data = fixture({'checker':'check-only','app':'runtime'})
        records,selectors,manifest,roles,metadata = data
        other = copy.deepcopy(selectors['target@^1.0.0'])
        other.update(version='2.0.0',selectors=['target@2.0.0'])
        records.append(other)
        selectors['target@2.0.0'] = other
        selectors['target@1.0.0'] = selectors['target@^1.0.0']
        metadata['target@2.0.0'] = copy.deepcopy(metadata['target@1.0.0'])
        metadata['target@2.0.0']['version'] = '2.0.0'
        selectors['app@^1.0.0']['dependencies'] = {'target':'2.0.0'}
        metadata['app@1.0.0']['dependencies'] = {'target':'2.0.0'}
        manifest['resolutions'] = {'checker/target':'1.0.0'}
        graph = usage.classify_graph(*data)
        self.assertEqual(graph['packages']['target@1.0.0']['classification'],'blocking')
        self.assertIn('app',graph['packages']['target@1.0.0']['rootPaths'])

    def test_production_root_cannot_be_relabelled_check_only(self):
        data = fixture({'app':'runtime'})
        data[3]['app']['role'] = 'check-only'
        with self.assertRaisesRegex(ValueError, 'Production root'):
            usage.classify_graph(*data)

    def test_unknown_finding_and_python_and_upstream_are_blocking(self):
        graph = usage.classify_graph(*fixture())
        for item in [finding(name='not-in-graph'),finding(source='requirements-scan.txt'),finding(source='upstream-git')]:
            self.assertEqual(usage.classify_findings([item],graph)[0]['disposition'],'blocking')

    def test_no_findings_is_empty_not_a_warning(self):
        self.assertEqual(usage.classify_findings([],usage.classify_graph(*fixture())),[])

    def test_missing_stale_graph_evidence_fails(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root/'scripts').mkdir()
            with self.assertRaises(FileNotFoundError):
                usage.load_usage_graph(root,set())
            (root/usage.POLICY).write_text(json.dumps({'schemaVersion':1,'reviewedInputs':{'old.ts':'hash'}}))
            with patch.object(usage,'reviewed_inputs',return_value={'new.ts':'hash'}):
                with self.assertRaisesRegex(ValueError,'missing or stale'):
                    usage.load_usage_graph(root,set())

    def test_snapshot_detects_new_and_deleted_files_and_normalizes_line_endings(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root/'source.ts').write_bytes(b'const x = 1;\r\n')
            mocked = subprocess.CompletedProcess([],0,b'source.ts\0',b'')
            with patch.object(usage.subprocess,'run',return_value=mocked):
                first = usage.reviewed_inputs(root)
                (root/'source.ts').write_bytes(b'const x = 1;\n')
                self.assertEqual(first,usage.reviewed_inputs(root))
                (root/'source.ts').unlink()
                with self.assertRaises(FileNotFoundError):
                    usage.reviewed_inputs(root)
            (root/'new.ts').write_text('new source')
            with patch.object(usage.subprocess,'run',return_value=subprocess.CompletedProcess([],0,b'new.ts\0',b'')):
                self.assertNotEqual(first,usage.reviewed_inputs(root))

    def test_parser_rejects_missing_edges_aliases_and_unknown_fields(self):
        valid = '# yarn lockfile v1\n\nfixture@^1:\n  version "1.0.0"\n  resolved "https://registry.npmjs.org/fixture/-/fixture-1.0.0.tgz"\n  integrity sha512-fixture\n'
        invalid = [valid+'  dependencies:\n    missing "^1"\n', valid+'  unsupported "data"\n',valid.replace('fixture@^1:', 'fixture@npm:elsewhere@^1:')]
        with tempfile.TemporaryDirectory() as temp:
            lock = Path(temp)/'yarn.lock'
            lock.write_text(valid)
            self.assertEqual(len(usage.read_yarn_graph(lock)[0]),1)
            for text in invalid:
                lock.write_text(text)
                with self.assertRaises(ValueError):
                    usage.read_yarn_graph(lock)


class GateOutcomeTests(unittest.TestCase):
    def run_case(self, raw_findings, role='check-only', scanner_exit=None, graph_error=None, scanner_error=False):
        repo = Path(__file__).resolve().parents[2]
        graph = usage.classify_graph(*fixture({'checker':role}))
        graph['review'] = {'fixture':True}
        code = (1 if raw_findings else 0) if scanner_exit is None else scanner_exit
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            def scan(*args,**kwargs):
                if scanner_error:
                    raise OSError('scanner unavailable')
                (output/'osv.json').write_text('{}')
                return subprocess.CompletedProcess([],code,'','')
            with contextlib.redirect_stdout(io.StringIO()), patch.object(gate.subprocess,'run',side_effect=scan), \
                    patch.object(gate,'validate_report',return_value=copy.deepcopy(raw_findings)), \
                    patch.object(gate,'query_upstream_commit',return_value=[]), \
                    patch.object(gate,'load_usage_graph',side_effect=graph_error,return_value=graph):
                exit_code = gate.run_gate(repo,output,'fixture')
            return exit_code,json.loads((output/'summary.json').read_text())

    def test_warning_gate_zero_preserves_raw_scanner_one(self):
        code,summary = self.run_case([finding()])
        self.assertEqual((code,summary['scannerExit'],summary['gateExit']),(0,1,0))
        self.assertEqual(summary['status'],'passed-with-warnings')
        self.assertEqual(summary['findings'][0]['id'],'GHSA-fixture')

    def test_production_build_and_unknown_gate_fail(self):
        for role in ('runtime','build','unknown'):
            code,summary = self.run_case([finding()],role)
            self.assertEqual(code,1)
            self.assertEqual(summary['blockingFindings'],1)

    def test_scanner_errors_and_contradictory_exit_fail(self):
        cases = [{'scanner_error':True},{'scanner_exit':2},{'scanner_exit':0}]
        for args in cases:
            code,summary = self.run_case([finding()],**args)
            self.assertEqual(code,1)
            self.assertEqual(summary['status'],'incomplete')

    def test_clean_requires_valid_graph_and_unknown_graph_retains_findings(self):
        code,summary = self.run_case([])
        self.assertEqual((code,summary['status']),(0,'clean'))
        for findings in ([],[finding()]):
            code,summary = self.run_case(findings,graph_error=ValueError('stale graph'))
            self.assertEqual(code,1)
            self.assertEqual(summary['findings'],findings)
            self.assertIn('stale graph',summary['error'])


if __name__ == '__main__':
    unittest.main()
