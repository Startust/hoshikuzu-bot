"""Offline public-API checks for the installed inference-only distribution."""
import importlib.metadata
import inspect
from pathlib import Path
import socket
import unittest
from unittest.mock import patch


class InferenceContractTests(unittest.TestCase):
    def test_optional_training_ui_are_absent_and_marked_optional(self):
        from packaging.requirements import Requirement
        dist = importlib.metadata.distribution('voxcpm')
        self.assertEqual(dist.version, '2.0.3+hoshikuzu.1')
        for name in ('datasets', 'gradio', 'spaces'):
            with self.assertRaises(importlib.metadata.PackageNotFoundError):
                importlib.metadata.distribution(name)
            requirement = next(Requirement(r) for r in dist.requires if Requirement(r).name == name)
            self.assertIsNotNone(requirement.marker)
            self.assertFalse(requirement.marker.evaluate({'extra': ''}))
            self.assertTrue(requirement.marker.evaluate({'extra': 'training' if name == 'datasets' else 'webui'}))

    def test_inference_api_imports_without_network_or_optional_extras(self):
        with patch.object(socket.socket, 'connect', side_effect=AssertionError('Network forbidden')):
            from voxcpm import VoxCPM
            from voxcpm.model.voxcpm import LoRAConfig, VoxCPMModel
            from voxcpm.model.voxcpm2 import VoxCPM2Model
            from voxcpm.utils.text_normalize import TextNormalizer
            self.assertTrue(callable(VoxCPM.from_pretrained))
            self.assertTrue(callable(VoxCPM.generate_streaming))
            parameters = inspect.signature(VoxCPM._generate).parameters
            for name in ('reference_wav_path', 'prompt_wav_path', 'prompt_text', 'normalize'):
                self.assertIn(name, parameters)
            self.assertTrue(callable(VoxCPMModel.from_local))
            self.assertTrue(callable(VoxCPM2Model.from_local))
            self.assertIsNotNone(LoRAConfig())
            self.assertIsNotNone(TextNormalizer)


if __name__ == '__main__':
    unittest.main()
