import type { Point } from './map';
import type { DemoRoute } from './routes';

const distance = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const meters = (value: number) => Math.max(5, Math.round(value / 5) * 5);
export type Instruction = { key: string; text: string; urgent?: boolean; priority?: boolean; progress: number };

/** Distances and turns are measured in map meters, independent of screen zoom. */
export function createRouteGuide(route: DemoRoute) {
  const pts = [route.home, ...route.pts, route.destination];
  const names = ['the connection from Home', ...route.roadNames, 'the destination connection'];
  const cumulative = [0];
  for (let i = 1; i < pts.length; i++) cumulative.push(cumulative[i - 1] + distance(pts[i - 1], pts[i]));
  const total = cumulative.at(-1)!;
  const at = (along: number): Point => {
    along = Math.max(0, Math.min(total, along));
    const i = Math.max(1, cumulative.findIndex((s, index) => index > 0 && s >= along));
    const t = (along - cumulative[i - 1]) / (cumulative[i] - cumulative[i - 1] || 1);
    return [pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0]), pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1])];
  };
  const turns: { along: number; action: string }[] = [];
  if (cumulative[1] < 8) names[0] = names[1];
  // Heading samples suppress tiny geometry wiggles without delaying pointer feedback.
  for (let i = 1; i < pts.length - 1; i++) {
    const along = cumulative[i];
    if (along < 8 || total - along < 1) continue;
    const a = at(along - 10), b = pts[i], c = at(along + 10);
    const u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]];
    // Local map y points south: positive cross product is a right turn.
    const angle = Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]) * 180 / Math.PI;
    const changed = names[i - 1] !== names[i];
    if (!changed && (Math.abs(angle) < 45 || along - (turns.at(-1)?.along ?? -Infinity) < 18)) continue;
    const verb = Math.abs(angle) > 150 ? 'Turn around' : Math.abs(angle) >= 30 ? `Turn ${angle > 0 ? 'right' : 'left'}` : 'Continue straight';
    const action = i === pts.length - 2
      ? `Follow the dotted connection toward the ${route.name} map marker. The entrance is not mapped`
      : `${verb} onto ${names[i]}`;
    const previous = turns.at(-1);
    // Several OSM pieces can describe one junction. Give its final outgoing road once.
    if (previous && along - previous.along < 12) previous.action = action;
    else turns.push({ along, action });
  }
  return {
    total, turns, pts, cumulative,
    instruction(point: Point, previousProgress?: number): Instruction {
      let best = Infinity, progress = 0, segment = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const [x, y] = pts[i], dx = pts[i + 1][0] - x, dy = pts[i + 1][1] - y;
        const t = Math.max(0, Math.min(1, ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy || 1)));
        const gap = distance(point, [x + t * dx, y + t * dy]);
        const along = cumulative[i] + t * (cumulative[i + 1] - cumulative[i]);
        if (gap < best - 0.1 || (Math.abs(gap - best) < 0.1 && previousProgress !== undefined && Math.abs(along - previousProgress) < Math.abs(progress - previousProgress))) {
          best = gap; progress = along; segment = i;
        }
      }
      if (best > 22) return { key: 'off-route', text: 'Off route. Return to the highlighted route.', urgent: true, progress };
      if (distance(point, route.destination) <= 10 && total - progress <= 15) return {
        key: 'arrived', text: `You have reached the ${route.name} map marker. Route practice complete.`, urgent: true, progress,
      };
      const near = turns.find(turn => Math.abs(turn.along - progress) <= 8 ||
        (turn.action.startsWith('Turn ') && previousProgress !== undefined &&
          previousProgress < turn.along - 8 && progress > turn.along + 8 &&
          distance(point, at(turn.along)) <= 25));
      if (near) {
        const priority = near.action.startsWith('Turn ');
        return { key: `turn-${near.along}`, text: `${priority ? near.action.replace(' onto ', ' now onto ') : near.action}.`, urgent: true, priority, progress };
      }
      const next = turns.find(turn => turn.along > progress);
      const remaining = (next?.along ?? total) - progress;
      const key = `${next?.along ?? 'end'}-${remaining <= 25 ? 'soon' : Math.ceil(remaining / 50)}`;
      return {
        key, progress, urgent: remaining <= 25,
        text: next
          ? `Follow ${names[segment]} for ${meters(remaining)} meters, then ${next.action.charAt(0).toLowerCase() + next.action.slice(1)}.`
          : `Continue toward ${route.name} for ${meters(remaining)} meters to reach the map marker.`,
      };
    },
  };
}

