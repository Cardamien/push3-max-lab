import CoreMIDI
import Foundation
var client = MIDIClientRef(); MIDIClientCreateWithBlock("props" as CFString, &client) { _ in }
for i in 0..<MIDIGetNumberOfSources() { let e = MIDIGetSource(i); var cf: Unmanaged<CFString>?
  MIDIObjectGetStringProperty(e, kMIDIPropertyDisplayName, &cf); let dn = cf?.takeRetainedValue() as String? ?? ""
  if !dn.contains("Push") { continue }
  func s(_ k: CFString) -> String { var c: Unmanaged<CFString>?; MIDIObjectGetStringProperty(e, k, &c); return c?.takeRetainedValue() as String? ?? "-" }
  var ent = MIDIEntityRef(); MIDIEndpointGetEntity(e, &ent); var dev = MIDIDeviceRef(); if ent != 0 { MIDIEntityGetDevice(ent, &dev) }
  func ds(_ o: MIDIObjectRef, _ k: CFString) -> String { var c: Unmanaged<CFString>?; MIDIObjectGetStringProperty(o, k, &c); return c?.takeRetainedValue() as String? ?? "-" }
  print("[\(i)] display='\(dn)' name='\(s(kMIDIPropertyName))' model='\(s(kMIDIPropertyModel))' manuf='\(s(kMIDIPropertyManufacturer))' driver='\(s(kMIDIPropertyDriverOwner))' entity='\(ent != 0 ? ds(ent, kMIDIPropertyName) : "-")' device='\(dev != 0 ? ds(dev, kMIDIPropertyName) : "-")' devmodel='\(dev != 0 ? ds(dev, kMIDIPropertyModel) : "-")'")
}
