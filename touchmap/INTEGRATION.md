# TouchMap × EchoSpace integration handoff

## Scope

The shared website is a future shell around two independent features:

| Proposed route | Owner and purpose | Current state |
| --- | --- | --- |
| `/` | Shared project introduction and feature navigation | Not implemented |
| `/touchmap/` | TouchMap: explore the downloaded Bocconi map | Standalone app implemented; subpath build available |
| `/echospace/` | EchoSpace: observe the iPhone's camera, surfaces, obstacles and motion warnings | Native iPhone app implemented; web dashboard and phone transport not implemented |

These are proposed integration paths, not live URLs. Neither feature should import the other's core processing. TouchMap's local 2D projected map coordinates and EchoSpace's session-local 3D AR coordinates are different reference frames; do not merge them or imply that the phone is localized on this map.

## Build and mount

```sh
npm run build              # existing standalone root deployment
npm run build:integrated   # assets and map requests under /touchmap/
```

Both commands write `dist/`; use the output from the appropriate build. Copy integrated build contents into the host's `touchmap` directory and redirect `/touchmap` to `/touchmap/`. Serve the map JSON and JS assets as files, not through the shared site's HTML fallback. Map requests already use `import.meta.env.BASE_URL`; preserve that convention for future assets.

The first integration should use separate page navigation, or a same-origin iframe if a persistent site shell is needed. TouchMap currently owns a full-page canvas and global styles, so do not paste its DOM into another app. Example embedding:

```html
<iframe id="touchmap-frame" src="/touchmap/" title="TouchMap — explore the campus map"
        style="width:100%; height:80vh; border:0"></iframe>
```

Keep a descriptive frame title, keyboard navigation, and a visible way back to the shared home page. Audio must still begin with the user's Start click inside TouchMap; the host must not synthesize that click or bypass the gesture requirement. When switching away, remove the iframe (or navigate away) so an invisible copy does not retain audio resources. A reusable SPA mount/unmount API is not implemented.

## Read-only startup status, version 1

`src/integration.ts` exposes `window.touchmapIntegration` in the TouchMap window:

```ts
const api = iframe.contentWindow.touchmapIntegration; // same origin, after iframe load
const unsubscribe = api.subscribe(renderStatus);
renderStatus(api.getState());
// When removing/replacing the frame:
unsubscribe();
```

Payload:

```json
{
  "version": 1,
  "feature": "touchmap",
  "map": "ready",
  "audioUnlock": "succeeded"
}
```

`map` is `loading | ready | error`. `audioUnlock` is `waiting | starting | succeeded | error` and reports speech unlock/playback attempts: Start sets starting, the first spoken prompt sets succeeded, and a speech error sets error. It is **not** live audio-device health, continuous playback status, microphone state, user location, or EchoSpace telemetry. `getState()` returns the latest immutable snapshot; `subscribe()` reports subsequent changes and returns an unsubscribe function. Host callback failures are isolated from map/audio initialization.

This API works in the same document or a same-origin iframe. There is no cross-origin postMessage bridge, remote control, backend, video stream, or authentication implementation. If those become necessary, define allowed origins and a versioned message protocol explicitly rather than exposing global control commands.

## Future EchoSpace boundary

EchoSpace should own its phone connection, camera stream, AR timestamps, obstacle data, motion warning state, and stale/disconnected display. Phone sensing and spatial audio must continue independently of the website connection. The shared shell should coordinate navigation and visual design, not alter obstacle decisions or mix TouchMap sounds with EchoSpace's phone alerts automatically.

Before integration, agree on the site's visual design, hosting origin and paths, which feature owns audio during the demo, and the EchoSpace transport format. No transport format is claimed to exist yet.

## Integration acceptance checks

- Serve the integrated build at `/touchmap/`; JS and `map.json` load without root-path 404s.
- Start, map pan/zoom, keyboard controls, and OSM attribution still work.
- The host can read startup state after frame load and observe subsequent changes.
- Switching away removes the map frame; returning creates a clean instance requiring an explicit Start.
- EchoSpace's unavailable/disconnected status never prevents TouchMap from opening.
