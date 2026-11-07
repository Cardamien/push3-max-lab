// winrec: record one window (by CGWindowID) to a .mov with ScreenCaptureKit, even when other windows cover it.
// Only that window is captured, never the rest of the screen.
// Build: swiftc -O -parse-as-library winrec.swift -o winrec
// Usage: winrec <windowID> <seconds> <out.mov> [fps=30]
import AppKit
import AVFoundation
import CoreMedia
import ScreenCaptureKit

final class Recorder: NSObject, SCStreamOutput {
    let writer: AVAssetWriter, input: AVAssetWriterInput
    var started = false, frames = 0
    init(url: URL, width: Int, height: Int) throws {
        try? FileManager.default.removeItem(at: url)
        writer = try AVAssetWriter(outputURL: url, fileType: .mov)
        input = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: width, AVVideoHeightKey: height,
            AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 20_000_000]])
        input.expectsMediaDataInRealTime = true
        writer.add(input)
        super.init()
    }
    func stream(_ stream: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, sb.isValid,
              let att = (CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]])?.first,
              let raw = att[.status] as? Int, SCFrameStatus(rawValue: raw) == .complete else { return }
        if !started { writer.startWriting(); writer.startSession(atSourceTime: sb.presentationTimeStamp); started = true }
        if input.isReadyForMoreMediaData { input.append(sb); frames += 1 }
    }
}

@main struct WinRec {
    static func main() async throws {
        _ = NSApplication.shared                      // connects to the window server (ScreenCaptureKit needs it)
        let a = CommandLine.arguments
        guard a.count >= 4, let id = UInt32(a[1]), let secs = Double(a[2]) else {
            print("usage: winrec <windowID> <seconds> <out.mov> [fps]"); exit(2)
        }
        let fps = a.count > 4 ? Int32(a[4]) ?? 30 : 30
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
        guard let win = content.windows.first(where: { $0.windowID == id }) else { print("window \(id) not found"); exit(1) }
        let filter = SCContentFilter(desktopIndependentWindow: win)
        let cfg = SCStreamConfiguration()
        let scale = 2.0
        cfg.width = Int(win.frame.width * scale) & ~1; cfg.height = Int(win.frame.height * scale) & ~1
        cfg.minimumFrameInterval = CMTime(value: 1, timescale: fps)
        cfg.pixelFormat = kCVPixelFormatType_32BGRA
        cfg.showsCursor = false
        let rec = try Recorder(url: URL(fileURLWithPath: a[3]), width: cfg.width, height: cfg.height)
        let stream = SCStream(filter: filter, configuration: cfg, delegate: nil)
        try stream.addStreamOutput(rec, type: .screen, sampleHandlerQueue: DispatchQueue(label: "winrec"))
        try await stream.startCapture()
        try await Task.sleep(nanoseconds: UInt64(secs * 1e9))
        try await stream.stopCapture()
        rec.input.markAsFinished()
        await rec.writer.finishWriting()
        print("wrote \(rec.frames) frames, \(cfg.width)x\(cfg.height), \(a[3])")
    }
}
