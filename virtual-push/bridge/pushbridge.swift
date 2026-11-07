// pushbridge: the virtual Push 3's MIDI side.
// - Creates the three CoreMIDI ports a tethered Push 3 has ("Ableton Push 3 (Live Port|User Port|External Port)"),
//   which Live's Push helper binds like the hardware.
// - Sends Active Sensing (FE) every 270 ms on the Live and User ports, as the hardware does.
// - Everything the helper sends to those ports (LED notes and CCs, sysex, clock) goes to Max as OSC on UDP 7476:
//     /in <port> <bytes...>        one message, port 0 Live, 1 User, 2 External
//     /bpm <float>                 once a second while MIDI clock (F8) is running
//     /transport start|continue|stop
// - Max sends what the face does as OSC on UDP 7475:
//     /midi <bytes...>             sent from the Live Port
//     /midi2 <bytes...>            sent from the User Port
// Usage: pushbridge [log file]     (Ctrl-C or SIGTERM to stop)
import CoreMIDI
import Foundation

let logPath = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "pushbridge.log"
FileManager.default.createFile(atPath: logPath, contents: nil)
let log = FileHandle(forWritingAtPath: logPath)!
func write(_ s: String) { log.write((s + "\n").data(using: .utf8)!) }
func hex(_ b: [UInt8]) -> String { b.map { String(format: "%02X", $0) }.joined(separator: " ") }

// --- OSC ------------------------------------------------------------------------
func oscPad(_ d: inout [UInt8]) { while d.count % 4 != 0 { d.append(0) } }
func oscInts(_ address: String, _ args: [Int32]) -> [UInt8] {
    var d = Array(address.utf8); d.append(0); oscPad(&d)
    var t = Array(("," + String(repeating: "i", count: args.count)).utf8); t.append(0); oscPad(&t); d += t
    for a in args { let v = UInt32(bitPattern: a); d += [UInt8(v >> 24), UInt8((v >> 16) & 255), UInt8((v >> 8) & 255), UInt8(v & 255)] }
    return d
}
func oscFloat(_ address: String, _ f: Float) -> [UInt8] {
    var d = Array(address.utf8); d.append(0); oscPad(&d); d += Array(",f".utf8) + [0, 0]
    let v = f.bitPattern; d += [UInt8(v >> 24), UInt8((v >> 16) & 255), UInt8((v >> 8) & 255), UInt8(v & 255)]; return d
}
func oscString(_ address: String, _ s: String) -> [UInt8] {
    var d = Array(address.utf8); d.append(0); oscPad(&d); d += Array(",s".utf8) + [0, 0]
    var a = Array(s.utf8); a.append(0); oscPad(&a); return d + a
}
// parse one OSC message with int (or float) arguments: returns (address, ints)
func oscParse(_ d: [UInt8]) -> (String, [Int32])? {
    guard let z = d.firstIndex(of: 0) else { return nil }
    let address = String(decoding: d[0..<z], as: UTF8.self)
    var i = (z / 4 + 1) * 4; guard i < d.count, d[i] == UInt8(ascii: ",") else { return nil }
    guard let tz = d[i...].firstIndex(of: 0) else { return nil }
    let tags = Array(d[(i + 1)..<tz]); i = (tz / 4 + 1) * 4; var out: [Int32] = []
    for t in tags {
        guard i + 4 <= d.count else { break }
        let v = UInt32(d[i]) << 24 | UInt32(d[i + 1]) << 16 | UInt32(d[i + 2]) << 8 | UInt32(d[i + 3]); i += 4
        if t == UInt8(ascii: "i") { out.append(Int32(bitPattern: v)) }
        else if t == UInt8(ascii: "f") { out.append(Int32(Float(bitPattern: v))) }
    }
    return (address, out)
}

