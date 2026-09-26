import type { Point } from './map';
import type { DemoRoute } from './routes';
import { createSpeech } from './audio';

import { createRouteGuide } from './guidance';
const meters = (value: number) => Math.max(5, Math.round(value / 5) * 5);

export function setupNavigation(canvas: HTMLCanvasElement) {
  const panel = document.querySelector<HTMLElement>('#navigation')!;
  const message = document.querySelector<HTMLElement>('#navigation-message')!;
  const title = document.querySelector<HTMLElement>('#navigation-title')!;
  const voice = document.querySelector<HTMLButtonElement>('#navigation-voice')!;
  const speechStatus = document.querySelector<HTMLElement>('#speech-status')!;
  const speech = createSpeech(text => { speechStatus.textContent = text; });
  let guide: ReturnType<typeof createRouteGuide> | null = null;
  let spokenKey = '', previousProgress: number | undefined;
  let muted = false;
  const present = (text: string) => { message.textContent = text; };
  canvas.addEventListener('routechange', event => {
    const route = (event as CustomEvent<DemoRoute | null>).detail;
    if (route) speech.reset(); else speech.stop();
    spokenKey = ''; previousProgress = undefined;
    guide = route ? createRouteGuide(route) : null;
    canvas.dataset.navigationCue = '';
    panel.hidden = !route;
    if (!route || !guide) return;
    title.textContent = `Home → ${route.name}`;
    const text = `${route.name}, ${meters(guide.total)} meters from Home. Follow the highlighted route.`;
    present(text);
    speech.unlock();
    if (!muted) speech.say(text, `intro-${route.name}`);
  });
  document.querySelector('#navigation-repeat')!.addEventListener('click', () => {
    muted = false; voice.textContent = 'Mute voice'; voice.setAttribute('aria-pressed', 'false');
    speechStatus.textContent = 'Voice on';
    speech.unlock(); speech.say(message.textContent ?? '', spokenKey || 'manual', true);
  });
  voice.addEventListener('click', () => {
    muted = !muted; voice.textContent = muted ? 'Enable voice' : 'Mute voice';
    voice.setAttribute('aria-pressed', String(muted));
    speechStatus.textContent = muted ? 'Voice muted' : 'Voice on';
    if (muted) speech.stop(); else { speech.unlock(); speech.say(message.textContent ?? '', spokenKey || 'manual', true); }
  });
  window.addEventListener('blur', () => { speech.stop(); spokenKey = ''; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { speech.stop(); spokenKey = ''; } });
  return {
    unlock: () => speech.unlock(),
    explore(point: Point | null) {
      if (!guide || !point) return;
      const instruction = guide.instruction(point, previousProgress);
      previousProgress = instruction.progress;
      present(instruction.text);
      canvas.dataset.navigationCue = instruction.key;
      spokenKey = instruction.key;
      if (!muted) speech.say(instruction.text, instruction.key, false, instruction.priority);
    },
  };
}
