"""Offline tests: copy the module to a fixture root, block connections and mock I/O."""
import importlib.util
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

import numpy as np
import soundfile as sf


class PronunciationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        source = Path(__file__).resolve().parents[1] / "generate_pronunciations.py"
        target = Path(cls.temp.name) / "local-tts" / source.name
        target.parent.mkdir()
        shutil.copyfile(source, target)
        cls.env = patch.dict(os.environ, {
            "LOCAL_TTS_JAPANESE_READING": "0",
            "LOCAL_TTS_REFERENCE_WAV": "",
            "LOCAL_TTS_PUBLIC_BASE_URL": "https://example.invalid/audio",
            "LOCAL_TTS_AWS_PROFILE": "test-only",
        }, clear=True)
        cls.env.start()
        cls.socket_guard = patch.object(socket.socket, "connect", side_effect=AssertionError("network forbidden"))
        cls.socket_guard.start()
        cls.process_guard = patch.object(subprocess, "run", side_effect=AssertionError("subprocess forbidden"))
        cls.process_guard.start()
        spec = importlib.util.spec_from_file_location("tts_fixture", target)
        cls.module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = cls.module
        with patch("dotenv.load_dotenv"), patch("dotenv.dotenv_values", return_value={}):
            spec.loader.exec_module(cls.module)
        cls.db_guard = patch.object(cls.module.mysql.connector, "connect", side_effect=AssertionError("database forbidden"))
        cls.db_guard.start()

    @classmethod
    def tearDownClass(cls):
        cls.db_guard.stop()
        cls.process_guard.stop()
        cls.socket_guard.stop()
        cls.env.stop()
        cls.temp.cleanup()

    def test_multilingual_input_and_candidate(self):
        m = self.module
        self.assertEqual(m.to_tts_text("张伟"), "{zhang1} {wei3}")
        self.assertEqual(m.to_tts_text("テスト"), "テスト")
        self.assertEqual(m.to_tts_text("한글"), "한글")
        self.assertEqual(m.strip_decorative_edges("0o泡泡糖o0"), "泡泡糖")
        self.assertIsNone(m.build_candidate("!!!"))
        self.assertIsNone(m.build_candidate("x" * 161))
        first = m.build_candidate("../Player")
        second = m.build_candidate("../Player")
        self.assertEqual(first.source_hash, second.source_hash)
        self.assertEqual(first.path.parent, m.AUDIO_DIR)
        self.assertNotIn("/", first.filename)
        self.assertIn("?v=" + first.source_hash[:12], first.url)

    def test_normalization_and_wav_generation_use_only_fake_model(self):
        m = self.module
        audio = m.normalize_audio([0.0, 10.0, -10.0])
        self.assertTrue(np.isfinite(audio).all())
        self.assertLessEqual(float(np.max(np.abs(audio))), m.PEAK_LIMIT + 1e-6)
        self.assertEqual(m.normalize_audio([]).size, 0)
        model = MagicMock()
        model.tts_model.sample_rate = 24000
        model.generate.return_value = np.array([0.0, 0.1, -0.1], dtype=np.float32)
        item = m.build_candidate("FixtureAudio")
        m.generate_audio(model, item)
        decoded, rate = sf.read(item.path)
        self.assertEqual(rate, 24000)
        self.assertEqual(len(decoded), 3)
        self.assertFalse(item.path.with_suffix(".tmp.wav").exists())
        m.generate_audio(model, item)
        model.generate.assert_called_once()

    def test_database_writes_remain_parameterized(self):
        m = self.module
        conn = MagicMock()
        item = m.build_candidate("O'Reilly")
        m.upsert_success(conn, item)
        sql, params = conn.cursor.return_value.execute.call_args.args
        self.assertNotIn(item.username, sql)
        self.assertEqual(params[0], item.username)
        self.assertEqual(params[1], item.url)
        m.upsert_failure(conn, item.username, "e" * 5000)
        self.assertEqual(len(conn.cursor.return_value.execute.call_args.args[1][1]), 4096)

    def test_upload_command_is_mocked_and_errors_are_propagated(self):
        m = self.module
        item = m.build_candidate("UploadFixture")
        with patch.object(m, "S3_BUCKET", "test-only-bucket"), patch.object(m.subprocess, "run") as run:
            run.return_value = subprocess.CompletedProcess([], 0, "", "")
            m.upload_audio(item)
            args = run.call_args.args[0]
            self.assertIn("s3://test-only-bucket/audio/" + item.filename, args)
            self.assertEqual(args[-2:], ["--profile", "test-only"])
            self.assertNotIn("shell", run.call_args.kwargs)
            run.return_value = subprocess.CompletedProcess([], 1, "", "fixture failure")
            with self.assertRaisesRegex(RuntimeError, "fixture failure"):
                m.upload_audio(item)

    def test_batch_aborts_transient_gpu_errors_and_closes_fake_connection(self):
        m = self.module
        conn = MagicMock()
        with patch.object(m, "connect", return_value=conn), patch.object(m, "ensure_table"), patch.object(m, "fetch_names", return_value=["First", "Second"]), patch.object(m, "load_model", return_value=MagicMock()), patch.object(m, "generate_audio", side_effect=RuntimeError("CUDA out of memory")) as generate, patch.object(m, "upload_audio") as upload, patch.object(m, "upsert_failure") as failure:
            self.assertEqual(m.main(), 3)
            generate.assert_called_once()
            upload.assert_not_called()
            failure.assert_not_called()
            conn.close.assert_called_once()


if __name__ == "__main__":
    unittest.main()
