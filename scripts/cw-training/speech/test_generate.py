"""Exercise offline generation and billing-sensitive failure boundaries without API calls."""
import argparse
from array import array
import copy
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import urllib.error
import wave

import generate as speech

GENERATOR = {
    'engine': 'elevenlabs',
    'model': 'eleven_v4',
    'voice': 'testVoice',
    'language': 'en',
    'voiceSettings': {'stability': 0.75, 'similarity_boost': 0.75},
}


def pcm_audio():
    samples = array('h', [0] * 1000 + [5000, -10000] * 2000 + [0] * 2500)
    if sys.byteorder != 'little':
        samples.byteswap()
    return samples.tobytes()


def response(content=None, content_type='audio/pcm'):
    stream = io.BytesIO(pcm_audio() if content is None else content)
    stream.headers = {'Content-Type': content_type, 'request-id': 'request123', 'character-cost': '1'}
    return stream


def http_error(code, status=None):
    body = {'detail': {'status': status, 'message': 'never expose test-secret'}}
    return urllib.error.HTTPError('https://api.elevenlabs.io', code, 'test-secret', {'Retry-After': '999'}, io.BytesIO(json.dumps(body).encode()))


class AudioTests(unittest.TestCase):
    def test_pcm_becomes_trimmed_normalized_client_wav(self):
        with wave.open(io.BytesIO(speech.pcm_to_wav(pcm_audio())), 'rb') as audio:
            self.assertEqual((audio.getnchannels(), audio.getsampwidth(), audio.getframerate()), (1, 2, 22050))
            self.assertLess(audio.getnframes(), len(pcm_audio()) / 2)
            decoded = array('h')
            decoded.frombytes(audio.readframes(audio.getnframes()))
            if sys.byteorder != 'little':
                decoded.byteswap()
        self.assertAlmostEqual(max(abs(sample) for sample in decoded) / 32768, 0.8, places=4)
        first = next(index for index, sample in enumerate(decoded) if sample)
        last = max(index for index, sample in enumerate(decoded) if sample)
        self.assertAlmostEqual(first / 22050, 0.03, places=3)
        self.assertAlmostEqual((len(decoded) - last - 1) / 22050, 0.08, places=3)

    def test_rejects_empty_malformed_silent_and_overlong_audio(self):
        for pcm in (b'', b'\x00', bytes(4000), bytes(speech.MAX_PCM_BYTES + 2)):
            with self.subTest(length=len(pcm)), self.assertRaises(speech.GenerationError):
                speech.pcm_to_wav(pcm)


