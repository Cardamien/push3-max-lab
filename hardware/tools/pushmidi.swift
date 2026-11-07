// pushmidi: sends messages to the real Push 3's Live Port or User Port and prints
// what both ports send back, for probes B1 (mode switch) and B2 (LEDs).
// Usage: pushmidi <seconds> [live|user "<hex bytes>"]...
//   pushmidi 5                                  listen only
//   pushmidi 5 live "F0 00 21 1D 01 01 0A 01 F7"  switch to User Mode, then listen
// Matches the hardware's exact display names, never the virtual-Push stand-ins
// "Ableton Push 3 (Live Port)". Refuses SysEx outside a read/LED/mode allowlist
// (never 0x39 POWER_COMMAND). Active Sensing (FE) is counted, not printed.
import CoreMIDI
import Foundation

let ports = ["live": "Ableton Push 3 Live Port", "user": "Ableton Push 3 User Port"]
let allowedSysex: Set<UInt8> = [0x0A, 0x3A, 0x3B, 0x04]   // mode, power state, RGB LED, palette read

let args = Array(CommandLine.arguments.dropFirst())
guard let secs = args.first.flatMap(Double.init) else { print("usage: pushmidi <seconds> [live|user \"<hex>\"]..."); exit(2) }
var sends: [(String, [UInt8])] = []
var i = 1
while i + 1 < args.count {
    let bytes = args[i + 1].split(separator: " ").compactMap { UInt8($0, radix: 16) }
    guard ports[args[i]] != nil else { print("unknown port \(args[i])"); exit(2) }
    if bytes.first == 0xF0 {
        guard bytes.count > 7, bytes[1...5] == [0x00, 0x21, 0x1D, 0x01, 0x01], allowedSysex.contains(bytes[6]) else {
            print("refused: sysex command not in allowlist: \(args[i + 1])"); exit(2)
        }
    }
    sends.append((args[i], bytes)); i += 2
}

func name(_ e: MIDIEndpointRef) -> String {
    var cf: Unmanaged<CFString>?; MIDIObjectGetStringProperty(e, kMIDIPropertyDisplayName, &cf)
    return cf?.takeRetainedValue() as String? ?? ""
}
func stamp() -> String { String(format: "%8.3f", Date().timeIntervalSince(t0)) }
let t0 = Date()
var client = MIDIClientRef(); MIDIClientCreateWithBlock("pushmidi" as CFString, &client) { _ in }
var outPort = MIDIPortRef(); MIDIOutputPortCreate(client, "out" as CFString, &outPort)
var sensing: [String: Int] = [:]
let lock = NSLock()

for (label, display) in ports.sorted(by: { $0.key < $1.key }) {
    var src = MIDIEndpointRef()
    for k in 0..<MIDIGetNumberOfSources() where name(MIDIGetSource(k)) == display { src = MIDIGetSource(k) }
    guard src != 0 else { print("no source \(display)"); exit(1) }
    var inPort = MIDIPortRef()
    MIDIInputPortCreateWithBlock(client, label as CFString, &inPort) { list, _ in
        var p = list.pointee.packet
        for _ in 0..<list.pointee.numPackets {
            let b = withUnsafeBytes(of: p.data) { Array($0.prefix(Int(p.length))) }
            lock.lock()
            if b == [0xFE] { sensing[label, default: 0] += 1 }
            else { print("\(stamp()) [\(label.uppercased())] " + b.map { String(format: "%02X", $0) }.joined(separator: " ")) }
            lock.unlock()
            p = MIDIPacketNext(&p).pointee
        }
    }
    MIDIPortConnectSource(inPort, src, nil)
}

func dest(_ label: String) -> MIDIEndpointRef {
    for k in 0..<MIDIGetNumberOfDestinations() where name(MIDIGetDestination(k)) == ports[label]! { return MIDIGetDestination(k) }
    print("no destination \(ports[label]!)"); exit(1)
}

DispatchQueue.global().async {
    for (label, m) in sends {
        var list = MIDIPacketList(); let pk = MIDIPacketListInit(&list)
        MIDIPacketListAdd(&list, MemoryLayout<MIDIPacketList>.size, pk, 0, m.count, m)
        MIDISend(outPort, dest(label), &list)
        lock.lock(); print("\(stamp()) sent [\(label.uppercased())] " + m.map { String(format: "%02X", $0) }.joined(separator: " ")); lock.unlock()
        usleep(20000)
    }
    usleep(UInt32(secs * 1_000_000))
    lock.lock(); print("active sensing: \(sensing)"); lock.unlock()
    exit(0)
}
CFRunLoopRun()