// --- UDP to and from Max ------------------------------------------------------------
let toMax = socket(AF_INET, SOCK_DGRAM, 0)
var maxAddr = sockaddr_in(); maxAddr.sin_family = sa_family_t(AF_INET); maxAddr.sin_port = in_port_t(7476).bigEndian; maxAddr.sin_addr.s_addr = inet_addr("127.0.0.1")
func sendMax(_ d: [UInt8]) { d.withUnsafeBufferPointer { p in withUnsafePointer(to: &maxAddr) { a in a.withMemoryRebound(to: sockaddr.self, capacity: 1) { _ = sendto(toMax, p.baseAddress, p.count, 0, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } } } }

let fromMax = socket(AF_INET, SOCK_DGRAM, 0)
var inAddr = sockaddr_in(); inAddr.sin_family = sa_family_t(AF_INET); inAddr.sin_port = in_port_t(7475).bigEndian; inAddr.sin_addr.s_addr = inet_addr("127.0.0.1")
var one: Int32 = 1; setsockopt(fromMax, SOL_SOCKET, SO_REUSEADDR, &one, socklen_t(MemoryLayout<Int32>.size))
guard withUnsafePointer(to: &inAddr, { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(fromMax, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } }) == 0 else { write("cannot bind UDP 7475"); exit(1) }

// --- CoreMIDI ----------------------------------------------------------------------
let entities = ["Live Port", "User Port", "External Port"]
var client = MIDIClientRef(); MIDIClientCreateWithBlock("Ableton Push 3" as CFString, &client) { _ in }
var sources: [MIDIEndpointRef] = []
var clockCount = 0, clockT0 = Date().timeIntervalSince1970
for (port, e) in entities.enumerated() {
    let name = "Ableton Push 3 (\(e))"
    var src = MIDIEndpointRef(); MIDISourceCreate(client, name as CFString, &src)
    var dst = MIDIEndpointRef()
    MIDIDestinationCreateWithBlock(client, name as CFString, &dst) { list, _ in
        // walk the packets by pointer (a packet's data may exceed the 256 inline bytes), and join sysex spanning packets
        var pkt = UnsafePointer(withUnsafePointer(to: &UnsafeMutablePointer(mutating: list).pointee.packet) { $0 })
        for _ in 0..<list.pointee.numPackets {
            let len = Int(pkt.pointee.length)
            let dataPtr = UnsafeRawPointer(pkt).advanced(by: MemoryLayout<MIDIPacket>.offset(of: \.data)!).assumingMemoryBound(to: UInt8.self)
            let bytes = Array(UnsafeBufferPointer(start: dataPtr, count: len))
            var i = 0
            while i < bytes.count {
                let s = bytes[i]
                if !sysexBuf[port].isEmpty {                         // continuing a sysex from an earlier packet
                    if let end = bytes[i...].firstIndex(of: 0xF7) { sysexBuf[port] += bytes[i...end]; let m = sysexBuf[port]; sysexBuf[port] = []; i = end + 1; deliver(port, e, m) }
                    else { sysexBuf[port] += bytes[i...]; i = bytes.count }
                    continue
                }
                if s == 0xF8 { clockCount += 1; i += 1; continue }
                if s == 0xFA || s == 0xFB || s == 0xFC { sendMax(oscString("/transport", s == 0xFA ? "start" : s == 0xFB ? "continue" : "stop")); i += 1; continue }
                if s == 0xFE { i += 1; continue }
                if s == 0xF0 {
                    if let end = bytes[i...].firstIndex(of: 0xF7) { deliver(port, e, Array(bytes[i...end])); i = end + 1 }
                    else { sysexBuf[port] = Array(bytes[i...]); i = bytes.count }
                    continue
                }
                if s < 0x80 { i += 1; continue }                      // stray data byte
                let n = (s & 0xF0) == 0xC0 || (s & 0xF0) == 0xD0 ? 2 : 3
                deliver(port, e, Array(bytes[i..<min(i + n, bytes.count)])); i += n
            }
            pkt = UnsafePointer(MIDIPacketNext(pkt))
        }
    }
    for ep in [src, dst] {
        MIDIObjectSetStringProperty(ep, kMIDIPropertyManufacturer, "Ableton" as CFString)
        MIDIObjectSetStringProperty(ep, kMIDIPropertyModel, "Ableton Push 3" as CFString)
    }
    sources.append(src); write("created \(name)")
}
var sysexBuf: [[UInt8]] = [[], [], []]
func deliver(_ port: Int, _ e: String, _ m: [UInt8]) {
    // Universal Device Inquiry: answer as the Push 3 did (identity recorded from the hardware, firmware 1.0 build 91),
    // with a dummy serial number 1 (four 7-bit bytes, least significant first) in place of the unit's own
    if m == [0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7] {
        midiOut(port, [0xF0, 0x7E, 0x01, 0x06, 0x02, 0x00, 0x21, 0x1D, 0x69, 0x32, 0x03, 0x00, 0x01, 0x00, 0x5B, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x03, 0x01, 0x14, 0x04, 0xF7])
        write("\(Date().timeIntervalSince1970) inquiry on \(e), identity sent"); return }
    // Push 3 sysex 42: a firmware-versions query Live repeats until answered; reply as the hardware does (recorded 2026-10-30)
    if m.count == 9 && Array(m[0..<7]) == [0xF0, 0x00, 0x21, 0x1D, 0x01, 0x01, 0x42] {
        let tail: [UInt8] = m[7] == 0 ? [0x04, 0x01, 0x01, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x0D, 0x00, 0x01, 0x01, 0x00, 0x09, 0x00]
                                      : [0x04, 0x01, 0x01, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
        midiOut(port, [0xF0, 0x00, 0x21, 0x1D, 0x01, 0x01, 0x42, m[7]] + tail + [0xF7]); write("\(Date().timeIntervalSince1970) sysex 42 \(m[7]) answered"); return }
    // Push 3 sysex 3A (a two-byte status) and 38 (read settings for a list of ids): Live repeats them until answered;
    // replies shaped like the hardware's (recorded 2026-10-30: 3A -> 21 55; 38 id ids.. -> id 00 00 then id 00 00 per id, zero-padded to 15)
    if ProcessInfo.processInfo.environment["PUSHBRIDGE_NO_3A38"] == nil && m.count >= 8 && Array(m[0..<6]) == [0xF0, 0x00, 0x21, 0x1D, 0x01, 0x01] && (m[6] == 0x3A || m[6] == 0x38) {
        if m[6] == 0x3A { midiOut(port, [0xF0, 0x00, 0x21, 0x1D, 0x01, 0x01, 0x3A, 0x21, 0x55, 0xF7]) }
        else { var r: [UInt8] = [m[7], 0, 0]; for id in m[8..<(m.count - 1)] where id != 0 { r += [id, 0, 0] }; while r.count < 15 { r.append(0) }
               midiOut(port, [0xF0, 0x00, 0x21, 0x1D, 0x01, 0x01, 0x38] + r + [0xF7]) }
        write("\(Date().timeIntervalSince1970) sysex \(String(m[6], radix: 16)) answered"); return }
    sendMax(oscInts("/in", [Int32(port)] + m.map { Int32($0) }))
    write("\(Date().timeIntervalSince1970) IN \(e): " + hex(m))
    // remember the last state of every light, so a face that (re)loads can ask for it with /resend
    if m.count == 3 { let st = m[0] & 0xF0; if st == 0x90 || st == 0x80 || st == 0xB0 { ledState["\(port):\(st == 0xB0 ? "cc" : "note")\(m[1])"] = (port, m) } }
    // and the light-related sysex: 3B (one LED in any RGB, same key as that LED's note/cc so the latest wins),
    // 03 (palette entry), 06 (LED brightness), 08 (display brightness), 19 (touch strip LEDs)
    if m.count >= 9 && Array(m[0..<6]) == [0xF0, 0x00, 0x21, 0x1D, 0x01, 0x01] {
        switch m[6] {
        case 0x3B where m.count >= 16: ledState["\(port):\(m[7] & 0x10 != 0 ? "cc" : "note")\(m[8])"] = (port, m)
        case 0x03: ledState["\(port):sx03:\(m[7])"] = (port, m)
        case 0x06, 0x08, 0x19: ledState["\(port):sx\(m[6])"] = (port, m)
        default: break
        }
    }
}
var ledState: [String: (Int, [UInt8])] = [:]
func midiOut(_ port: Int, _ bytes: [UInt8]) {
    guard port < sources.count, !bytes.isEmpty else { return }
    var list = MIDIPacketList(); let pk = MIDIPacketListInit(&list)
    MIDIPacketListAdd(&list, MemoryLayout<MIDIPacketList>.size, pk, 0, bytes.count, bytes)
    MIDIReceived(sources[port], &list)
}

// Max -> MIDI
Thread {
    var buf = [UInt8](repeating: 0, count: 65536)
    while true {
        let n = recv(fromMax, &buf, buf.count, 0); if n <= 0 { continue }
        guard let (addr, args) = oscParse(Array(buf[0..<n])) else { continue }
        let bytes = args.map { UInt8(truncatingIfNeeded: $0) }
        if addr == "/midi" { midiOut(0, bytes); write("\(Date().timeIntervalSince1970) OUT Live Port: " + hex(bytes)) }
        else if addr == "/midi2" { midiOut(1, bytes); write("\(Date().timeIntervalSince1970) OUT User Port: " + hex(bytes)) }
        else if addr == "/resend" { for (_, v) in ledState { sendMax(oscInts("/in", [Int32(v.0)] + v.1.map { Int32($0) })) }; write("\(Date().timeIntervalSince1970) resent \(ledState.count) light states") }
    }
}.start()

// Active Sensing like the hardware, and the tempo from the clock count
Timer.scheduledTimer(withTimeInterval: 0.27, repeats: true) { _ in midiOut(0, [0xFE]); midiOut(1, [0xFE]) }
Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
    let now = Date().timeIntervalSince1970, dt = now - clockT0
    if clockCount > 0 && dt > 0 { sendMax(oscFloat("/bpm", Float(Double(clockCount) / dt * 60 / 24))) }
    clockCount = 0; clockT0 = now
}
signal(SIGTERM) { _ in exit(0) }; signal(SIGINT) { _ in exit(0) }
write("pushbridge up: MIDI ports created, OSC in 7475, out 7476")
RunLoop.main.run()
