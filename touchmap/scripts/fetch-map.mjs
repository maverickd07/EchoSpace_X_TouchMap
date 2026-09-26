import { mkdir, rename, writeFile, readFile } from 'node:fs/promises';

const lat0 = 45.4493, lon0 = 9.1890;
const bounds = [-250, -340, 230, 420]; // Preserve the original initial scale.
const radius = 1360;
const region = '45.4353,9.1692,45.4633,9.2088'; // Campus bounds plus a small margin.
const roadTypes = 'primary|secondary|tertiary|residential|unclassified|living_street|pedestrian';
const surfacesOnly = process.argv.includes('--surfaces-only');
const query = surfacesOnly ? `[out:json][timeout:25];(
  way(${region})[highway~"^(${roadTypes}|service|footway|path|steps|cycleway)$"];
  way(${region})[leisure~"^(park|garden)$"];
  way(${region})[landuse=grass];
  relation(${region})[type=multipolygon][leisure~"^(park|garden)$"];
  relation(${region})[type=multipolygon][landuse=grass];
);out body geom;` : `[out:json][timeout:60];(
  way(${region})[highway~"^(${roadTypes})$"];
  nw(${region})[name][amenity];
  nw(${region})[name][tourism];
  nw(${region})[name][railway=station];
  nw(${region})[name][public_transport=station];
  nw(${region})[name][building=university];
  way(${region})[highway~"^(service|footway|path|steps|cycleway)$"];
  way(${region})[building];
  relation(${region})[building][type=multipolygon];
  way(${region})[leisure~"^(park|garden)$"];
  way(${region})[landuse=grass];
  relation(${region})[type=multipolygon][leisure~"^(park|garden)$"];
  relation(${region})[type=multipolygon][landuse=grass];
);out body geom;`;

const project = ({ lat, lon }) => [
  (lon - lon0) * Math.cos(lat0 * Math.PI / 180) * 111320,
  -(lat - lat0) * 110540,
];
function width(tags, fallback) {
  const explicit = Number.parseFloat(tags.width);
  const lanes = Number.parseFloat(tags.lanes);
  return Number.isFinite(explicit) && explicit > 0 ? explicit + 4 :
    Number.isFinite(lanes) && lanes > 0 ? lanes * 3 + 4 : fallback;
}
const round = n => Math.round(n * 1000) / 1000;
const point = ([x, y]) => ({ x: round(x), y: round(y) });

function centroid(pts) {
  const closed = pts.length > 3 && pts[0].every((v, i) => v === pts.at(-1)[i]);
  if (closed) {
    let area2 = 0, x = 0, y = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const cross = ax * by - bx * ay;
      area2 += cross;
      x += (ax + bx) * cross;
      y += (ay + by) * cross;
    }
    if (Math.abs(area2) > 1e-8) return [x / (3 * area2), y / (3 * area2)];
  }
  const vertices = closed ? pts.slice(0, -1) : pts;
  return vertices.reduce(([x, y], p) =>
    [x + p[0] / vertices.length, y + p[1] / vertices.length], [0, 0]);
}

