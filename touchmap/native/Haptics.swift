import AppKit
import Foundation
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
var mode = "idle"
var activeUntil = Date.distantPast
var nextPulse = Date.distantFuture
var step = 0
var leased = false
func reply(_ event: String, _ id: Int = 0) {
    let data = try! JSONSerialization.data(withJSONObject: ["event": event, "id": id])
    FileHandle.standardOutput.write(data + Data([10]))
}
func pulse() {
    let pattern: NSHapticFeedbackManager.FeedbackPattern =
        ["park", "lawn", "other"].contains(mode) ? .alignment : .generic
    NSHapticFeedbackManager.defaultPerformer.perform(pattern, performanceTime: .now)
    let intervals: [Double]
    switch mode {
    case "building": intervals = [0.08]
    case "other": intervals = [0.38]
    case "park", "lawn": intervals = [0.22]
    case "park-path": intervals = [0.08, 0.42]
    case "startup": intervals = [0.20]
    default: return
    }
    nextPulse = Date().addingTimeInterval(intervals[step % intervals.count])
    step += 1
    if mode == "startup" && step >= 3 { mode = "idle" }
}
let timer = Timer(timeInterval: 0.01, repeats: true) { _ in
    guard leased else { return }
    if Date() >= activeUntil {
        leased = false; mode = "idle"; reply("stopped"); return
    }
    if mode != "idle" && Date() >= nextPulse { pulse() }
}
RunLoop.main.add(timer, forMode: .common)
DispatchQueue.global(qos: .userInteractive).async {
    while let line = readLine() {
        guard let data = line.data(using: .utf8),
              let message = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let action = message["action"] as? String else { continue }
        let id = message["id"] as? Int ?? 0
        let requestedMode = message["mode"] as? String ?? "idle"
        DispatchQueue.main.async {
            switch action {
            case "state":
                guard ["idle", "startup", "building", "other", "park", "lawn", "park-path"].contains(requestedMode) else { return }
                leased = true; activeUntil = Date().addingTimeInterval(0.8)
                if mode != requestedMode {
                    mode = requestedMode; step = 0
                    if mode != "idle" { pulse() }
                }
                reply("applied", id)
            case "keepalive":
                if leased { activeUntil = Date().addingTimeInterval(0.8) }
            case "stop":
                leased = false; mode = "idle"; reply("stopped", id)
            default: break
            }
        }
    }
    DispatchQueue.main.async { app.terminate(nil) }
}
reply("ready")
app.run()
