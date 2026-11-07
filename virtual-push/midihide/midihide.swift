// midihide: hides (or shows again) the real Push 3's CoreMIDI endpoints by setting
// kMIDIPropertyPrivate, so the Push helper binds the virtual ports instead.
// Usage: midihide hide | show | rename | restore | list   (only endpoints that belong to a device, never virtual ones)
// rename turns the hardware endpoint names "Live Port" into "HW Live" (no "Port"), so the helper's name search skips them
// while Live still sees the device; restore puts the names back. hide/show toggle kMIDIPropertyPrivate (hides from Live too).
import CoreMIDI
import Foundation
let mode = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "list"
var client = MIDIClientRef(); MIDIClientCreateWithBlock("midihide" as CFString, &client) { _ in }
func name(_ e: MIDIEndpointRef) -> String { var cf: Unmanaged<CFString>?; MIDIObjectGetStringProperty(e, kMIDIPropertyDisplayName, &cf); return cf?.takeRetainedValue() as String? ?? "" }
func isHardware(_ e: MIDIEndpointRef) -> Bool { var ent = MIDIEntityRef(); return MIDIEndpointGetEntity(e, &ent) == noErr && ent != 0 }
var eps: [MIDIEndpointRef] = []
// walk devices so private (hidden) endpoints are found too
for d in 0..<MIDIGetNumberOfDevices() { let dev = MIDIGetDevice(d)
    for e in 0..<MIDIDeviceGetNumberOfEntities(dev) { let ent = MIDIDeviceGetEntity(dev, e)
        for s in 0..<MIDIEntityGetNumberOfSources(ent) { eps.append(MIDIEntityGetSource(ent, s)) }
        for s in 0..<MIDIEntityGetNumberOfDestinations(ent) { eps.append(MIDIEntityGetDestination(ent, s)) } } }
func rawName(_ e: MIDIEndpointRef) -> String { var cf: Unmanaged<CFString>?; MIDIObjectGetStringProperty(e, kMIDIPropertyName, &cf); return cf?.takeRetainedValue() as String? ?? "" }
for e in eps where (name(e).contains("Push 3") || rawName(e).contains("Push 3") || name(e).contains("Hardware controller")) && isHardware(e) {
    if mode == "model" || mode == "model-restore" {
        let rc = MIDIObjectSetStringProperty(e, kMIDIPropertyModel, (mode == "model" ? "Hardware" : "Ableton Push 3") as CFString)
        var cf: Unmanaged<CFString>?; MIDIObjectGetStringProperty(e, kMIDIPropertyModel, &cf); print("\(name(e)): model now \(cf?.takeRetainedValue() as String? ?? "?") (rc \(rc))"); continue }
    if mode == "offline" || mode == "online" {
        let rc = MIDIObjectSetIntegerProperty(e, kMIDIPropertyOffline, mode == "offline" ? 1 : 0)
        var v: Int32 = -1; MIDIObjectGetIntegerProperty(e, kMIDIPropertyOffline, &v); print("\(name(e)): offline now \(v) (rc \(rc))"); continue }
    if mode == "manuf" || mode == "manuf-restore" {
        let rc = MIDIObjectSetStringProperty(e, kMIDIPropertyManufacturer, (mode == "manuf" ? "Hardware" : "Ableton") as CFString)
        var cf: Unmanaged<CFString>?; MIDIObjectGetStringProperty(e, kMIDIPropertyManufacturer, &cf)
        print("\(name(e)): manufacturer now \(cf?.takeRetainedValue() as String? ?? "?") (rc \(rc))"); continue }
    if mode == "rename" || mode == "restore" {
        let n = rawName(e); let new = mode == "rename" ? (n.hasPrefix("HW ") ? n : "HW " + n.replacingOccurrences(of: " Port", with: "")) : (n.hasPrefix("HW ") ? String(n.dropFirst(3)) + " Port" : n)
        // the device too: the helper matches "Push 3" anywhere in the display name (device name + endpoint name) or the model
        var ent = MIDIEntityRef(); MIDIEndpointGetEntity(e, &ent); var dev = MIDIDeviceRef(); if ent != 0 { MIDIEntityGetDevice(ent, &dev) }
        if dev != 0 { MIDIObjectSetStringProperty(dev, kMIDIPropertyName, (mode == "rename" ? "Hardware controller" : "Ableton Push 3") as CFString)
                      MIDIObjectSetStringProperty(dev, kMIDIPropertyModel, (mode == "rename" ? "Hardware" : "Ableton Push 3") as CFString) }
        MIDIObjectSetStringProperty(e, kMIDIPropertyModel, (mode == "rename" ? "Hardware" : "Ableton Push 3") as CFString)
        let rc = MIDIObjectSetStringProperty(e, kMIDIPropertyName, new as CFString); print("\(n) -> \(rawName(e)) (rc \(rc)) display: \(name(e))"); continue }
    var priv: Int32 = 0; MIDIObjectGetIntegerProperty(e, kMIDIPropertyPrivate, &priv)
    if mode == "hide" { MIDIObjectSetIntegerProperty(e, kMIDIPropertyPrivate, 1) } else if mode == "show" { MIDIObjectSetIntegerProperty(e, kMIDIPropertyPrivate, 0) }
    var after: Int32 = 0; MIDIObjectGetIntegerProperty(e, kMIDIPropertyPrivate, &after)
    print("\(name(e)): private \(priv) -> \(after)")
}
print("visible sources now: " + (0..<MIDIGetNumberOfSources()).map { name(MIDIGetSource($0)) }.filter { $0.contains("Push") }.joined(separator: " | "))
