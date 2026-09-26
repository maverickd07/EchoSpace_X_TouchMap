import { updateIntegrationState } from './integration';
import { createSpeechQueue, voiceScore } from './speech-queue';

export function createSpeech(status: (text: string) => void) {
  const available = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const selector = document.querySelector<HTMLSelectElement>('#navigation-voice-choice')!;
  let unlocked = false, generation = 0, voices: SpeechSynthesisVoice[] = [];
  let preference = '';
  try { preference = localStorage.getItem('touchmap-voice') ?? ''; } catch { /* Private browsing can disable storage. */ }
  const refreshVoices = () => {
    if (!available) { selector.disabled = true; return; }
    voices = window.speechSynthesis.getVoices().filter(v => voiceScore(v) > 0).sort((a, b) => voiceScore(b) - voiceScore(a)).slice(0, 3);
    selector.replaceChildren();
    for (const voice of voices) selector.add(new Option(`${voice.name} · ${voice.lang}`, voice.voiceURI));
    if (!voices.length) selector.add(new Option('System English voice', ''));
    selector.value = voices.some(v => v.voiceURI === preference) ? preference : voices[0]?.voiceURI ?? '';
    selector.disabled = voices.length < 2;
  };
  refreshVoices();
  if (available) window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
  selector.addEventListener('change', () => {
    preference = selector.value;
    try { localStorage.setItem('touchmap-voice', preference); } catch { /* Voice selection still works for this session. */ }
  });
  const queue = createSpeechQueue((text, done) => {
    if (document.hidden) { done(); return; }
    const token = generation;
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = voices.find(v => v.voiceURI === preference) ?? voices[0];
    utterance.lang = voice?.lang ?? 'en-US'; utterance.rate = 1.15;
    if (voice) utterance.voice = voice;
    utterance.onstart = () => {
      if (token !== generation) return;
      status(`Voice on${voice ? ` · ${voice.name}` : ''}`);
      updateIntegrationState({ audioUnlock: 'succeeded' });
    };
    utterance.onend = done;
    utterance.onerror = event => {
      if (token !== generation) return;
      if (!['canceled', 'interrupted'].includes(event.error)) {
        status('Voice could not play. Tap Repeat instruction to try again.');
        updateIntegrationState({ audioUnlock: 'error' });
      }
      done();
    };
    window.speechSynthesis.speak(utterance);
  }, undefined, () => { generation++; window.speechSynthesis.cancel(); });
  return {
    unlock() {
      if (!available) { status('Speech is unavailable in this browser.'); updateIntegrationState({ audioUnlock: 'error' }); return; }
      if (unlocked) return;
      unlocked = true; updateIntegrationState({ audioUnlock: 'starting' });
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    },
    say(text: string, key = text, repeat = false, priority = false) { if (available && unlocked) queue.say(text, key, repeat, priority); },
    reset: () => queue.reset(),
    stop() { generation++; queue.stop(); if (available) window.speechSynthesis.cancel(); },
  };
}
