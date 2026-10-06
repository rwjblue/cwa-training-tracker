"""Generate checked-in word answers with Kokoro or offline ElevenLabs requests."""
import argparse
from array import array
import hashlib
import http.client
import io
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import wave

ROOT = Path(__file__).resolve().parents[3]
MANIFEST = ROOT / 'data/cw-training/word-speech.json'
INDEX = ROOT / 'public/audio/cw-training/words/index.json'
SAMPLE_RATE = 22050
MAX_PCM_BYTES = SAMPLE_RATE * 2 * 10
MODELS = {
    'kokoro-v1.0.onnx': 'beb0d1848dee9a49da392cc3df26958d46cfa35d321edf434f52949153f0df3a',
    'voices-v1.0.bin': 'bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d',
}


class GenerationError(ValueError):
    """An actionable error that never includes authentication or response bodies."""


def digest(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def atomic_write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=f'.{path.name}.', delete=False) as output:
            temporary = Path(output.name)
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        temporary.replace(path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def write_json(path, content):
    atomic_write(path, (json.dumps(content, indent=2, sort_keys=True) + '\n').encode())


def input_fingerprint(generator, entry, provider=None):
    provider = provider or generator['engine']
    # Keep the original Kokoro recipe compatible; ElevenLabs has its own PCM recipe.
    recipe = 1 if provider == 'kokoro-onnx' else 2
    inputs = {'recipe': recipe, 'generator': generator, 'entry': entry}
    return hashlib.sha256(json.dumps(inputs, sort_keys=True).encode()).hexdigest()


def validate_generator(generator, provider=None):
    if not isinstance(generator, dict):
        raise GenerationError('Manifest generator must be an object.')
    provider = provider or generator.get('engine')
    if provider == 'kokoro':
        provider = 'kokoro-onnx'
    if generator.get('engine') != provider:
        raise GenerationError('Requested provider must match the manifest generator engine.')
    if provider == 'kokoro-onnx':
        if generator.get('model') not in MODELS:
            raise GenerationError('Unsupported Kokoro model.')
        return provider
    if provider != 'elevenlabs':
        raise GenerationError('Unsupported speech provider.')
    for field in ('model', 'voice'):
        if not isinstance(generator.get(field), str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', generator[field]):
            raise GenerationError(f'ElevenLabs {field} must be a valid identifier.')
    if not isinstance(generator.get('language'), str) or not re.fullmatch(r'[a-z]{2}', generator['language']):
        raise GenerationError('ElevenLabs language must be a two-letter language code.')
    settings = generator.get('voiceSettings', {})
    if not isinstance(settings, dict) or set(settings) - {'stability', 'similarity_boost', 'style', 'speed', 'use_speaker_boost'}:
        raise GenerationError('Unsupported ElevenLabs voice settings.')
    for name, value in settings.items():
        if name == 'use_speaker_boost':
            valid = isinstance(value, bool)
        else:
            bounds = (0.7, 1.2) if name == 'speed' else (0, 1)
            valid = isinstance(value, (float, int)) and not isinstance(value, bool) and math.isfinite(value) and bounds[0] <= value <= bounds[1]
        if not valid:
            raise GenerationError(f'Invalid ElevenLabs voice setting: {name}.')
    return provider


def validate_pcm(pcm):
    if not pcm or len(pcm) % 2 or len(pcm) > MAX_PCM_BYTES:
        raise GenerationError('ElevenLabs returned empty, malformed, or overlong PCM audio; no automatic retry was made.')
    if len(pcm) >= 12 and pcm[:4] in (b'RIFF', b'RF64', b'RIFX') and pcm[8:12] == b'WAVE':
        raise GenerationError('ElevenLabs returned a WAVE container instead of raw PCM audio; no automatic retry was made.')
    samples = array('h')
    samples.frombytes(pcm)
    if sys.byteorder != 'little':
        samples.byteswap()
    return samples


def pcm_to_wav(pcm):
    """Trim and normalize pcm_22050 into the exact WAV format the client accepts."""
    samples = validate_pcm(pcm)
    audible = [index for index, sample in enumerate(samples) if abs(sample) > 0.003 * 32768]
    if not audible:
        raise GenerationError('ElevenLabs returned silent audio; no automatic retry was made.')
    samples = samples[max(0, audible[0] - int(SAMPLE_RATE * .03)):min(len(samples), audible[-1] + int(SAMPLE_RATE * .08))]
    peak = max(abs(sample) for sample in samples)
    normalized = array('h', (round(sample * (0.8 * 32768 / peak)) for sample in samples))
    if sys.byteorder != 'little':
        normalized.byteswap()
    result = io.BytesIO()
    with wave.open(result, 'wb') as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(normalized.tobytes())
    return result.getvalue()


def request_elevenlabs(generator, text):
    """One TTS request, retrying only an explicit rate-limit rejection (at most twice)."""
    validate_generator(generator, 'elevenlabs')
    if not isinstance(text, str) or not text.strip() or len(text) > 400:
        raise GenerationError('Speech pronunciation must contain between 1 and 400 characters.')
    api_key = os.environ.get('ELEVENLABS_API_KEY', '').strip()
    if not api_key:
        raise GenerationError('Set ELEVENLABS_API_KEY before generating ElevenLabs audio.')
    if not re.fullmatch(r'[\x21-\x7e]+', api_key):
        raise GenerationError('ELEVENLABS_API_KEY must contain only visible ASCII characters without embedded whitespace.')
    payload = {
        'text': text,
        'model_id': generator['model'],
        'language_code': generator['language'],
        'voice_settings': generator.get('voiceSettings', {}),
    }
    url = f'https://api.elevenlabs.io/v1/text-to-speech/{generator["voice"]}?output_format=pcm_22050'
    request = urllib.request.Request(url, data=json.dumps(payload).encode(), method='POST', headers={
        'xi-api-key': api_key,
        'Content-Type': 'application/json',
        'Accept': 'audio/pcm',
    })
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                content_type = response.headers.get('Content-Type', '').split(';', 1)[0].lower()
                if content_type not in ('', 'audio/pcm', 'audio/x-pcm', 'application/octet-stream'):
                    raise GenerationError('ElevenLabs returned an unexpected audio response; no automatic retry was made.')
                pcm = response.read(MAX_PCM_BYTES + 1)
                validate_pcm(pcm)
                metadata = {'sha256': hashlib.sha256(pcm).hexdigest()}
                request_id = response.headers.get('request-id')
                if request_id and re.fullmatch(r'[A-Za-z0-9_-]{1,200}', request_id):
                    metadata['requestId'] = request_id
                character_cost = response.headers.get('character-cost', '')
                if re.fullmatch(r'\d+(?:\.\d+)?', character_cost):
                    metadata['characterCost'] = float(character_cost)
                return pcm, metadata
        except urllib.error.HTTPError as error:
            if error.code != 429:
                error.close()
            if error.code in (401, 403):
                raise GenerationError('ElevenLabs rejected authentication or voice access. Check the API key permissions and voice availability.') from None
            if error.code == 429:
                # Inspect only the structured status to distinguish quota from rate limiting.
                try:
                    detail = json.loads(error.read(4096)).get('detail', {})
                    status = detail.get('status') if isinstance(detail, dict) else None
                except (ValueError, AttributeError, OSError, http.client.HTTPException):
                    status = None
                finally:
                    error.close()
                if status in ('quota_exceeded', 'insufficient_quota', 'payment_required'):
                    raise GenerationError('ElevenLabs generation quota is exhausted; no retry was made.') from None
                if attempt < 2:
                    delay = error.headers.get('Retry-After', '') if error.headers else ''
                    delay = min(5, max(1, float(delay))) if re.fullmatch(r'\d+(?:\.\d+)?', delay) else 2 ** attempt
                    time.sleep(delay)
                    continue
                raise GenerationError('ElevenLabs rate limit persisted after three attempts. Completed responses are cached; rerun later.') from None
            raise GenerationError(f'ElevenLabs rejected the request (HTTP {error.code}); no automatic retry was made.') from None
        except GenerationError:
            raise
        except (urllib.error.URLError, TimeoutError, OSError, http.client.HTTPException, ValueError):
            raise GenerationError('ElevenLabs request did not complete. No automatic retry was made because generation may have been charged; inspect usage before rerunning.') from None


def elevenlabs_cache_paths(fingerprint):
    if not re.fullmatch(r'[0-9a-f]{64}', fingerprint):
        raise GenerationError('Invalid speech cache fingerprint.')
    base = ROOT / '.tmp/cw-speech/elevenlabs' / fingerprint
    return base.with_suffix('.pcm'), base.with_suffix('.json')


def cache_elevenlabs_response(fingerprint, pcm, metadata):
    """Retain received synthesis before postprocessing, including approved auditions."""
    validate_pcm(pcm)
    source, receipt = elevenlabs_cache_paths(fingerprint)
    # Only whitelisted provenance is stored; neither headers nor credentials are saved.
    safe = {'sha256': hashlib.sha256(pcm).hexdigest()}
    request_id = metadata.get('requestId')
    if isinstance(request_id, str) and re.fullmatch(r'[A-Za-z0-9_-]{1,200}', request_id):
        safe['requestId'] = request_id
    character_cost = metadata.get('characterCost')
    if isinstance(character_cost, (int, float)) and not isinstance(character_cost, bool) and math.isfinite(character_cost) and character_cost >= 0:
        safe['characterCost'] = character_cost
    atomic_write(source, pcm)
    write_json(receipt, safe)


def cached_elevenlabs_response(fingerprint, repair=True):
    source, receipt = elevenlabs_cache_paths(fingerprint)
    if not source.exists() and not receipt.exists():
        return None
    if not source.exists() or not receipt.exists():
        # A received raw response survives even if its receipt write was interrupted.
        if source.exists():
            pcm = source.read_bytes()
            validate_pcm(pcm)
            if repair:
                cache_elevenlabs_response(fingerprint, pcm, {})
            return pcm, {'sha256': hashlib.sha256(pcm).hexdigest()}
        raise GenerationError('Speech cache is incomplete. Inspect it before using --force to request replacement audio.')
    pcm = source.read_bytes()
    try:
        metadata = json.loads(receipt.read_text())
    except (ValueError, OSError):
        raise GenerationError('Speech cache receipt is invalid. Inspect it before using --force to request replacement audio.') from None
    if not isinstance(metadata, dict) or metadata.get('sha256') != hashlib.sha256(pcm).hexdigest():
        raise GenerationError('Speech cache checksum differs. Inspect it before using --force to request replacement audio.')
    validate_pcm(pcm)
    return pcm, metadata


def model_file(name):
    path = ROOT / '.tmp/cw-speech' / name
    if path.exists() and digest(path) == MODELS[name]:
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    print(f'Downloading {name} (cached locally, never published)', flush=True)
    url = f'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/{name}'
    temporary = path.with_suffix('.download')
    urllib.request.urlretrieve(url, temporary)
    if digest(temporary) != MODELS[name]:
        temporary.unlink()
        raise GenerationError(f'Checksum mismatch for {name}')
    temporary.replace(path)
    return path


def kokoro_wav(engine, generator, entry):
    import numpy as np
    import soundfile as sf
    samples, rate = engine.create(entry.get('phonemes', entry['pronunciation']), voice=generator['voice'], speed=generator['speed'], lang=generator['language'], is_phonemes='phonemes' in entry)
    audible = np.flatnonzero(np.abs(samples) > 0.003)
    if audible.size == 0:
        raise GenerationError(f'Empty speech for {entry["word"]}')
    samples = samples[max(0, audible[0] - int(rate * .03)):min(len(samples), audible[-1] + int(rate * .08))]
    samples = samples * (0.8 / max(float(np.max(np.abs(samples))), 0.001))
    with tempfile.TemporaryDirectory() as directory:
        source = Path(directory) / 'speech.wav'
        result = Path(directory) / 'result.wav'
        sf.write(source, samples, rate, subtype='PCM_16')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(source), '-ar', str(SAMPLE_RATE), '-ac', '1', '-c:a', 'pcm_s16le', '-map_metadata', '-1', str(result)], check=True)
        return result.read_bytes()


