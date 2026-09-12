import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'
sys.path.insert(0, str(SCRIPTS))
import create_example
import doctor


class PortableVoiceSetupTests(unittest.TestCase):
    def test_native_health_check_needs_no_preset_catalog(self):
        with tempfile.TemporaryDirectory() as folder:
            seen = []
            def respond(url, timeout):
                seen.append(url)
                return io.BytesIO(json.dumps({'status': 'ok', 'sample_rate': 24000}).encode())
            with patch.object(doctor, 'urlopen', side_effect=respond), patch.object(doctor.shutil, 'which', return_value='/tool'):
                result = doctor.inspect_environment(Path(folder), breeze_server='http://chosen-host:7860')
            self.assertEqual(seen, ['http://chosen-host:7860/health'])
            self.assertEqual(result['status'], 'READY')
            self.assertEqual(result['voice']['api'], 'breeze-native')

    def test_native_health_loading_is_not_reported_ready(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch.object(doctor, 'urlopen', return_value=io.BytesIO(b'{"status":"loading"}')), patch.object(doctor.shutil, 'which', return_value='/tool'):
                result = doctor.inspect_environment(Path(folder), breeze_server='http://chosen-host')
            self.assertEqual(result['status'], 'BLOCKED')
            self.assertIn('BREEZE_NOT_READY', [item['code'] for item in result['blockers']])

    def run_example(self, argv):
        with patch.object(sys, 'argv', ['create_example.py', *argv]), contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            return create_example.main()

    def test_prepare_only_needs_no_model_or_voice(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(create_example.subprocess, 'run') as run:
            output = Path(folder).resolve() / 'lesson'
            self.assertEqual(self.run_example(['--workspace', str(output), '--prepare-only']), 0)
            run.assert_not_called()
            self.assertTrue((output / 'lesson.json').is_file())
            self.assertFalse((output / 'voices').exists())

    def test_designs_one_reference_then_reuses_it_for_all_sections(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(create_example.subprocess, 'run') as run:
            output = Path(folder).resolve() / 'lesson'
            self.assertEqual(self.run_example(['--workspace', str(output), '--server', 'http://selected:7860', '--voice-description', 'An even, clear narrator']), 0)
            commands = [call.args[0] for call in run.call_args_list]
            synthesis = [cmd for cmd in commands if str(SCRIPTS / 'narrate.py') in cmd]
            self.assertGreater(len(synthesis), 1)
            self.assertIn('--voice-description', synthesis[0])
            for command in synthesis:
                self.assertEqual(command[command.index('--provider') + 1], 'breeze-api')
                self.assertNotIn('--voice', command)
                self.assertIn('http://selected:7860', command)
            for command in synthesis[1:]:
                self.assertEqual(command[command.index('--reference-audio') + 1], str(output / 'voices/narrator.wav'))
                self.assertEqual(command[command.index('--reference-text-file') + 1], str(output / 'voices/narrator.txt'))
            self.assertIn(str(output / 'voices/narrator.aligned.json'), commands[1])

    def test_user_reference_skips_design_and_is_forwarded(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(create_example.subprocess, 'run') as run:
            root = Path(folder).resolve()
            reference = root / 'my-voice.wav'; reference.write_bytes(b'fixture')
            transcript = root / 'my-voice.txt'; transcript.write_text('An exact transcript.')
            output = root / 'lesson'
            self.assertEqual(self.run_example(['--workspace', str(output), '--reference-audio', str(reference), '--reference-text-file', str(transcript)]), 0)
            synthesis = [call.args[0] for call in run.call_args_list if str(SCRIPTS / 'narrate.py') in call.args[0]]
            self.assertFalse((output / 'voices').exists())
            for command in synthesis:
                self.assertIn(str(reference), command)
                self.assertIn(str(transcript), command)

    def test_legacy_provider_requires_an_explicit_voice_before_writes(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder).resolve() / 'lesson'
            with self.assertRaises(SystemExit) as error:
                self.run_example(['--workspace', str(output), '--provider', 'breeze'])
            self.assertEqual(error.exception.code, 2)
            self.assertFalse(output.exists())


if __name__ == '__main__':
    unittest.main()
