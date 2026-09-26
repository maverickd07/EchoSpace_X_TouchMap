# TouchMap

Minimal Vite + TypeScript canvas and audio starter, without a framework.

```sh
npm install
npm run dev
```

Open the HTTPS Network URL printed by Vite on a device on the same LAN.
Accept the development certificate warning, then tap **Start** to begin haptic exploration. Select a route to hear English practice directions.

For an embedded browser that rejects self-signed certificates, run
`npm run dev:local` and open `http://127.0.0.1:5174/`. This separate HTTP
preview listens only on loopback; the default `dev` command keeps HTTPS on LAN.
Both commands fail explicitly if their port is occupied instead of silently
switching URLs. Keep the development server running while viewing the app.

```sh
npm run build
npm run fetch-map
```

The standalone fetch script needs Node 18+; Vite's Node requirement is recorded
in package.json. `public/map.json` is a checked-in snapshot, so normal startup
does not call Overpass. Refresh it only when needed and commit the result.
Set `OVERPASS_URL` to use a different Overpass interpreter endpoint.

Data comes from OpenStreetMap around Bocconi in Milan, centered at
45.4493, 9.1890. A bounding-box query (45.4353,9.1692–45.4633,9.2088) collects complete geometries; the displayed
initial campus view fits x=[-250,230], y=[-340,420] meters. Geometry now
extends across the available canvas without the old narrow portrait crop.
The camera and rendered map are limited to an 1,360 m radius around Bocconi; long roads do not change scale. North is up. OSM road centerlines and
building footprints are preserved; rendered road widths are illustrative.
Building multipolygons preserve inner courtyards. No buildings are traced
from screenshots or invented. OSM completeness and survey accuracy vary.
Campus names/addresses were cross-checked against the
[Bocconi campus directory](https://www.unibocconi.it/en/campus/buildings-and-classrooms).
The snapshot records its source, projection center, bounds, and retrieval time.

Intersections require a shared OSM node and at least two distinct street names.
Closed landmark ways use polygon centroids; open or degenerate ways use the
mean of their vertices. The additional buildings, green, and paths collections
contain projected OSM geometry. Relation labels use the first outer ring centroid.

`src/map.ts` exports a live `METERS_PER_PX` scale and `metersToPx` / `pxToMeters`.
The initial scale still fits the original campus bounds, independently of the expanded 1,360 m exploration radius. Resizing preserves meters per CSS pixel.
The canvas uses device pixels for sharpness; interaction coordinates use CSS pixels.
`touch.ts` handles pointer dragging, two-finger pinch, wheel/trackpad zoom,
and double-click zoom. Use +/− buttons or keys to zoom (full-area overview–8×), arrow keys to
pan, and Reset or 0 to restore the original view. Pointer capture keeps drags
working outside the canvas; pointer cancellation clears gesture state.
Only the downloaded Bocconi neighbourhood is available; no global map tiles
are fetched when panning or zooming.

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright),
available under the Open Database License (ODbL).

## Future shared website

Keep TouchMap independent while EchoSpace develops separately.
`npm run build:integrated` builds for the proposed `/touchmap/` route.
See [INTEGRATION.md](INTEGRATION.md) for hosting, read-only status access,
audio ownership, and the boundary with the future EchoSpace dashboard.

## Haptic exploration (Mac demo)

`npm run dev:local` builds a resident AppKit helper with Xcode Command Line
Tools. Start enables haptics with three startup pulses and unlocks speech.
Surface exploration has no audio textures or test beep; route practice adds spoken directions.

| Region | Feedback |
| --- | --- |
| Road corridor (including sidewalks) | No pulses |
| Building footprint | Generic pulse immediately, then every 80 ms |
| Other / demo open space | Alignment pulse every 380 ms |
| Park or lawn (distinct data categories) | Alignment pulse every 220 ms |
| Path inside park/lawn | Two generic pulses 80 ms apart, then 420 ms gap |

These are public AppKit pattern choices, not calibrated motor amplitudes.
Buildings take precedence over estimated road corridors. Road widths use OSM
width/lanes when present and demo defaults otherwise. Polygon holes are preserved.
No debounce or boundary hysteresis is applied. Leaving the canvas, hovering a
control, or dragging with the mouse pauses pulses. Stationary hover continues.
Single-finger touch explores; two fingers move/zoom. Zooming rechecks the point.
On this implementation only the Mac loopback bridge generates physical haptics;
opening the LAN page on a phone does not provide native phone vibration.

Pause, tab hiding, or loss of focus stops exploration. A native 800 ms heartbeat
watchdog stops feedback if the browser stalls or disconnects. The old 10-second
test limit is removed for exploration. One client owns the helper at a time.
The helper retains current state and generates pulses locally, so browser events
do not enqueue a long sequence of future vibrations. `fundamental` snapshots
remain untouched.