class RequestTests(unittest.TestCase):
    def test_posts_only_authored_text_and_manifest_settings(self):
        with patch.dict('os.environ', {'ELEVENLABS_API_KEY': 'test-secret'}), patch.object(speech.urllib.request, 'urlopen', return_value=response()) as open_url:
            pcm, metadata = speech.request_elevenlabs(GENERATOR, 'weather')
        request = open_url.call_args.args[0]
        self.assertEqual(request.method, 'POST')
        self.assertTrue(request.full_url.endswith('/testVoice?output_format=pcm_22050'))
        self.assertEqual(json.loads(request.data), {
            'text': 'weather', 'model_id': 'eleven_v4', 'language_code': 'en',
            'voice_settings': GENERATOR['voiceSettings'],
        })
        self.assertEqual(pcm, pcm_audio())
        self.assertEqual(metadata, {'sha256': hashlib.sha256(pcm).hexdigest(), 'requestId': 'request123', 'characterCost': 1})

    def test_missing_key_does_not_send_request(self):
        with patch.dict('os.environ', {}, clear=True), patch.object(speech.urllib.request, 'urlopen') as open_url:
            with self.assertRaisesRegex(speech.GenerationError, 'ELEVENLABS_API_KEY'):
                speech.request_elevenlabs(GENERATOR, 'weather')
        open_url.assert_not_called()

    def test_invalid_key_never_reaches_transport_and_outer_whitespace_is_trimmed(self):
        for key in ('test-secret\ncopied', 'test-secret\rcopied', 'test-secret\tcopied', 'test-secret copied', 'test-secret\x01', 'test-secreté'):
            with self.subTest(key_length=len(key)), patch.dict('os.environ', {'ELEVENLABS_API_KEY': key}), patch.object(speech.urllib.request, 'urlopen') as open_url:
                with self.assertRaises(speech.GenerationError) as caught:
                    speech.request_elevenlabs(GENERATOR, 'weather')
                self.assertNotIn('test-secret', str(caught.exception))
                open_url.assert_not_called()
        with patch.dict('os.environ', {'ELEVENLABS_API_KEY': ' \ntest-secret\n '}), patch.object(speech.urllib.request, 'urlopen', return_value=response()) as open_url:
            speech.request_elevenlabs(GENERATOR, 'weather')
            self.assertEqual(open_url.call_args.args[0].get_header('Xi-api-key'), 'test-secret')

    def test_authentication_quota_and_uncertain_failures_do_not_retry_or_expose_secrets(self):
        errors = [http_error(401), http_error(403), http_error(429, 'quota_exceeded'), http_error(500), urllib.error.URLError('test-secret'), TimeoutError('test-secret'), ValueError("Invalid header value b'test-secret'"), UnicodeEncodeError('ascii', 'test-secreté', 11, 12, 'invalid header')]
        for error in errors:
            with self.subTest(error=type(error).__name__), patch.dict('os.environ', {'ELEVENLABS_API_KEY': 'test-secret'}), patch.object(speech.urllib.request, 'urlopen', side_effect=error) as open_url, patch.object(speech.time, 'sleep') as sleep:
                with self.assertRaises(speech.GenerationError) as caught:
                    speech.request_elevenlabs(GENERATOR, 'weather')
                self.assertNotIn('test-secret', str(caught.exception))
                self.assertEqual(open_url.call_count, 1)
                sleep.assert_not_called()

    def test_rate_limit_retries_are_bounded_and_wait_is_capped(self):
        with patch.dict('os.environ', {'ELEVENLABS_API_KEY': 'test-secret'}), patch.object(speech.urllib.request, 'urlopen', side_effect=[http_error(429), response()]) as open_url, patch.object(speech.time, 'sleep') as sleep:
            speech.request_elevenlabs(GENERATOR, 'weather')
            self.assertEqual(open_url.call_count, 2)
            sleep.assert_called_once_with(5)
        with patch.dict('os.environ', {'ELEVENLABS_API_KEY': 'test-secret'}), patch.object(speech.urllib.request, 'urlopen', side_effect=[http_error(429) for _ in range(3)]) as open_url, patch.object(speech.time, 'sleep'):
            with self.assertRaisesRegex(speech.GenerationError, 'three attempts'):
                speech.request_elevenlabs(GENERATOR, 'weather')
            self.assertEqual(open_url.call_count, 3)

    def test_bad_audio_response_is_not_retried(self):
        wrapped = speech.pcm_to_wav(pcm_audio())
        for result in (response(b''), response(b'odd'), response(content_type='audio/mpeg'), response(wrapped, 'application/octet-stream'), response(wrapped, '')):
            with patch.dict('os.environ', {'ELEVENLABS_API_KEY': 'test-secret'}), patch.object(speech.urllib.request, 'urlopen', return_value=result) as open_url:
                with self.assertRaises(speech.GenerationError):
                    speech.request_elevenlabs(GENERATOR, 'weather')
                self.assertEqual(open_url.call_count, 1)


class GenerationTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.manifest = self.root / 'manifest.json'
        self.index = self.root / 'public/audio/cw-training/words/index.json'
        self.entry = {'word': 'WX', 'pronunciation': 'weather', 'path': 'public/audio/cw-training/words/wx.wav'}
        self.document = {'version': 1, 'generator': copy.deepcopy(GENERATOR), 'words': [self.entry]}
        self.write_manifest()
        for name, value in (('ROOT', self.root), ('MANIFEST', self.manifest), ('INDEX', self.index)):
            patcher = patch.object(speech, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def write_manifest(self):
        self.manifest.write_text(json.dumps(self.document))

    def run_generate(self, **changes):
        args = {'provider': 'elevenlabs', 'word': None, 'force': False, 'dry_run': False}
        args.update(changes)
        with patch('sys.stdout', new=io.StringIO()) as output:
            speech.generate(argparse.Namespace(**args))
            return output.getvalue()

    def test_skips_unchanged_and_restores_cached_response_without_credentials(self):
        with patch.dict('os.environ', {}, clear=True), patch.object(speech, 'request_elevenlabs', return_value=(pcm_audio(), {'requestId': 'request123', 'characterCost': 1, 'key': 'never-store'})) as request:
            self.run_generate()
            written = json.loads(self.index.read_text())['clips']['WX']
            target = self.root / self.entry['path']
            self.assertEqual(written['sha256'], speech.digest(target))
            self.assertEqual(written['characterCost'], 1)
            self.run_generate()
            target.unlink()
            self.run_generate()
            self.assertEqual(request.call_count, 1)
            self.assertEqual(written['sha256'], speech.digest(target))
            cache = speech.elevenlabs_cache_paths(written['inputHash'])[1]
            self.assertNotIn('never-store', cache.read_text())
            self.run_generate(force=True)
            self.assertEqual(request.call_count, 2)

    def test_dry_run_makes_no_request_or_writes_even_with_unfinished_receipt(self):
        with patch.object(speech, 'request_elevenlabs') as request:
            self.assertIn('1 ElevenLabs requests', self.run_generate(dry_run=True))
            self.assertFalse(self.index.exists())
            fingerprint = speech.input_fingerprint(GENERATOR, self.entry)
            raw, receipt = speech.elevenlabs_cache_paths(fingerprint)
            raw.parent.mkdir(parents=True)
            raw.write_bytes(pcm_audio())
            self.assertIn('0 ElevenLabs requests', self.run_generate(dry_run=True))
            self.assertFalse(receipt.exists())
            self.assertFalse((self.root / self.entry['path']).exists())
            request.assert_not_called()

    def test_rejects_all_invalid_paths_before_first_request(self):
        self.document['words'].append({'word': 'BAD', 'pronunciation': 'bad', 'path': '../../outside.wav'})
        self.write_manifest()
        with patch.object(speech, 'request_elevenlabs') as request:
            with self.assertRaisesRegex(speech.GenerationError, 'Invalid output path'):
                self.run_generate()
            request.assert_not_called()
        self.document['words'][1]['path'] = self.entry['path']
        self.write_manifest()
        with self.assertRaisesRegex(speech.GenerationError, 'unique'):
            self.run_generate()

    def test_received_audio_survives_output_failure_without_another_api_call(self):
        original_write = speech.atomic_write

        def interrupted_write(path, content):
            if path.suffix == '.wav':
                raise OSError('simulated disk failure')
            original_write(path, content)

        with patch.object(speech, 'request_elevenlabs', return_value=(pcm_audio(), {})) as request:
            with patch.object(speech, 'atomic_write', side_effect=interrupted_write):
                with self.assertRaises(OSError):
                    self.run_generate()
            self.run_generate()
            self.assertEqual(request.call_count, 1)
        self.assertTrue(self.index.exists())

    def test_provider_mismatch_unknown_selection_and_corrupt_cache_fail_without_api(self):
        with patch.object(speech, 'request_elevenlabs') as request:
            for changes in ({'provider': 'kokoro'}, {'word': ['UNKNOWN']}):
                with self.assertRaises(speech.GenerationError):
                    self.run_generate(**changes)
            fingerprint = speech.input_fingerprint(GENERATOR, self.entry)
            speech.cache_elevenlabs_response(fingerprint, pcm_audio(), {})
            speech.elevenlabs_cache_paths(fingerprint)[0].write_bytes(b'corrupt')
            with self.assertRaisesRegex(speech.GenerationError, 'checksum'):
                self.run_generate()
            request.assert_not_called()

    def test_cached_wave_containers_are_rejected_before_output_or_new_requests(self):
        wrapped = speech.pcm_to_wav(pcm_audio())
        fingerprint = speech.input_fingerprint(GENERATOR, self.entry)
        source, receipt = speech.elevenlabs_cache_paths(fingerprint)
        source.parent.mkdir(parents=True)
        for signature in (b'RIFF', b'RF64', b'RIFX'):
            container = signature + wrapped[4:]
            source.write_bytes(container)
            receipt.write_text(json.dumps({'sha256': hashlib.sha256(container).hexdigest()}))
            with self.subTest(signature=signature), patch.object(speech, 'request_elevenlabs') as request:
                with self.assertRaisesRegex(speech.GenerationError, 'WAVE container'):
                    self.run_generate()
                request.assert_not_called()
                self.assertFalse((self.root / self.entry['path']).exists())
                self.assertFalse(self.index.exists())

    def test_kokoro_keeps_its_existing_fingerprint_and_skips_without_inference(self):
        generator = {'engine': 'kokoro-onnx', 'model': 'kokoro-v1.0.onnx', 'voice': 'af_heart', 'language': 'en-us', 'speed': 1}
        self.document['generator'] = generator
        self.write_manifest()
        path = self.root / self.entry['path']
        path.parent.mkdir(parents=True)
        path.write_bytes(b'existing clip')
        legacy_fingerprint = hashlib.sha256(json.dumps({'recipe': 1, 'generator': generator, 'entry': self.entry}, sort_keys=True).encode()).hexdigest()
        self.index.write_text(json.dumps({'version': 1, 'clips': {'WX': {'inputHash': legacy_fingerprint, 'sha256': speech.digest(path)}}}))
        self.assertEqual(speech.input_fingerprint(generator, self.entry), legacy_fingerprint)
        with patch.object(speech, 'model_file') as model_file:
            self.assertIn('0 clips need writing', self.run_generate(provider='kokoro', dry_run=True))
            model_file.assert_not_called()

    def test_symlink_cannot_redirect_assets_outside_repository(self):
        outside = tempfile.TemporaryDirectory()
        self.addCleanup(outside.cleanup)
        public = self.root / 'public'
        public.mkdir()
        (public / 'audio').symlink_to(outside.name, target_is_directory=True)
        with patch.object(speech, 'request_elevenlabs') as request:
            with self.assertRaisesRegex(speech.GenerationError, 'inside the repository'):
                self.run_generate()
            request.assert_not_called()


if __name__ == '__main__':
    unittest.main()
