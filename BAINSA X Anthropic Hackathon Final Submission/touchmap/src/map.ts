import { demoRoutes, type DemoRoute } from './routes';
export type Point = [number, number];
type Area = { rings: Point[][]; name?: string; kind?: 'park' | 'lawn' };
export interface MapData {
  meta: { radius?: number; bounds: [number, number, number, number] };
  streets: { id: number; name: string; major: boolean; width?: number; pts: Point[] }[];
  intersections: { x: number; y: number; names: string[] }[];
  landmarks: { x: number; y: number; name: string }[];
  buildings: Area[];
  green: Area[];
  paths: { pts: Point[]; kind?: string; width?: number }[];
}

export let METERS_PER_PX = 1;
let offset: Point = [0, 0];
export const metersToPx = ([x, y]: Point): Point =>
  [x / METERS_PER_PX + offset[0], y / METERS_PER_PX + offset[1]];
export const pxToMeters = ([x, y]: Point): Point =>
  [(x - offset[0]) * METERS_PER_PX, (y - offset[1]) * METERS_PER_PX];

let updateView: (dx: number, dy: number, factor: number, anchor?: Point) => void = () => {};
let resetView: () => void = () => {};
let focusHome: () => void = () => {};
export const goHome = () => focusHome();
export const moveMap = (dx: number, dy: number, factor = 1, anchor?: Point) =>
  updateView(dx, dy, factor, anchor);
export const resetMap = () => resetView();

