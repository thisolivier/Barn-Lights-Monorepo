# Assembler

Listens for `FrameIngest` events and builds per-run RGB buffers for each configured side.
Base64 `rgb_b64` section data are decoded into `Uint8Array` run buffers.
Successful assemblies emit `FrameAssembled` events for downstream consumers.
