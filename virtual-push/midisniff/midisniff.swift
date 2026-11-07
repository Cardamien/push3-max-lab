// midisniff: logs every MIDI message arriving from CoreMIDI sources whose
// name contains the given text (default "Push 3"). Usage: midisniff <log> [name part]
import CoreMIDI
import Foundation
let logPath = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "midisniff.log"
let part = CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : "Push 3"
FileManager.default.createFile(atPath: logPath, contents: nil)
let log = FileHandle(forWritingAtPath: logPath)!
func write(_ s: String) { log.write((s + "\n").data(using: .utf8)!) }
var client = MIDIClientRef(); MIDIClientCreateWithBlock("midisniff" as CFString, &client) { _ in }
var names: [MIDIEndpointRef: String] = [:]
var port = MIDIPortRef()
MIDIInputPortCreateWithBlock(client, "in" as CFString, &port) { list, srcRef in
    let name = srcRef.map { names[$0.assumingMemoryBound(to: MIDIEndpointRef.self).pointee] ?? "?" } ?? "?"
    var p = list.pointee.packet
    for _ in 0..<list.pointee.numPackets {
        let bytes = withUnsafeBytes(of: p.data) { Array($0.prefix(Int(p.length))) }
        write("\(Date().timeIntervalSince1970) \(name): " + bytes.map { String(format: "%02X", $0) }.joined(separator: " "))
        p = MIDIPacketNext(&p).pointee
    }
}
for i in 0..<MIDIGetNumberOfSources() {
    let src = MIDIGetSource(i)
    var cf: Unmanaged<CFString>?
    MIDIObjectGetStringProperty(src, kMIDIPropertyDisplayName, &cf)
    let name = cf?.takeRetainedValue() as String? ?? "?"
    if name.contains(part) {
        names[src] = name
        let box = UnsafeMutablePointer<MIDIEndpointRef>.allocate(capacity: 1); box.pointee = src
        MIDIPortConnectSource(port, src, box)
        write("listening: \(name)")
    }
}
signal(SIGTERM) { _ in exit(0) }; signal(SIGINT) { _ in exit(0) }
CFRunLoopRun()
