# Shakalizator

Shakalizator is an in-browser tool for batch compressing, converting, and inspecting images. It loads WebAssembly and JavaScript codecs on demand via CDN and runs all processing locally inside background Web Workers, keeping image data strictly in your machine's memory. An interactive canvas provides real-time comparison via original blink and amplified pixel difference modes to inspect quality before exporting.

## Supported Codecs

| Format | Engine | Method | Median Reduction | Best For |
| :--- | :--- | :--- | :--- | :--- |
| **JPEG** | MozJPEG (Wasm) | Lossy (DCT + trellis quantization) | ~60–80% | Photos, complex scenes |
| **WebP** | libwebp (Wasm) | Lossy & Lossless (predictive coding) | ~65–85% (lossy) / ~20–30% (lossless) | General web delivery |
| **PNG (Lossless)** | Oxipng / OptiPNG | Lossless (deflate optimization, chunk stripping) | ~10–25% | Diagrams, icons, zero quality loss |
| **PNG (Indexed)** | UPNG / WuQuant | Lossy (Wu color quantization, 2–256 palette) | ~50–70% | Illustrations, UI screenshots, logos |

## Shortcuts & Controls

| Key | Action |
| :--- | :--- |
| `Space` (hold) | **Blink:** preview original uncompressed image |
| `D` | **Diff:** highlight amplified pixel difference |
| `F` | **Scale:** toggle 100% pixel scale and viewport fit |
| `Left` / `Right` | Adjust active quality or color slider |
| `Delete` / `Backspace` | Remove selected image from queue |
| `Ctrl+A` | Select all images in queue |

## License

[MIT](./LICENSE)
