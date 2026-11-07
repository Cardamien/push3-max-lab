// fakeports: creates virtual CoreMIDI ports named like a tethered Push 3
// and logs every message Live or the Push 3 helper sends to them.
// Usage: fakeports <log file>   (Ctrl-C or SIGTERM to stop)
// stdin: one message per line, "<port index 0-2> <hex bytes>", sent from
// that port's source (0 Live, 1 User, 2 External), e.g. "0 B0 55 7F".
import CoreMIDI
import Foundation

let logPath = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "fakeports.log"
FileManager.default.createFile(atPath: logPath, contents: nil)
let log = FileHandle(forWritingAtPath: logPath)!
func write(_ s: String) { log.write((s + "\n").data(using: .utf8)!) }

let entities = ["Live Port", "User Port", "External Port"]
var client = MIDIClientRef()
MIDIClientCreateWithBlock("Ableton Push 3" as CFString, &client) { _ in }

var sources: [MIDIEndpointRef] = []
var dests: [MIDIEndpointRef] = []
for e in entities {
    let name = "Ableton Push 3 (\(e))"
    var src = MIDIEndpointRef()
    MIDISourceCreate(client, name as CFString, &src)
    var dst = MIDIEndpointRef()
    MIDIDestinationCreateWithBlock(client, name as CFString, &dst) { list, _ in
        var p = list.pointee.packet
        for _ in 0..<list.pointee.numPackets {
            let bytes = withUnsafeBytes(of: p.data) { Array($0.prefix(Int(p.length))) }
            write("\(Date().timeIntervalSince1970) IN \(e): " + bytes.map { String(format: "%02X", $0) }.joined(separator: " "))
            p = MIDIPacketNext(&p).pointee
        }
    }
    for ep in [src, dst] {
        MIDIObjectSetStringProperty(ep, kMIDIPropertyManufacturer, "Ableton" as CFString)
        MIDIObjectSetStringProperty(ep, kMIDIPropertyModel, "Ableton Push 3" as CFString)
    }
    sources.append(src); dests.append(dst)
    write("created \(name)")
}
Thread {
    while let line = readLine() {
        let parts = line.split(separator: " ")
        guard parts.count > 1, let i = Int(parts[0]), i < sources.count else { continue }
        let bytes = parts.dropFirst().compactMap { UInt8($0, radix: 16) }
        var list = MIDIPacketList()
        let pkt = MIDIPacketListInit(&list)
        MIDIPacketListAdd(&list, MemoryLayout<MIDIPacketList>.size, pkt, 0, bytes.count, bytes)
        MIDIReceived(sources[i], &list)
        write("\(Date().timeIntervalSince1970) OUT \(entities[i]): " + line.dropFirst(2))
    }
}.start()
signal(SIGTERM) { _ in exit(0) }
signal(SIGINT) { _ in exit(0) }
CFRunLoopRun()
