// Renders the app icon (1024px) and the menu bar template icon.
// Usage: swift scripts/make-icons.swift <app-icon.png> <tray.png>
import AppKit

func png(_ size: CGFloat, _ draw: (CGRect) -> Void) -> Data {
    let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size), bitsPerSample: 8,
        samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
        bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    draw(CGRect(x: 0, y: 0, width: size, height: size))
    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])!
}

func symbol(_ name: String, points: CGFloat, color: NSColor) -> NSImage {
    let config = NSImage.SymbolConfiguration(pointSize: points, weight: .semibold)
        .applying(.init(paletteColors: [color]))
    return NSImage(systemSymbolName: name, accessibilityDescription: nil)!.withSymbolConfiguration(config)!
}

func centered(_ image: NSImage, in rect: CGRect) {
    let size = image.size
    image.draw(in: CGRect(x: rect.midX - size.width / 2, y: rect.midY - size.height / 2,
                          width: size.width, height: size.height))
}

let arguments = CommandLine.arguments
guard arguments.count == 3 else { fatalError("usage: make-icons <app-icon.png> <tray.png>") }

let appIcon = png(1024) { rect in
    let body = rect.insetBy(dx: 100, dy: 100)
    let shape = NSBezierPath(roundedRect: body, xRadius: 185, yRadius: 185)
    NSGradient(colors: [
        NSColor(srgbRed: 0.98, green: 0.62, blue: 0.20, alpha: 1),
        NSColor(srgbRed: 0.90, green: 0.27, blue: 0.33, alpha: 1),
    ])!.draw(in: shape, angle: -90)
    centered(symbol("list.clipboard.fill", points: 420, color: .white), in: body)
}
try appIcon.write(to: URL(fileURLWithPath: arguments[1]))

let tray = png(44) { rect in
    centered(symbol("list.clipboard", points: 30, color: .black), in: rect)
}
try tray.write(to: URL(fileURLWithPath: arguments[2]))