export async function loadMap(canvas: HTMLCanvasElement): Promise<MapData> {
  const response = await fetch(`${import.meta.env.BASE_URL}map.json`);
  if (!response.ok) throw new Error(`Map request failed: ${response.status}`);
  const data: MapData = await response.json();
  const [minX, minY, maxX, maxY] = data.meta.bounds;
  let home: Point | null = null;
  try {
    const saved = await fetch(`${import.meta.env.BASE_URL}home.local.json`);
    if (saved.ok) {
      const value = await saved.json();
      if (Number.isFinite(value.x) && Number.isFinite(value.y) &&
          (!data.meta.radius || Math.hypot(value.x, value.y) <= data.meta.radius)) home = [value.x, value.y];
    }
  } catch { /* A personal marker is optional; map loading must still work. */ }
  let routes: DemoRoute[] = [];
  if (home) {
    try { routes = demoRoutes(data, home); }
    catch (error) { console.error(error); }
  }
  const legend = document.querySelector<HTMLElement>('#route-legend')!;
  legend.hidden = routes.length === 0;
  canvas.dataset.routes = String(routes.length);
  let selectedRoute: string | null = null;
  const routeButtons = legend.querySelectorAll<HTMLButtonElement>('button[data-route]');
  for (const button of routeButtons) {
    button.disabled = !!button.dataset.route && !routes.some(route => route.name === button.dataset.route);
    button.addEventListener('click', () => {
      selectedRoute = button.dataset.route || null;
      for (const option of routeButtons) option.setAttribute('aria-pressed', String(option === button));
      draw();
      canvas.dispatchEvent(new CustomEvent('routechange', { detail: routes.find(route => route.name === selectedRoute) ?? null }));
      if (selectedRoute) focusHome();
    });
  }
  const homeButton = document.querySelector<HTMLButtonElement>('#go-home')!;
  homeButton.hidden = !home;
  focusHome = () => {
    if (!home) return;
    zoom = Math.max(zoom, 2.5); center = [...home]; draw();
    canvas.dispatchEvent(new CustomEvent('explorehome', { detail: home }));
  };
  homeButton.addEventListener('click', focusHome);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable.');
  const context = ctx;
  function trace(pts: Point[]) {
    pts.forEach((p, i) => {
      const [x, y] = metersToPx(p);
      if (i) context.lineTo(x, y); else context.moveTo(x, y);
    });
  }
  function areas(items: Area[], fill: string, stroke: string) {
    context.fillStyle = fill; context.strokeStyle = stroke; context.lineWidth = 0.8;
    for (const area of items) {
      context.beginPath();
      for (const ring of area.rings) { trace(ring); context.closePath(); }
      context.fill('evenodd'); context.stroke();
    }
  }
  let center: Point = [(minX + maxX) / 2, (minY + maxY) / 2];
  let initialScale = 0;
  let zoom = 1;
  // Match the requested 0.49× overview; on wider windows keep the map filling the viewport.
  const minimumZoom = (width: number, height: number) => data.meta.radius
    ? Math.min(8, Math.max(0.49, initialScale * Math.hypot(width, Math.max(0, height - 82)) / (2 * data.meta.radius)))
    : 0.49;
  function constrain(width: number, height: number) {
    // The initial viewport stays unchanged; exploration extends to the configured radius.
    if (data.meta.radius) {
      const limit = Math.max(0, data.meta.radius - Math.hypot(width, height + 28) * METERS_PER_PX / 2);
      const distance = Math.hypot(...center);
      if (distance > limit) center = distance ? center.map(v => v * limit / distance) as Point : [0, 0];
    } else {
      center = center.map((v, axis) => {
        const low = axis ? minY : minX, high = axis ? maxY : maxX;
        const half = (axis ? height : width) * METERS_PER_PX / 2;
        return high-low <= half*2 ? (low+high)/2 : Math.max(low+half,Math.min(high-half,v));
      }) as Point;
    }
  }
  updateView = (dx, dy, factor, anchor) => {
    const { width, height } = canvas.getBoundingClientRect();
    const focus = anchor ?? [width / 2, height / 2];
    const before = pxToMeters(focus);
    zoom = Math.max(minimumZoom(width, height), Math.min(8, zoom * factor));
    const nextScale = initialScale / zoom;
    center = [before[0] - (focus[0] - width / 2) * nextScale - dx * nextScale,
      before[1] - (focus[1] - (height + 28) / 2) * nextScale - dy * nextScale];
    draw();
  };
  resetView = () => { zoom = 1; center = [(minX+maxX)/2, (minY+maxY)/2]; draw(); };
  function draw() {
    const { width, height } = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    initialScale ||= Math.max((maxX - minX) / Math.max(width - 32, 1),
      (maxY - minY) / Math.max(height - 100, 1));
    zoom = Math.max(minimumZoom(width, height), Math.min(8, zoom));
    METERS_PER_PX = initialScale / zoom;
    constrain(width, height);
    offset = [width / 2 - center[0] / METERS_PER_PX,
      (height + 28) / 2 - center[1] / METERS_PER_PX];
    const zoomLabel = document.querySelector('#zoom-level');
    if (zoomLabel) zoomLabel.textContent = `${zoom.toFixed(zoom < 1 ? 2 : 1)}×`;
    canvas.dataset.zoom = String(zoom);
    canvas.dataset.center = center.join(',');
    canvas.dataset.metersPerPx = String(METERS_PER_PX);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.fillStyle = '#263d4d'; context.fillRect(0, 0, width, height);
    const left = 0, top = 55, right = width, bottom = height - 45;
    context.save(); context.beginPath(); context.rect(left, top, right-left, bottom-top); context.clip();
    context.fillStyle = '#263d4d'; context.fillRect(left, top, right-left, bottom-top);
    if (data.meta.radius) {
      const origin = metersToPx([0, 0]);
      context.beginPath(); context.arc(...origin, data.meta.radius / METERS_PER_PX, 0, Math.PI * 2); context.clip();
    }
    areas(data.green, '#215e55', '#2d7465');
    areas(data.buildings, '#4d697f', '#658298');
    context.lineCap = 'round'; context.lineJoin = 'round';
    context.strokeStyle = '#6b7c81'; context.lineWidth = Math.max(1, 2 / METERS_PER_PX);
    context.setLineDash([2, 3]);
    for (const path of data.paths) { context.beginPath(); trace(path.pts); context.stroke(); }
    context.setLineDash([]);
    for (const casing of [true, false]) for (const street of data.streets) {
      context.beginPath(); trace(street.pts);
      context.strokeStyle = casing ? '#23323e' : '#84929d';
      context.lineWidth = Math.max(2, (street.major ? 9 : 5) / METERS_PER_PX) + (casing ? 2 : 0);
      context.stroke();
    }
    canvas.dataset.visibleRoute = selectedRoute ?? '';
    for (const [i, route] of routes.entries()) {
      if (route.name !== selectedRoute) continue;
      context.beginPath(); trace(route.pts);
      context.strokeStyle = route.color; context.lineWidth = 4;
      context.setLineDash(i ? [7, 7] : []); context.stroke();
      // Dashed tails mark the approximate connections to the named building points.
      context.setLineDash([2, 5]); context.lineWidth = 2;
      context.beginPath(); trace([route.home,route.pts[0]]);
      trace([route.pts[route.pts.length-1],route.destination]); context.stroke();
      context.setLineDash([]);
      const [x,y] = metersToPx(route.destination);
      context.beginPath(); context.arc(x,y,7,0,Math.PI*2);
      context.fillStyle = route.color; context.fill();
      context.strokeStyle = '#102633'; context.lineWidth = 2; context.stroke();
    }
    // Place each street name once along its longest visible segment.
    const labels = new Map<string, { a: Point; b: Point; length: number }>();
    for (const street of data.streets) for (let i = 1; i < street.pts.length; i++) {
      const a = metersToPx(street.pts[i-1]), b = metersToPx(street.pts[i]);
      if ([a, b].some(([x,y]) => x < left || x > right || y < top || y > bottom)) continue;
      const length = Math.hypot(b[0]-a[0], b[1]-a[1]);
      if (length > (labels.get(street.name)?.length ?? 0)) labels.set(street.name, {a,b,length});
    }
    context.font = '10px system-ui'; context.textAlign = 'center';
    for (const [name, {a,b,length}] of labels) {
      if (context.measureText(name).width + 10 > length) continue;
      let angle = Math.atan2(b[1]-a[1], b[0]-a[0]);
      if (angle > Math.PI/2 || angle < -Math.PI/2) angle += Math.PI;
      context.save(); context.translate((a[0]+b[0])/2, (a[1]+b[1])/2); context.rotate(angle);
      context.strokeStyle = '#263d4d'; context.lineWidth = 3;
      context.strokeText(name, 0, -5); context.fillStyle = '#eef2f4'; context.fillText(name, 0, -5); context.restore();
    }
    const occupied: [number,number,number,number][] = [];
    context.font = '600 11px system-ui';
    const campusLabels: Record<string, string> = {
      'Edificio Roentgen': 'Röntgen Building',
      'Edificio Sarfatti': 'Sarfatti Building',
      'Edificio Leonardo Del Vecchio': 'Velodromo · Del Vecchio',
      'Edificio di Via Gobbi 5': 'Gobbi Building',
      'Biblioteca Università Bocconi': 'Bocconi Library',
      'Nuovo Campus Università Bocconi': 'Bocconi New Campus',
      'Bocconi Sport Center': 'Bocconi Sport Center',
      'Residenza Castiglioni': 'Castiglioni Residence',
      'Residenza Bocconi': 'Bocconi Residence',
    };
    const landmarks = data.landmarks.filter(p => campusLabels[p.name]);
    for (const place of landmarks) {
      const label = campusLabels[place.name];
      const [x,y] = metersToPx([place.x,place.y]);
      const w = context.measureText(label).width + 12;
      if (x-w/2 < left || x+w/2 > right || y-22 < top || y+5 > bottom) continue;
      const box: [number,number,number,number] = [x-w/2,y-23,x+w/2,y+1];
      if (occupied.some(b => box[0]<b[2] && box[2]>b[0] && box[1]<b[3] && box[3]>b[1])) continue;
      occupied.push(box);
      context.fillStyle = '#102633dd'; context.fillRect(x-w/2,y-22,w,18);
      context.fillStyle = '#f2cfa4'; context.fillText(label,x,y-9);
      context.beginPath(); context.arc(x,y,3,0,Math.PI*2); context.fill();
    }
    if (home) {
      const [x,y] = metersToPx(home);
      context.save(); context.translate(x,y);
      context.fillStyle = '#ffda79'; context.strokeStyle = '#172e3c'; context.lineWidth = 2;
      context.beginPath(); context.arc(0,0,15,0,Math.PI*2); context.fill(); context.stroke();
      context.strokeStyle = '#172e3c'; context.lineWidth = 2;
      context.beginPath(); context.moveTo(-8,0); context.lineTo(0,-7); context.lineTo(8,0);
      context.moveTo(-5,-2); context.lineTo(-5,7); context.lineTo(5,7); context.lineTo(5,-2);
      context.moveTo(0,7); context.lineTo(0,2); context.stroke();
      context.font = '600 13px system-ui'; context.textAlign = 'center';
      context.fillStyle = '#102633ee'; context.fillRect(-25,-38,50,19);
      context.fillStyle = '#ffda79'; context.fillText('Home',0,-24);
      context.restore();
    }
    context.restore();
    context.textAlign = 'left'; context.fillStyle = '#edf3f6';
    context.font = '600 17px system-ui'; context.fillText('BOCCONI · MILANO', 18, 28);
    context.font = '11px system-ui'; context.fillStyle = '#a9bbc7';
    context.fillText('Campus & neighbourhood · N ↑', 18, 45);
    const scale = 50 / METERS_PER_PX;
    context.strokeStyle = '#edf3f6'; context.lineWidth = 2;
    context.beginPath(); context.moveTo(18,height-28); context.lineTo(18+scale,height-28); context.stroke();
    context.fillText('50 m',18,height-36);
    canvas.dispatchEvent(new Event('mapviewchange'));
  }
  new ResizeObserver(draw).observe(canvas);
  window.addEventListener('resize', draw); draw();
  return data;
}
