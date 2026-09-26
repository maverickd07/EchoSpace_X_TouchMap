type Prompt = { text: string; key: string; repeat: boolean };
type Clock = { now: () => number; later: (fn: () => void, ms: number) => unknown; clear: (timer: unknown) => void };
const browserClock: Clock = {
  now: () => performance.now(),
  later: (fn, ms) => setTimeout(fn, ms),
  clear: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
};

/** Normal prompts finish with a short pause; a new turn-now cue preempts speech immediately. */
export function createSpeechQueue(play: (text: string, done: () => void) => void, clock = browserClock, cancelCurrent: () => void = () => {}) {
  let current: Prompt | null = null, pending: Prompt | null = null;
  let timer: unknown, nextAllowed = 0, generation = 0;
  const recent = new Map<string, number>();
  let lastKey = '';
  const duplicate = (prompt: Prompt) => !prompt.repeat &&
    (prompt.key === lastKey || clock.now() - (recent.get(prompt.key) ?? -Infinity) < 60000);
  function pump() {
    clock.clear(timer);
    if (current || !pending) return;
    if (duplicate(pending)) { pending = null; return; }
    const wait = nextAllowed - clock.now();
    if (wait > 0) { timer = clock.later(pump, wait); return; }
    const prompt = pending; pending = null; current = prompt;
    const token = ++generation;
    play(prompt.text, () => {
      if (token !== generation || !current) return;
      current = null; lastKey = prompt.key; recent.set(prompt.key, clock.now());
      nextAllowed = clock.now() + 500;
      pump();
    });
  }
  return {
    say(text: string, key = text, repeat = false, priority = false) {
      if (!text.trim()) return;
      const prompt = { text, key, repeat };
      if (priority && (repeat || current?.key !== key) && !duplicate(prompt)) {
        clock.clear(timer); generation++;
        current = null; pending = null; nextAllowed = 0;
        cancelCurrent();
        pending = prompt; pump(); return;
      }
      // Returning to the currently spoken position also discards a stale queued turn.
      pending = (!repeat && current?.key === key) || duplicate(prompt) ? null : prompt;
      pump();
    },
    reset() { pending = null; recent.clear(); lastKey = ''; clock.clear(timer); },
    stop() {
      pending = null; clock.clear(timer); generation++;
      if (current) nextAllowed = clock.now() + 500;
      current = null;
    },
  };
}

export function voiceScore(voice: { name: string; lang: string }): number {
  if (!/^en[-_]/i.test(voice.lang)) return -1000;
  const name = voice.name;
  if (/Zarvox|Trinoids|Whisper|Bubbles|Bad News|Good News|Jester|Organ|Wobble|Bells|Boing|Cellos|Deranged|Hysterical|Albert|Bahh|Fred/i.test(name)) return -500;
  return /premium|enhanced|natural|neural/i.test(name) ? 400
    : /Siri/i.test(name) ? 350
    : /Google|Microsoft.*Online/i.test(name) ? 300
    : /Samantha/i.test(name) ? 200
    : /Ava|Allison|Susan|Karen|Serena/i.test(name) ? 150
    : /Moira/i.test(name) ? 100 : 0;
}
