# TouchMap × EchoSpace

**Before you leave, touch the map. On the street, hear the space.**

BAINSA × Anthropic Hackathon · Track 1 · September 26, 2026  
Built by Daniel Chen

TouchMap × EchoSpace explores how blind and low-vision people can build a mental picture of a place through touch and sound. TouchMap supports exploring a neighbourhood before a trip. EchoSpace turns sensed surfaces into spatial audio on an iPhone.

The two prototypes address different moments of the same journey. They currently run independently; transferring a planned route between them is future work.

## Start here

- **[Project overview](TouchMap_EchoSpace_Overview.pdf)** — motivation, user journey, and what makes the idea different.
- **Demo video** — to be supplied separately through the event submission form; no video is bundled in this source folder.
- **Technical briefs:** [TouchMap](TouchMap_Technical_Summary.pdf) · [EchoSpace](EchoSpace-Technical-Summary.pdf).

## One journey, two ways to understand space

| | TouchMap — before the trip | EchoSpace — during the trip |
| --- | --- | --- |
| Experience | Trace streets, buildings, parks, and paths; rehearse a route with spoken guidance. | Hear spatial cues from nearby sensed surfaces, with faster pulses at shorter distances. |
| Input | Bundled OpenStreetMap geometry around Bocconi, Milan. | iPhone LiDAR, camera depth estimates, and device/headphone motion. |
| Feedback | Surface-specific Mac trackpad haptics and optional spoken route instructions. | Binaural audio through headphones, with visual diagnostics for the demo. |
| Platform | TypeScript + Vite web app; Swift/AppKit haptic helper. | SwiftUI + ARKit + Core ML + AVAudioEngine, iOS 17+. |

The aim is to communicate spatial structure: where streets connect before leaving, and where sensed surfaces are relative to the listener during exploration. Route instructions are an optional layer on top of TouchMap's tactile exploration.

## Run TouchMap

### Requirements

- Node.js **22.12 or newer** and pnpm (the repository includes a pnpm lockfile).
- For physical haptics: macOS, Xcode Command Line Tools, and a compatible haptic trackpad.
- A browser with speech synthesis for spoken guidance; available voices depend on the device.

From the repository root:

```sh
cd touchmap
pnpm install --frozen-lockfile
pnpm dev:local
```

Open **http://127.0.0.1:5174/** and press **Start**. The loopback development server builds and connects the native haptic helper.

Explore the map with the pointer or touch. Roads remain quiet; buildings and other surface types use different pulse patterns. Two-finger gestures pan and zoom. On supported mouse browsers, clicking the map requests Pointer Lock; **Esc** releases it.

### Optional route demo

The route demo needs a local starting point. Create `touchmap/public/home.local.json` with this public demo origin:

```json
{ "x": 0, "y": 0 }
```

Coordinates are local map meters relative to the Bocconi map origin, not latitude/longitude. This example is a demo starting point, not a home address. Reload the page, choose Bocconi Sport Center or Sarfatti Building, and trace the route to hear directions. The file is ignored by Git; basic map exploration also works without it.

### Browser-only mode and checks

```sh
pnpm dev          # HTTPS on the local network; accept the development certificate
pnpm test         # route, guidance, and speech queue checks
pnpm build        # TypeScript checks and production web build
```

Physical haptics require `dev:local` on the Mac. A phone browser or a static web deployment does not provide the native Mac vibration bridge. The map snapshot is bundled; normal startup does not fetch new map data.

[TouchMap implementation notes](touchmap/README.md)

## Run EchoSpace

### Requirements

- A Mac with Xcode and an iOS SDK compatible with the connected device.
- A **real LiDAR-equipped iPhone running iOS 17+**; the target demo device is iPhone 14 Pro Max. The simulator cannot reproduce the sensing demo.
- AirPods or stereo headphones for spatial audio. Head alignment additionally requires supported headphone motion data.

1. Open `EchoSpace-DepthAnything/EchoSpace.xcodeproj` in Xcode and select the **EchoSpace** scheme.
2. Under **Signing & Capabilities**, select your own development team and a unique bundle identifier.
3. Connect and select your iPhone, enable Developer Mode if required, and run with **Cmd+R**.
4. Connect headphones, hold the phone upright with its rear camera facing forward, press **Start**, and allow the requested permissions.
5. Use **Axis Test** to check left/right/ahead. For supported headphones, face the same direction as the camera and press **Calibrate Headphones & Camera** while still.

The Core ML model is bundled; no inference server or API key is needed. If model files are missing, restore the pinned model from the EchoSpace directory with:

```sh
python3 Scripts/fetch_depth_model.py
```

An unsigned compile check, from the repository root:

```sh
xcodebuild -project EchoSpace-DepthAnything/EchoSpace.xcodeproj \
  -scheme EchoSpace -configuration Debug -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -derivedDataPath /tmp/EchoSpaceSubmissionBuild CODE_SIGNING_ALLOWED=NO build
```

[Device setup, native regression commands, and engineering notes](EchoSpace-DepthAnything/README.md)

## How it works

**TouchMap:** OpenStreetMap geometry is projected into local meters. Polygon and road-distance checks classify the explored surface. A Swift/AppKit helper produces haptic patterns. A connected street/path graph supports shortest-path route rehearsal, while a priority-aware Web Speech queue handles guidance and turn cues.

**EchoSpace:** ARKit depth is transformed into world-space geometry. Current surface and near-obstacle targets drive synthesized audio through `AVAudioEnvironmentNode`. Headphone motion supports calibrated horizontal head alignment. An experimental Depth Anything V2 model estimates relative camera depth, calibrated against LiDAR; validity and freshness checks gate the resulting cues.

## Prototype status and limits

- These are hackathon prototypes, not a validated mobility aid. They have not yet been tested with blind users; absence of a cue does not establish a safe path.
- TouchMap provides offline exploration and route rehearsal, not live GPS navigation or verified accessible routes. Destination connectors are approximate.
- EchoSpace senses surfaces, including walls or ground; it does not establish semantic obstacle identity or whether a route is traversable.
- The experimental camera preview targets roughly 3–10 m under suitable conditions. It does not guarantee that detection range or extend LiDAR hardware range.
- **Demo continuous sound** is enabled by default in the submitted EchoSpace version. Its labeled 400 Hz heartbeat is a presentation cue, not an obstacle detection. Disable it to evaluate silence when there is no valid target.
- The module notes record earlier local build and regression results. Physical-device accuracy, headphone latency, recording stability, and user validation remain separate checks; no new test run is claimed by this README update.

Next steps are testing with blind and low-vision participants and orientation-and-mobility instructors, connecting the two prototypes, and expanding accessible input and tactile feedback.

## Repository guide

```text
touchmap/                         Web app, native haptic bridge, offline map, tests
EchoSpace-DepthAnything/           iOS app, Core ML model, provenance, native checks
TouchMap_EchoSpace_Overview.pdf    Project overview
TouchMap_Technical_Summary.pdf     TouchMap technical brief
EchoSpace-Technical-Summary.pdf   EchoSpace technical brief
```

The module READMEs retain development history. Older iteration sections describe earlier behavior; the current submission summary above and the latest code should guide reproduction.

## Credits

- Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the Open Database License.
- Depth Anything V2 Small and Apple's Core ML conversion: pinned provenance and third-party license information are in [EchoSpace's ThirdParty directory](EchoSpace-DepthAnything/ThirdParty/).
- This repository contains the implementation source and model resources; build the application locally using the steps above.
