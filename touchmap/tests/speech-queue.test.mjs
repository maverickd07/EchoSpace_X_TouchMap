import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSpeechQueue, voiceScore } from '../src/speech-queue.ts';

function fixture() {
  let cancellations = 0;
  let now = 0, id = 0;
  const timers = new Map(), spoken = [], finished = [];
  const clock = {
    now: () => now,
    later: (fn, ms) => { timers.set(++id, {fn, due: now + ms}); return id; },
    clear: id => timers.delete(id),
  };
  const queue = createSpeechQueue((text, done) => { spoken.push(text); finished.push(done); }, clock, () => { cancellations++; });
  const advance = ms => {
    const target = now + ms;
    while (true) {
      const next = [...timers].sort((a,b) => a[1].due - b[1].due)[0];
      if (!next || next[1].due > target) break;
      timers.delete(next[0]); now = next[1].due; next[1].fn();
    }
    now = target;
  };
  return {queue, spoken, finished, advance, cancellations: () => cancellations};
}
test('never interrupts; rests 0.5 seconds from completion; retains only latest instruction', () => {
  const f = fixture();
  f.queue.say('First sentence', 'first');
  f.queue.say('Stale turn', 'stale'); f.advance(10000);
  assert.deepEqual(f.spoken, ['First sentence']);
  f.queue.say('Latest turn', 'latest'); f.finished[0]();
  f.advance(499); assert.equal(f.spoken.length, 1);
  f.advance(1); assert.deepEqual(f.spoken, ['First sentence', 'Latest turn']);
});
test('same cue is not repeated, and moving back clears stale pending guidance', () => {
  const f = fixture(); f.queue.say('Go straight', 'a');
  f.queue.say('Turn', 'b'); f.queue.say('Go straight 95 meters', 'a');
  f.finished[0](); f.advance(500);
  f.queue.say('Go straight 90 meters', 'a'); f.advance(60000);
  assert.equal(f.spoken.length, 1);
  f.queue.say('Repeat straight', 'a', true); assert.equal(f.spoken.length, 2);
});
test('a cooldown receives the freshest distance and stop invalidates old callbacks', () => {
  const f = fixture(); f.queue.say('Start', 'start'); f.finished[0]();
  f.queue.say('100 meters', 'next'); f.advance(300);
  f.queue.say('80 meters', 'next'); f.advance(200);
  assert.deepEqual(f.spoken, ['Start','80 meters']);
  f.queue.say('Must not play', 'later'); f.queue.stop(); f.finished[1](); f.advance(20000);
  assert.equal(f.spoken.length, 2);
});
test('route switching clears pending cues but finishes the current sentence', () => {
  const f = fixture(); f.queue.say('Old route', 'old');
  f.queue.say('Old next turn', 'old-next'); f.queue.reset(); f.queue.say('New route', 'new');
  assert.equal(f.spoken.length, 1); f.finished[0](); f.advance(500);
  assert.deepEqual(f.spoken, ['Old route','New route']);
});
test('prefer natural/enhanced voices, then conversational English; reject novelty voices', () => {
  const score = name => voiceScore({name,lang:'en-US'});
  assert.ok(score('Samantha (Enhanced)') > score('Samantha'));
  assert.ok(score('Samantha') > score('Daniel'));
  assert.ok(score('Google US English') > score('Daniel'));
  assert.ok(score('Zarvox') < 0);
  assert.ok(voiceScore({name:'French Enhanced',lang:'fr-FR'}) < 0);
});

test('turn-now interrupts ordinary speech immediately and does not restart on repeated samples', () => {
  const f = fixture(); f.queue.say('Long distance instruction', 'normal');
  f.queue.say('Stale next instruction', 'stale');
  f.queue.say('Turn right now', 'turn-100', false, true);
  assert.deepEqual(f.spoken, ['Long distance instruction','Turn right now']);
  assert.equal(f.cancellations(), 1);
  f.finished[0](); // Cancellation callback from the interrupted utterance must not unlock the queue.
  f.queue.say('Turn right now', 'turn-100', false, true);
  f.queue.say('Continue', 'next'); f.advance(1000);
  assert.equal(f.spoken.length, 2);
  f.finished[1](); f.advance(500);
  assert.deepEqual(f.spoken, ['Long distance instruction','Turn right now','Continue']);
});
test('turn-now bypasses the cooldown and supersedes its queued prompt', () => {
  const f = fixture(); f.queue.say('Start', 'start'); f.finished[0]();
  f.queue.say('Waited distance', 'distance');
  f.queue.say('Turn left now', 'turn-200', false, true);
  assert.deepEqual(f.spoken, ['Start','Turn left now']);
  f.finished[1](); f.advance(500);
  assert.equal(f.spoken.length, 2);
});
