"""Generate checked-in word clips; inference and word text stay on this machine."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[3]
MANIFEST = ROOT / 'data/cw-training/word-speech.json'
INDEX = ROOT / 'public/audio/cw-training/words/index.json'
MODELS = {
    'kokoro-v1.0.onnx': 'beb0d1848dee9a49da392cc3df26958d46cfa35d321edf434f52949153f0df3a',
    'voices-v1.0.bin': 'bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d',
}


def digest(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


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
        raise ValueError(f'Checksum mismatch for {name}')
    temporary.replace(path)
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--word', action='append', help='Regenerate only this manifest word (repeatable)')
    parser.add_argument('--force', action='store_true', help='Regenerate even when inputs are unchanged')
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text())
    generator = manifest['generator']
    if generator['engine'] != 'kokoro-onnx' or generator['model'] not in MODELS:
        raise ValueError('Unsupported speech engine/model')
    words = manifest['words']
    if len({entry['word'] for entry in words}) != len(words) or len({entry['path'] for entry in words}) != len(words):
        raise ValueError('Manifest words and paths must be unique')
    requested = {word.upper() for word in args.word} if args.word else None
    if requested and requested - {entry['word'] for entry in words}:
        raise ValueError('Requested word is not in the manifest')
    index = json.loads(INDEX.read_text()) if INDEX.exists() else {'version': 1, 'clips': {}}
    engine = None
    for entry in words:
        word = entry['word']
        if requested and word not in requested:
            continue
        path = (ROOT / entry['path']).resolve()
        if not path.is_relative_to(ROOT / 'public/audio/cw-training/words') or path.suffix != '.wav':
            raise ValueError(f'Invalid output path: {entry["path"]}')
        # Bump recipe when changing resampling, trimming, or normalization.
        fingerprint = hashlib.sha256(json.dumps({'recipe': 1, 'generator': generator, 'entry': entry}, sort_keys=True).encode()).hexdigest()
        previous = index['clips'].get(word, {})
        if not args.force and previous.get('inputHash') == fingerprint and path.exists() and previous.get('sha256') == digest(path):
            continue
        if engine is None:
            from kokoro_onnx import Kokoro
            import numpy as np
            import soundfile as sf
            engine = Kokoro(str(model_file(generator['model'])), str(model_file('voices-v1.0.bin')))
        samples, rate = engine.create(entry.get('phonemes', entry['pronunciation']), voice=generator['voice'], speed=generator['speed'], lang=generator['language'], is_phonemes='phonemes' in entry)
        audible = np.flatnonzero(np.abs(samples) > 0.003)
        if audible.size == 0:
            raise ValueError(f'Empty speech for {word}')
        # Remove synthesis padding, retaining small margins around real speech.
        samples = samples[max(0, audible[0] - int(rate * .03)):min(len(samples), audible[-1] + int(rate * .08))]
        samples = samples * (0.8 / max(float(np.max(np.abs(samples))), 0.001))
        path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'speech.wav'
            result = Path(directory) / 'result.wav'
            sf.write(source, samples, rate, subtype='PCM_16')
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(source), '-ar', '22050', '-ac', '1', '-c:a', 'pcm_s16le', '-map_metadata', '-1', str(result)], check=True)
            path.write_bytes(result.read_bytes())
        sha = digest(path)
        index['clips'][word] = {'url': '/' + path.relative_to(ROOT / 'public').as_posix(), 'sha256': sha, 'inputHash': fingerprint}
        print(f'{word}: {entry["pronunciation"]} -> {entry["path"]}', flush=True)
        # Preserve completed clips if a later generation fails.
        INDEX.write_text(json.dumps(index, indent=2, sort_keys=True) + '\n')
    index['clips'] = {word: clip for word, clip in index['clips'].items() if word in {entry['word'] for entry in words}}
    INDEX.write_text(json.dumps(index, indent=2, sort_keys=True) + '\n')
    print(f'{len(index["clips"])} word clips available.')


if __name__ == '__main__':
    main()