const endpoints = process.env.OVERPASS_URL ? [process.env.OVERPASS_URL] : [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
let elements;
const inputIndex = process.argv.indexOf('--osm-file');
if (inputIndex >= 0) {
  const input = JSON.parse(await readFile(process.argv[inputIndex + 1], 'utf8'));
  const nodes = new Map(input.elements.filter(e => e.type === 'node').map(e => [e.id, e]));
  const ways = new Map(input.elements.filter(e => e.type === 'way').map(e => [e.id, { ...e,
    geometry: e.nodes.map(id => nodes.get(id)) }]));
  const relations = input.elements.filter(e => e.type === 'relation' && e.tags?.type === 'multipolygon' &&
    (e.tags.building || ['park', 'garden'].includes(e.tags.leisure) || e.tags.landuse === 'grass'));
  const complete = relations.filter(e => e.members.filter(m => m.type === 'way')
    .every(m => ways.get(m.ref)?.geometry.every(Boolean))).map(e => ({ ...e,
      members: e.members.map(m => ({ ...m, geometry: ways.get(m.ref)?.geometry })) }));
  if (complete.length !== relations.length) console.warn(`Skipped ${relations.length-complete.length} incomplete boundary multipolygons.`);
  elements = [...nodes.values(), ...[...ways.values()].filter(e => e.geometry.every(Boolean)), ...complete];
}
for (const endpoint of elements ? [] : endpoints) {
  try {
    const url = new URL(endpoint);
    url.searchParams.set('data', query);
    const response = await fetch(url, {
      signal: AbortSignal.timeout(90000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    if (result.remark || !Array.isArray(result.elements)) {
      throw new Error(result.remark || 'Invalid Overpass response');
    }
    elements = result.elements;
    break;
  } catch (error) {
    console.warn(`${endpoint}: ${error.message}`);
  }
}
if (!elements) throw new Error('Could not fetch map; existing map.json was preserved.');

// Join relation members by matching endpoint coordinates; retain inner courtyards.
function rings(members) {
  const remaining = members.filter(m => m.type === 'way' && m.geometry?.length)
    .map(m => ({ ids: m.geometry.map(p => `${p.lat},${p.lon}`), pts: m.geometry.map(project) }));
  const result = [];
  while (remaining.length) {
    const ring = remaining.shift();
    while (ring.ids[0] !== ring.ids.at(-1)) {
      const i = remaining.findIndex(p => p.ids[0] === ring.ids.at(-1) || p.ids.at(-1) === ring.ids.at(-1));
      if (i < 0) break;
      const next = remaining.splice(i, 1)[0];
      if (next.ids.at(-1) === ring.ids.at(-1)) { next.ids.reverse(); next.pts.reverse(); }
      ring.ids.push(...next.ids.slice(1)); ring.pts.push(...next.pts.slice(1));
    }
    if (ring.ids[0] === ring.ids.at(-1)) result.push(ring.pts.map(p => p.map(round)));
  }
  return result;
}
const buildings = [], green = [], paths = [];
const relationWays = new Set(elements.filter(e => e.type === 'relation' && (e.tags?.building || ['park', 'garden'].includes(e.tags?.leisure) || e.tags?.landuse === 'grass'))
  .flatMap(e => e.members.filter(m => m.type === 'way').map(m => m.ref)));
const streets = [], landmarks = [], shared = new Map();
for (const element of elements.sort((a, b) => a.id - b.id)) {
  const { tags = {}, type, id } = element;
  if (type === 'relation' && (tags.building || ['park', 'garden'].includes(tags.leisure) || tags.landuse === 'grass')) {
    const outer = rings(element.members.filter(m => m.role === 'outer' || !m.role));
    const inner = rings(element.members.filter(m => m.role === 'inner'));
    if (outer.length) {
      if (tags.building) buildings.push({ id: `relation/${id}`, name: tags.name || '', rings: [...outer, ...inner] });
      else green.push({ kind: tags.landuse === 'grass' ? 'lawn' : 'park', rings: [...outer, ...inner] });
      if (tags.name) landmarks.push({ ...point(centroid(outer[0])), name: tags.name });
    }
    continue;
  }
  if (!['node', 'way'].includes(type)) continue;
  const pts = type === 'way' ? element.geometry?.map(project) : [project(element)];
  if (!pts?.length || pts.some(p => p.some(v => !Number.isFinite(v)))) continue;
  if (type === 'way') {
    const closed = pts.length >= 4 && element.nodes[0] === element.nodes.at(-1);
    if (tags.building && closed && !relationWays.has(id)) {
      buildings.push({ id: `way/${id}`, name: tags.name || '', rings: [pts.map(p => p.map(round))] });
    }
    if (closed && !relationWays.has(id) && (['park', 'garden'].includes(tags.leisure) || tags.landuse === 'grass')) {
      green.push({ kind: tags.landuse === 'grass' ? 'lawn' : 'park', rings: [pts.map(p => p.map(round))] });
    }
    if (['service', 'footway', 'path', 'steps', 'cycleway'].includes(tags.highway)) {
      paths.push({ kind: tags.highway, width: width(tags, tags.highway === 'service' ? 6 : 3), pts: pts.map(p => p.map(round)) });
    }
  }
  if (type === 'way' && roadTypes.split('|').includes(tags.highway)) {
    streets.push({ id, name: tags.name || '', width: width(tags, ['primary', 'secondary', 'tertiary'].includes(tags.highway) ? 16 : 10),
      major: ['primary', 'secondary', 'tertiary'].includes(tags.highway),
      pts: pts.map(p => p.map(round)) });
    if (tags.name) element.nodes.forEach((nodeId, i) => {
      const node = shared.get(nodeId) ?? { ...point(pts[i]), names: new Set() };
      node.names.add(tags.name);
      shared.set(nodeId, node);
    });
  }
  if (tags.name && (tags.building || tags.amenity || tags.tourism || tags.railway === 'station' ||
      tags.public_transport === 'station' || tags.building === 'university')) {
    landmarks.push({ ...point(centroid(pts)), name: tags.name });
  }
}
const intersections = [...shared.values()].filter(n => n.names.size >= 2)
  .map(({ x, y, names }) => ({ x, y, names: [...names].sort() }));
if (!streets.length) throw new Error('No streets returned; existing map.json was preserved.');
const output = new URL('../public/map.json', import.meta.url);
const temporary = new URL('../public/map.json.tmp', import.meta.url);
await mkdir(new URL('../public/', import.meta.url), { recursive: true });
const previous = surfacesOnly ? JSON.parse(await readFile(output, 'utf8')) : null;
await writeFile(temporary, JSON.stringify({ meta: { center: { lat: lat0, lon: lon0 }, bounds, radius, fetchedAt: new Date().toISOString(), source: inputIndex >= 0 ? 'OpenStreetMap API' : 'OpenStreetMap / Overpass', buildingSnapshotAt: previous?.meta.buildingSnapshotAt ?? previous?.meta.fetchedAt }, streets, intersections, landmarks: previous?.landmarks ?? landmarks, buildings: previous?.buildings ?? buildings, green, paths }, null, 2) + '\n');
await rename(temporary, output);
console.log(`Saved ${streets.length} streets, ${intersections.length} intersections, ${(previous?.landmarks ?? landmarks).length} landmarks, ${(previous?.buildings ?? buildings).length} buildings.`);
