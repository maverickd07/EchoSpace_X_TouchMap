import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRouteGuide } from '../src/guidance.ts';
import { demoRoutes } from '../src/routes.ts';

const route = (pts, roadNames) => ({ name: 'Test destination', home: pts[0], destination: pts.at(-1), pts, roadNames, color: '#fff' });
test('turns use walking direction with south-positive map y', () => {
  const right = createRouteGuide(route([[0,0],[100,0],[100,100]], ['First Street','Second Street']));
  assert.match(right.instruction([50,0]).text, /50 meters, then turn right onto Second Street/);
  assert.match(right.instruction([99,0]).text, /Turn right now onto Second Street/);
  const left = createRouteGuide(route([[0,0],[100,0],[100,-100]], ['First Street','Second Street']));
  assert.match(left.instruction([99,0]).text, /Turn left/);
});
test('off-route, arrival and reversing exploration recompute from actual position', () => {
  const guide = createRouteGuide(route([[0,0],[100,0],[100,100]], ['First Street','Second Street']));
  assert.equal(guide.instruction([50,60]).key, 'off-route');
  assert.equal(guide.instruction([100,100]).key, 'arrived');
  assert.match(guide.instruction([30,0], 180).text, /70 meters/);
  assert.ok(guide.instruction([100,100]).text.includes('map marker'));
});
test('small geometry bends do not create turns and nearby junction pieces merge', () => {
  const guide = createRouteGuide(route([[0,0],[100,1],[200,0]], ['First Street','First Street']));
  assert.equal(guide.turns.length, 0);
  const junction = createRouteGuide(route([[0,0],[100,0],[100,3],[100,100]], ['First Street','Short link','Second Street']));
  assert.equal(junction.turns.length, 1);
  assert.match(junction.turns[0].action, /Second Street/);
});
test('both real offline routes retain edge names and finite instructions', () => {
  const data = JSON.parse(readFileSync(new URL('../public/map.json', import.meta.url)));
  // Public campus origin for testing; do not require or record the private Home location.
  const origin = data.landmarks.find(p => p.name === 'Edificio Roentgen');
  const routes = demoRoutes(data, [origin.x, origin.y]);
  assert.equal(routes.length, 2);
  for (const route of routes) {
    assert.equal(route.roadNames.length, route.pts.length - 1);
    assert.ok(route.roadNames.every(Boolean));
    const guide = createRouteGuide(route);
    assert.ok(guide.total > 0);
    for (const p of route.pts) assert.doesNotMatch(guide.instruction(p).text, /undefined|NaN/);
    assert.equal(guide.instruction(route.destination).key, 'arrived');
  }
});

test('turn-now is priority, including a fast movement across a junction; straight changes are normal', () => {
  const guide = createRouteGuide(route([[0,0],[100,0],[100,100]], ['First Street','Second Street']));
  assert.equal(guide.instruction([99,0]).priority, true);
  assert.match(guide.instruction([100,20], 80).text, /Turn right now/);
  assert.equal(guide.instruction([100,60], 80).priority, undefined);
  assert.equal(guide.instruction([75,0]).priority, undefined);
  const straight = createRouteGuide(route([[0,0],[100,0],[200,0]], ['First Street','Second Street']));
  assert.equal(straight.instruction([100,0]).priority, false);
});
