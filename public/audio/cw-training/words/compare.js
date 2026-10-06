const samples = document.getElementById('samples');
const loading = document.getElementById('loading');
const voiceDetail = document.getElementById('voice-detail');
const players = [];
let sequence = null;

function finishSequence(message = '') {
  if (!sequence) return;
  sequence.button.textContent = 'Play old then new';
  sequence.button.setAttribute('aria-label', `Compare both voices for ${sequence.word}`);
  sequence.status.textContent = message;
  sequence = null;
}

function stopAll() {
  finishSequence();
  for (const player of players) {
    player.pause();
    player.currentTime = 0;
  }
}

function playSequenceClip(current) {
  current.status.textContent =
    current.expected === current.oldAudio ? 'Playing old · Kokoro…' : 'Playing new · ElevenLabs…';
  current.expected.play().catch(() => {
    if (sequence === current) finishSequence('Could not play this clip. Try its audio controls.');
  });
}

function createPlayer(word, provider, url) {
  const container = document.createElement('div');
  container.className = 'player';
  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', `${provider} spoken answer for ${word}`);
  const label = document.createElement('span');
  label.className = provider === 'ElevenLabs' ? 'player-label new-label' : 'player-label';
  label.textContent = `${provider === 'Kokoro' ? 'Old' : 'New'} · ${provider}`;
  const audio = document.createElement('audio');
  audio.controls = true;
  audio.preload = 'none';
  audio.src = url;
  audio.setAttribute(
    'aria-label',
    `${word} — ${provider === 'Kokoro' ? 'old Kokoro' : 'new ElevenLabs'} spoken answer`,
  );
  const error = document.createElement('p');
  error.className = 'error';
  error.setAttribute('role', 'status');
  error.hidden = true;

  audio.addEventListener('play', () => {
    if (sequence && sequence.expected !== audio) finishSequence();
    for (const other of players) if (other !== audio) other.pause();
  });
  audio.addEventListener('pause', () => {
    if (sequence?.expected === audio && !audio.ended) finishSequence('Comparison paused.');
  });
  audio.addEventListener('error', () => {
    error.hidden = false;
    error.textContent = `The ${provider} clip could not be loaded. Reload the page to try again.`;
    if (sequence?.expected === audio) finishSequence();
  });
  audio.addEventListener('ended', () => {
    if (sequence?.expected !== audio) return;
    if (audio === sequence.oldAudio) {
      sequence.expected = sequence.newAudio;
      sequence.newAudio.currentTime = 0;
      playSequenceClip(sequence);
    } else {
      finishSequence('Comparison complete.');
    }
  });
  container.append(label, audio, error);
  players.push(audio);
  return { container, audio };
}

function createSample(entry) {
  const card = document.createElement('section');
  card.className = 'sample';
  const heading = document.createElement('div');
  heading.className = 'sample-heading';
  const title = document.createElement('div');
  const word = document.createElement('h2');
  word.className = 'word';
  word.textContent = entry.word;
  const pronunciation = document.createElement('p');
  pronunciation.className = 'pronunciation';
  pronunciation.textContent = `Spoken answer: “${entry.pronunciation}”`;
  title.append(word, pronunciation);
  const button = document.createElement('button');
  button.className = 'compare-button';
  button.type = 'button';
  button.textContent = 'Play old then new';
  button.setAttribute('aria-label', `Compare both voices for ${entry.word}`);
  heading.append(title, button);
  const pair = document.createElement('div');
  pair.className = 'players';
  const status = document.createElement('p');
  status.className = 'playback-status';
  status.setAttribute('role', 'status');
  const old = createPlayer(entry.word, 'Kokoro', entry.oldUrl);
  const selected = createPlayer(entry.word, 'ElevenLabs', entry.newUrl);
  pair.append(old.container, selected.container);
  card.append(heading, pair, status);
  button.addEventListener('click', () => {
    const stopping = sequence?.button === button;
    stopAll();
    if (stopping) return;
    sequence = {
      word: entry.word,
      button,
      status,
      oldAudio: old.audio,
      newAudio: selected.audio,
      expected: old.audio,
    };
    button.textContent = 'Stop comparison';
    button.setAttribute('aria-label', `Stop comparison for ${entry.word}`);
    playSequenceClip(sequence);
  });
  return card;
}

function isEntry(entry) {
  return (
    entry &&
    typeof entry.word === 'string' &&
    typeof entry.pronunciation === 'string' &&
    typeof entry.oldUrl === 'string' &&
    /^\/audio\/cw-training\/words\/comparison\/kokoro\/[a-z0-9-]+\.wav$/.test(entry.oldUrl) &&
    typeof entry.newUrl === 'string' &&
    /^\/audio\/cw-training\/words\/[a-z0-9-]+\.wav$/.test(entry.newUrl)
  );
}

async function loadComparison() {
  try {
    const response = await fetch('./comparison/index.json');
    if (!response.ok) throw new Error('Comparison metadata unavailable');
    const data = await response.json();
    if (
      typeof data.voiceName !== 'string' ||
      typeof data.model !== 'string' ||
      !Array.isArray(data.words) ||
      data.words.length === 0 ||
      data.words.length > 24 ||
      !data.words.every(isEntry)
    ) {
      throw new Error('Invalid comparison metadata');
    }
    voiceDetail.textContent = `${data.voiceName} · ${data.model}`;
    samples.replaceChildren(...data.words.map(createSample));
    loading.hidden = true;
  } catch {
    voiceDetail.textContent = 'Voice details unavailable';
    loading.className = 'error';
    loading.textContent =
      'The comparison samples could not be loaded. Reload the page to try again.';
  }
}

window.addEventListener('pagehide', stopAll);
loadComparison();