def generate(args):
    manifest = json.loads(MANIFEST.read_text())
    generator = manifest['generator']
    provider = validate_generator(generator, args.provider)
    words = manifest['words']
    if not isinstance(words, list) or not words or any(not isinstance(entry, dict) for entry in words):
        raise GenerationError('Manifest words must be a nonempty list of entries.')
    public = (ROOT / 'public').resolve()
    destination = (public / 'audio/cw-training/words').resolve()
    if not public.is_relative_to(ROOT.resolve()) or not destination.is_relative_to(public):
        raise GenerationError('Speech asset directory must stay inside the repository public directory.')
    paths = []
    for entry in words:
        if not isinstance(entry.get('word'), str) or not entry['word'] or not isinstance(entry.get('pronunciation'), str) or not entry['pronunciation'].strip() or len(entry['pronunciation']) > 400:
            raise GenerationError('Each manifest word must have a word and bounded pronunciation.')
        if not isinstance(entry.get('path'), str) or Path(entry['path']).is_absolute():
            raise GenerationError('Each manifest word must have an output path.')
        path = (ROOT / entry['path']).resolve()
        if not path.is_relative_to(destination) or path.suffix != '.wav':
            raise GenerationError(f'Invalid output path: {entry["path"]}')
        paths.append(path)
    if len({entry['word'] for entry in words}) != len(words) or len(set(paths)) != len(paths):
        raise GenerationError('Manifest words and paths must be unique.')
    requested = {word.upper() for word in args.word} if args.word else None
    if requested and requested - {entry['word'] for entry in words}:
        raise GenerationError('Requested word is not in the manifest.')
    index = json.loads(INDEX.read_text()) if INDEX.exists() else {'version': 1, 'clips': {}}
    if not isinstance(index, dict) or index.get('version') != 1 or not isinstance(index.get('clips'), dict):
        raise GenerationError('Unsupported speech index.')
    if any(not isinstance(clip, dict) for clip in index['clips'].values()):
        raise GenerationError('Speech index clips must be objects.')
    engine = None
    generated = 0
    api_requests = 0
    for entry, path in zip(words, paths):
        word = entry['word']
        if requested and word not in requested:
            continue
        fingerprint = input_fingerprint(generator, entry, provider)
        previous = index['clips'].get(word, {})
        if not args.force and previous.get('inputHash') == fingerprint and path.exists() and previous.get('sha256') == digest(path):
            continue
        cached = None if args.force or provider != 'elevenlabs' else cached_elevenlabs_response(fingerprint, repair=not args.dry_run)
        if args.dry_run:
            action = 'restore cached audio' if cached else f'generate via {provider}'
            print(f'{word}: would {action} -> {entry["path"]}')
            generated += 1
            if provider == 'elevenlabs' and cached is None:
                api_requests += 1
            continue
        if provider == 'elevenlabs':
            if cached is None:
                print(f'{word}: requesting ElevenLabs speech', flush=True)
                pcm, metadata = request_elevenlabs(generator, entry['pronunciation'])
                cache_elevenlabs_response(fingerprint, pcm, metadata)
            else:
                pcm, metadata = cached
            audio = pcm_to_wav(pcm)
        else:
            if engine is None:
                from kokoro_onnx import Kokoro
                engine = Kokoro(str(model_file(generator['model'])), str(model_file('voices-v1.0.bin')))
            audio = kokoro_wav(engine, generator, entry)
        atomic_write(path, audio)
        clip = {'url': '/' + path.relative_to(public).as_posix(), 'sha256': digest(path), 'inputHash': fingerprint}
        if provider == 'elevenlabs':
            clip['sourceSha256'] = hashlib.sha256(pcm).hexdigest()
            for field in ('requestId', 'characterCost'):
                if field in metadata:
                    clip[field] = metadata[field]
            if 'characterCost' in metadata:
                print(f'{word}: {metadata["characterCost"]:g} metered characters', flush=True)
        index['clips'][word] = clip
        print(f'{word}: {entry["pronunciation"]} -> {entry["path"]}', flush=True)
        # Every completed asset and index is replaced atomically; cached synthesis survives failures.
        write_json(INDEX, index)
        generated += 1
    if args.dry_run:
        print(f'Dry run: {generated} clips need writing; {api_requests} ElevenLabs requests; no output or API changes.')
        return
    index['clips'] = {word: clip for word, clip in index['clips'].items() if word in {entry['word'] for entry in words}}
    write_json(INDEX, index)
    print(f'{len(index["clips"])} word clips available; {generated} written.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--provider', choices=('kokoro', 'kokoro-onnx', 'elevenlabs'), help='Validate the intended provider (default: manifest engine)')
    parser.add_argument('--word', action='append', help='Regenerate only this manifest word (repeatable)')
    parser.add_argument('--force', action='store_true', help='Regenerate unchanged clips; for ElevenLabs this also bypasses the response cache and incurs new requests')
    parser.add_argument('--dry-run', action='store_true', help='Show pending clips and API requests without generating or writing')
    args = parser.parse_args()
    try:
        generate(args)
    except (GenerationError, OSError, KeyError, TypeError, json.JSONDecodeError) as error:
        print(f'Word speech generation failed: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
