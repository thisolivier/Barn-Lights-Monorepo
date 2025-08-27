# Assembler

Listens for `FrameIngest` events and builds per-run RGB buffers for each configured side.
Base64 `rgb_b64` section data are decoded into `Uint8Array` run buffers.
Successful assemblies emit `FrameAssembled` events for downstream consumers and
optionally write frames into a [`Mailbox`](../mailbox) when one is supplied.

Each side configuration must include a `runs` array; initialization fails with an error if any side is missing this property.
