import { setupHaptics } from './haptics';
import { updateIntegrationState } from './integration';
import { createClassifier } from './regions';
import { goHome, loadMap } from './map';
import { lockMapPointer, setupTouch } from './touch';
import { setupNavigation } from './navigation';

const canvas = document.querySelector<HTMLCanvasElement>('#map')!;
const start = document.querySelector<HTMLButtonElement>('#start')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const haptics = setupHaptics();
const navigation = setupNavigation(canvas);
start.disabled = true;
loadMap(canvas).then(data => {
  const classify = createClassifier(data);
  setupTouch(canvas, point => {
    haptics.explore(point && (!data.meta.radius || Math.hypot(...point) <= data.meta.radius) ? classify(point) : null);
    navigation.explore(point);
  });
  start.disabled = false;
  updateIntegrationState({ map: 'ready' });
}).catch(error => {
  updateIntegrationState({ map: 'error' });
  console.error(error);
  status.textContent = 'Could not load the map. Please reload to try again.';
});
start.addEventListener('click', () => {
  start.hidden = true;
  canvas.focus();
  haptics.enable();
  navigation.unlock();
  goHome();
  lockMapPointer(canvas);
});
