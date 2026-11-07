// midiquery: sends sysex requests to a CoreMIDI destination whose name contains
// the given text and prints every reply from the matching source.
// Usage: midiquery "<name part>" <hex bytes of one message> [more messages...]
//        a message "palette" expands to the 128 Get-LED-Color-Palette-Entry requests.
import CoreMIDI
import Foundation
let part = CommandLine.arguments[1]
var msgs: [[UInt8]] = []
for a in CommandLine.arguments.dropFirst(2) {
    if a == "palette" { for i in 0..<128 { msgs.append([0xF0,0x00,0x21,0x1D,0x01,0x01,0x04,UInt8(i),0xF7]) } }
    else { msgs.append(a.split(separator: " ").compactMap { UInt8($0, radix: 16) }) }
}
var client = MIDIClientRef(); MIDIClientCreateWithBlock("midiquery" as CFString, &client) { _ in }
var inPort = MIDIPortRef(); var outPort = MIDIPortRef()
MIDIOutputPortCreate(client, "out" as CFString, &outPort)
var pending = msgs.count
MIDIInputPortCreateWithBlock(client, "in" as CFString, &inPort) { list, _ in
    var p = list.pointee.packet
    for _ in 0..<list.pointee.numPackets {
        let b = withUnsafeBytes(of: p.data) { Array($0.prefix(Int(p.length))) }
        if b.first == 0xF0 { print(b.map { String(format: "%02X", $0) }.joined(separator: " ")); pending -= 1 }
        p = MIDIPacketNext(&p).pointee
    }
}
func name(_ e: MIDIEndpointRef) -> String { var cf: Unmanaged<CFString>?; MIDIObjectGetStringProperty(e, kMIDIPropertyDisplayName, &cf); return cf?.takeRetainedValue() as String? ?? "" }
var dest = MIDIEndpointRef()
for i in 0..<MIDIGetNumberOfDestinations() where name(MIDIGetDestination(i)).contains(part) { dest = MIDIGetDestination(i); break }
for i in 0..<MIDIGetNumberOfSources() where name(MIDIGetSource(i)).contains(part) { MIDIPortConnectSource(inPort, MIDIGetSource(i), nil); break }
guard dest != 0 else { print("no destination"); exit(1) }
DispatchQueue.global().async {
    for m in msgs {
        var list = MIDIPacketList(); let pk = MIDIPacketListInit(&list)
        MIDIPacketListAdd(&list, MemoryLayout<MIDIPacketList>.size, pk, 0, m.count, m)
        MIDISend(outPort, dest, &list); usleep(15000)
    }
    sleep(2); exit(0)
}
CFRunLoopRun()