For a small surface-only refresh, run `npm run fetch-map -- --surfaces-only`.
If Overpass is unavailable, an OSM API bounding-box JSON export can be processed
with `node scripts/fetch-map.mjs --surfaces-only --osm-file /path/to/export.json`.
This preserves the prior building and landmark snapshot; metadata records the
new surface source/time and the older building snapshot time separately.

The expanded OSM snapshot includes boundary margin beyond the visible circle.
Incomplete boundary relations must be checked against the exploration radius.

Zoom-out stops at the requested 0.49× overview. Wider windows raise that
minimum as needed to keep the map filling the visible area, rather than showing
a small circle surrounded by blank space. Reset restores the original 1× view.

## Demo route overlays

When a personal `public/home.local.json` exists, the map labels it Home and
offers two selectable offline route overlays: Bocconi Sport Center and Sarfatti Building.
Only the selected route is drawn. Default is selected on initial load and hides both routes; select Default again to clear a destination route.
The connected road/path graph supplies the lines; blue is Sport Center and pink
dashes are Sarfatti. The destination buttons switch the visible route. Short dotted endpoint
connectors are approximate links to building centroids, not verified entrances.
These are demo routes with spoken practice directions, not access-checked pedestrian navigation.
They do not modify region classification, haptics, or the offline map dataset.
The personal coordinates remain outside Git; route geometry is computed locally.

All interface controls and feedback states are in English. Named Bocconi
buildings use English labels; roads retain their official local proper names.

### Spoken route practice

Start and destination selection automatically focus Home and place the exploration point there.
The Home button returns it to the start. After 500 ms without exploration movement,
the map centers the point without changing zoom (subject to map boundary limits).
The geographic position is retained, and continued pointer motion uses an offset
so recentering does not jump back to the old cursor position. Panning, pinching,
leaving the canvas, and backgrounding cancel pending centering. A lifted touch
keeps its marker but stops haptics. The point stays anchored during view changes
until the next pointer interaction; this does not move the operating system cursor.
Select a destination, then trace its line with one finger (or hover with a mouse).
The point represents the person. English speech and the instruction card report
meters to the next turn, left/right turns relative to the route's direction of
travel, departure from the route, and arrival at the destination map marker.
Two fingers still pan/zoom; all surface haptics remain independent of navigation.
Default hides the route and cancels guidance. Repeat instruction replays the
current instruction; Mute voice silences speech without stopping exploration.

Directions use offline route-edge names and meter coordinates, so zooming does
not change distances. Unnamed paths are announced as such. Close OSM junction
pieces are combined; distance announcements are grouped rather than spoken on
every pointer movement. An ordinary spoken instruction finishes without interruption, then
there is a half-second pause measured from its completion. Speech runs at 1.15× speed with concise prompts. Only the latest
position prompt can be pending; identical cues and recent boundary oscillations
are suppressed. Repeat instruction also respects the pause. Default, mute, and
leaving the page stop speech immediately.

The voice selector offers at most three curated voices, preferring enhanced/natural English voices when installed, then
conversational voices such as Samantha, and remembers a manual selection locally.
Voice changes apply to the next instruction. Browser speech synthesis needs a user gesture. Actual
voice availability depends on the device; errors appear on the instruction card.
The dotted destination connection leads to a building marker, not a verified
entrance. This is pre-trip demo practice, not GPS or validated pedestrian routing.

Run `pnpm test` with Node 22.6+ for direction, geometry, and offline-route tests.

### Desktop mouse capture

Start, destination selection, or clicking the map requests browser Pointer Lock
on devices with a mouse. Relative movement controls the exploration point without
hitting desktop edges; recentering preserves that position. Esc releases the
mouse and stops exploration feedback. Click the map to capture it again. A solo
Command (Meta) key press returns Home on release; Command combinations remain
browser shortcuts. Touch exploration and two-finger gestures remain available.

If the browser rejects Pointer Lock, a visible message explains the failure and
normal mouse exploration remains available. The Codex in-app browser rejected
capture during verification with a Chromium error; true capture could not be
verified there. Command-to-Home and Esc-to-release were verified in that browser.


Turn-now guidance has the highest speech priority: entering the turn zone
(within 8 route meters), or sampling across a turn while still within 25 meters
of the junction, immediately cancels ordinary speech and its pending queue.
It says “Turn left/right now” and bypasses the normal pause. Repeated samples
at that junction do not interrupt the turn announcement again. Street-name
changes that continue straight do not preempt speech. Explicit mute still applies.
