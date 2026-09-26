import { goHome, moveMap, resetMap, pxToMeters, metersToPx, type Point } from './map';

export function lockMapPointer(canvas: HTMLCanvasElement): void {
  if (!window.matchMedia('(pointer: fine)').matches || !canvas.requestPointerLock || document.pointerLockElement === canvas) return;
  const failed = (error?: unknown) => {
    canvas.dataset.pointerLockError = error instanceof Error ? error.message : String(error ?? 'Mouse capture unavailable');
    document.querySelector('#pointer-help')!.textContent = 'Mouse capture failed · normal exploration available · ⌘ returns Home';
  };
  try { const result = canvas.requestPointerLock(); if (result) result.catch(failed); } catch (error) { failed(error); }
}

export function touchPoint(event: PointerEvent, canvas: HTMLCanvasElement): Point {
  const rect = canvas.getBoundingClientRect();
  return pxToMeters([event.clientX - rect.left, event.clientY - rect.top]);
}

export function setupTouch(canvas: HTMLCanvasElement, explore: (point: Point | null) => void): void {
  let hover: Point | null = null;
  let pinned: Point | null = null;
  let mouseDragging = false;
  let didPan = false;
  let restingTouch = false;
  let inputOffset: Point = [0, 0];
  let centerTimer: ReturnType<typeof setTimeout> | undefined;
  const cancelCenter = () => clearTimeout(centerTimer);
  const scheduleCenter = () => {
    cancelCenter();
    if (!hover || mouseDragging || pointers.size >= 2) return;
    centerTimer = setTimeout(() => {
      if (!hover || mouseDragging || pointers.size >= 2 || document.hidden) return;
      const before: Point = [...hover];
      pinned = pxToMeters(before);
      const rect = canvas.getBoundingClientRect();
      // Pin the geographic location before moving the map so speech/haptics do not drift.
      moveMap(rect.width / 2 - before[0], rect.height / 2 - before[1]);
      const after = metersToPx(pinned);
      // The OS cursor cannot be warped: carry its offset into subsequent movement.
      inputOffset = [inputOffset[0] + after[0] - before[0], inputOffset[1] + after[1] - before[1]];
    }, 500);
  };
  const updateExploration = () => explore(hover && !mouseDragging && pointers.size < 2 ? pxToMeters(hover) : null);
  const pointer = document.querySelector<HTMLDivElement>('#map-pointer')!;
  const hidePointer = () => { cancelCenter(); restingTouch = false; inputOffset = [0, 0]; pointer.hidden = true; pinned = null; hover = null; explore(null); };
  const followPointer = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && (canvas.dataset.mouseReleased === 'true' || (typeof canvas.requestPointerLock === 'function' && !canvas.dataset.pointerLockError))) return;
    if (event.type === 'pointerdown' && event.pointerType !== 'mouse') inputOffset = [0, 0];
    restingTouch = false;
    pinned = null;
    if (event.pointerType !== 'mouse' && event.buttons === 0) { hidePointer(); return; }
    const rect = canvas.getBoundingClientRect();
    pointer.hidden = event.clientX < rect.left || event.clientX >= rect.right ||
      event.clientY < rect.top || event.clientY >= rect.bottom;
    hover = pointer.hidden ? null : [
      Math.max(0, Math.min(rect.width, event.clientX - rect.left + inputOffset[0])),
      Math.max(0, Math.min(rect.height, event.clientY - rect.top + inputOffset[1])),
    ];
    updateExploration();
    if (hover) pointer.style.transform = `translate(${rect.left + hover[0]}px, ${rect.top + hover[1]}px)`;
    scheduleCenter();
  };
  canvas.addEventListener('pointerenter', followPointer);
  canvas.addEventListener('pointermove', followPointer);
  canvas.addEventListener('pointerdown', followPointer);
  canvas.addEventListener('pointerleave', () => { if (!restingTouch && document.pointerLockElement !== canvas) hidePointer(); });
  canvas.addEventListener('pointercancel', hidePointer);
  window.addEventListener('blur', hidePointer);
  const pointers = new Map<number, Point>();
  const local = (event: MouseEvent): Point => {
    const rect = canvas.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  };
  const gesture = () => {
    const [a, b = a] = [...pointers.values()];
    return { midpoint: [(a[0]+b[0])/2, (a[1]+b[1])/2] as Point,
      distance: Math.hypot(b[0]-a[0], b[1]-a[1]) };
  };
  // Locked mouse movement is relative and cannot escape at the edge of the screen.
  document.addEventListener('mousemove', event => {
    if (document.pointerLockElement !== canvas || (!event.movementX && !event.movementY)) return;
    cancelCenter(); pinned = null;
    const rect = canvas.getBoundingClientRect();
    const previous = hover ?? [rect.width / 2, rect.height / 2];
    hover = [Math.max(0, Math.min(rect.width, previous[0] + event.movementX)),
      Math.max(0, Math.min(rect.height, previous[1] + event.movementY))];
    pointer.hidden = false;
    pointer.style.transform = `translate(${rect.left + hover[0]}px, ${rect.top + hover[1]}px)`;
    updateExploration(); scheduleCenter();
  });
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    canvas.dataset.pointerLocked = String(locked);
    canvas.dataset.mouseReleased = String(!locked);
    if (locked) delete canvas.dataset.pointerLockError;
    document.querySelector('#pointer-help')!.textContent = locked
      ? 'Mouse captured · Esc releases · ⌘ returns Home'
      : 'Click map to capture mouse · Esc releases · ⌘ returns Home';
    cancelCenter(); inputOffset = [0, 0];
    pointers.clear(); mouseDragging = false; canvas.classList.remove('dragging');
    if (locked) {
      if (!hover) { const rect = canvas.getBoundingClientRect(); hover = [rect.width / 2, rect.height / 2]; }
      const rect = canvas.getBoundingClientRect();
      pointer.hidden = false;
      pointer.style.transform = `translate(${rect.left + hover[0]}px, ${rect.top + hover[1]}px)`;
      updateExploration();
    } else { pointer.hidden = true; explore(null); }
  });
  document.addEventListener('pointerlockerror', () => {
    canvas.dataset.pointerLockError ||= 'Mouse capture unavailable';
    document.querySelector('#pointer-help')!.textContent = 'Mouse capture failed · normal exploration available · ⌘ returns Home';
  });
  let commandAlone = false;
  window.addEventListener('keydown', event => {
    if (event.key === 'Meta' && !event.repeat) commandAlone = true;
    else if (event.key !== 'Meta') commandAlone = false;
    if (event.key === 'Escape') {
      hidePointer(); canvas.dataset.mouseReleased = 'true';
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    }
  });
  window.addEventListener('keyup', event => {
    if (event.key !== 'Meta') return;
    if (commandAlone && document.querySelector<HTMLButtonElement>('#start')!.hidden &&
        !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement)) goHome();
    commandAlone = false;
  });
  window.addEventListener('blur', () => { commandAlone = false; });
  document.querySelector('#route-legend')!.addEventListener('click', event => {
    if ((event.target as HTMLElement).closest<HTMLButtonElement>('button[data-route]')?.dataset.route) lockMapPointer(canvas);
  });
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    if (event.pointerType === 'mouse' && typeof canvas.requestPointerLock === 'function' && (!canvas.dataset.pointerLockError || canvas.dataset.mouseReleased === 'true')) {
      canvas.dataset.mouseReleased = 'false';
      lockMapPointer(canvas); canvas.focus(); return;
    }
    cancelCenter();
    if (!pointers.size) didPan = false;
    pointers.set(event.pointerId, local(event));
    canvas.setPointerCapture(event.pointerId);
    mouseDragging = event.pointerType === 'mouse';
    if(mouseDragging || pointers.size >= 2) canvas.classList.add('dragging');
    updateExploration();
    scheduleCenter();
    canvas.focus();
  });
  canvas.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    const before = gesture();
    pointers.set(event.pointerId, local(event));
    const after = gesture();
    if(event.pointerType === 'mouse' || pointers.size >= 2) {
      didPan = true; cancelCenter();
      moveMap(after.midpoint[0]-before.midpoint[0], after.midpoint[1]-before.midpoint[1],
        before.distance > 0 ? after.distance / before.distance : 1, before.midpoint);
    }
  });
  const release = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (!pointers.size) { canvas.classList.remove('dragging'); mouseDragging = false; }
    if (event.type !== 'pointerup' || didPan) {
      cancelCenter();
      if (event.pointerType !== 'mouse') hidePointer(); else updateExploration();
      return;
    }
    if (event.pointerType !== 'mouse' && hover) {
      restingTouch = true;
      pinned = pxToMeters(hover);
      explore(null); // Finger lifted: stop the physical haptic feedback.
    } else updateExploration();
    scheduleCenter();
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);
  const showPinnedPointer = () => {
    if (!pinned) return;
    const rect = canvas.getBoundingClientRect();
    hover = metersToPx(pinned);
    pointer.hidden = false;
    pointer.style.transform = `translate(${rect.left + hover[0]}px, ${rect.top + hover[1]}px)`;
  };
  canvas.addEventListener('explorehome', event => {
    cancelCenter(); inputOffset = [0, 0]; restingTouch = false;
    pinned = [...(event as CustomEvent<Point>).detail];
    showPinnedPointer();
    updateExploration();
  });
  canvas.addEventListener('mapviewchange', () => { cancelCenter(); showPinnedPointer(); if (!restingTouch) updateExploration(); });
  window.addEventListener('blur', () => { pointers.clear(); mouseDragging = false; canvas.classList.remove('dragging'); hidePointer(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) hidePointer(); });
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1);
    moveMap(0, 0, Math.exp(-Math.max(-200, Math.min(200, delta)) * 0.004), local(event));
  }, { passive: false });
  canvas.addEventListener('dblclick', event => moveMap(0, 0, 1.5, local(event)));
  canvas.addEventListener('keydown', event => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const arrows: Record<string, Point> = { ArrowLeft: [60,0], ArrowRight: [-60,0], ArrowUp: [0,60], ArrowDown: [0,-60] };
    if (arrows[event.key]) moveMap(...arrows[event.key]);
    else if (['+', '='].includes(event.key)) moveMap(0, 0, 1.4);
    else if (event.key === '-') moveMap(0, 0, 1/1.4);
    else if (event.key === '0') resetMap();
    else return;
    event.preventDefault();
  });
  document.querySelector('#zoom-in')!.addEventListener('click', () => moveMap(0,0,1.4));
  document.querySelector('#zoom-out')!.addEventListener('click', () => moveMap(0,0,1/1.4));
  document.querySelector('#reset-map')!.addEventListener('click', resetMap);
}
