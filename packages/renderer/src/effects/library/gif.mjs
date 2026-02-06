// GIF effect - renders animated GIF frames
// Uses gifPath to load GIF files from config/gifs directory

export const id = 'gif';
export const displayName = 'GIF';

export const defaultParams = {
  gifPath: '',
  speed: 1.0,
  scaleWidth: 100,
  scaleHeight: 100,
};

export const paramSchema = {
  gifPath: { type: 'filePath', label: 'GIF File' },
  speed: { type: 'number', label: 'Speed', min: 0.1, max: 5, step: 0.1, default: 1.0 },
  scaleWidth: { type: 'number', label: 'Tile Width %', min: 1, max: 100, step: 1, default: 100 },
  scaleHeight: { type: 'number', label: 'Tile Height %', min: 1, max: 100, step: 1, default: 100 },
};

// Frame cache: gifPath -> { frames: [{data, delay}], width, height }
const gifCache = new Map();

// Tracks in-flight browser fetches to avoid duplicate requests
const pendingLoads = new Set();

// Get cached GIF data
export function getCachedGif(gifPath) {
  return gifCache.get(gifPath);
}

// Store parsed GIF frames in cache
export function loadGifIntoCache(gifPath, gifData) {
  gifCache.set(gifPath, gifData);
}

// Clear cache entry
export function clearGifCache(gifPath) {
  if (gifPath) {
    gifCache.delete(gifPath);
  } else {
    gifCache.clear();
  }
}

// Parse GIF buffer into frames
// Returns { frames: [{data: Uint8Array, delay: number}], width, height }
export function parseGif(buffer) {
  const bytes = new Uint8Array(buffer);

  // Verify GIF header
  const header = String.fromCharCode(...bytes.slice(0, 6));
  if (header !== 'GIF87a' && header !== 'GIF89a') {
    throw new Error('Invalid GIF header');
  }

  // Read logical screen descriptor
  const width = bytes[6] | (bytes[7] << 8);
  const height = bytes[8] | (bytes[9] << 8);
  const packedByte = bytes[10];
  const hasGlobalColorTable = (packedByte & 0x80) !== 0;
  const globalColorTableSize = 1 << ((packedByte & 0x07) + 1);

  let offset = 13; // After header (6) + logical screen descriptor (7)

  // Skip global color table if present
  let globalColorTable = null;
  if (hasGlobalColorTable) {
    globalColorTable = bytes.slice(offset, offset + globalColorTableSize * 3);
    offset += globalColorTableSize * 3;
  }

  const frames = [];
  let graphicControlExtension = null;

  // Canvas to accumulate frames (for disposal methods)
  const canvas = new Uint8Array(width * height * 4);

  while (offset < bytes.length) {
    const blockType = bytes[offset++];

    if (blockType === 0x21) {
      // Extension block
      const extensionType = bytes[offset++];

      if (extensionType === 0xF9) {
        // Graphic Control Extension
        const blockSize = bytes[offset++];
        const packed = bytes[offset];
        const disposalMethod = (packed >> 2) & 0x07;
        const transparentColorFlag = (packed & 0x01) !== 0;
        const delayTime = (bytes[offset + 1] | (bytes[offset + 2] << 8)) * 10; // Convert to ms
        const transparentColorIndex = bytes[offset + 3];
        offset += blockSize;
        offset++; // Block terminator

        graphicControlExtension = {
          disposalMethod,
          transparentColorFlag,
          delayTime: delayTime || 100, // Default 100ms if 0
          transparentColorIndex,
        };
      } else {
        // Skip other extensions
        while (bytes[offset] !== 0) {
          offset += bytes[offset] + 1;
        }
        offset++; // Block terminator
      }
    } else if (blockType === 0x2C) {
      // Image descriptor
      const imageLeft = bytes[offset] | (bytes[offset + 1] << 8);
      const imageTop = bytes[offset + 2] | (bytes[offset + 3] << 8);
      const imageWidth = bytes[offset + 4] | (bytes[offset + 5] << 8);
      const imageHeight = bytes[offset + 6] | (bytes[offset + 7] << 8);
      const imagePacked = bytes[offset + 8];
      offset += 9;

      const hasLocalColorTable = (imagePacked & 0x80) !== 0;
      const interlaced = (imagePacked & 0x40) !== 0;
      const localColorTableSize = 1 << ((imagePacked & 0x07) + 1);

      let colorTable = globalColorTable;
      if (hasLocalColorTable) {
        colorTable = bytes.slice(offset, offset + localColorTableSize * 3);
        offset += localColorTableSize * 3;
      }

      // LZW decode
      const minCodeSize = bytes[offset++];
      const compressedData = [];

      while (bytes[offset] !== 0) {
        const subBlockSize = bytes[offset++];
        for (let i = 0; i < subBlockSize; i++) {
          compressedData.push(bytes[offset++]);
        }
      }
      offset++; // Block terminator

      // Decode LZW data
      const indexStream = decodeLZW(compressedData, minCodeSize);

      // Handle disposal before rendering new frame
      const disposalMethod = graphicControlExtension?.disposalMethod || 0;
      const transparentIndex = graphicControlExtension?.transparentColorFlag
        ? graphicControlExtension.transparentColorIndex
        : -1;

      // Render pixels to canvas
      const deinterlacedStream = interlaced
        ? deinterlace(indexStream, imageWidth, imageHeight)
        : indexStream;

      for (let pixelIndex = 0; pixelIndex < deinterlacedStream.length; pixelIndex++) {
        const colorIndex = deinterlacedStream[pixelIndex];
        const pixelX = imageLeft + (pixelIndex % imageWidth);
        const pixelY = imageTop + Math.floor(pixelIndex / imageWidth);

        if (pixelX >= width || pixelY >= height) continue;

        const canvasOffset = (pixelY * width + pixelX) * 4;

        if (colorIndex !== transparentIndex) {
          const colorTableOffset = colorIndex * 3;
          canvas[canvasOffset] = colorTable[colorTableOffset];
          canvas[canvasOffset + 1] = colorTable[colorTableOffset + 1];
          canvas[canvasOffset + 2] = colorTable[colorTableOffset + 2];
          canvas[canvasOffset + 3] = 255;
        }
      }

      // Store frame
      frames.push({
        data: new Uint8Array(canvas),
        delay: graphicControlExtension?.delayTime || 100,
      });

      // Handle disposal for next frame
      if (disposalMethod === 2) {
        // Restore to background
        for (let i = 0; i < canvas.length; i += 4) {
          canvas[i] = 0;
          canvas[i + 1] = 0;
          canvas[i + 2] = 0;
          canvas[i + 3] = 0;
        }
      }
      // disposalMethod 1 = leave in place (do nothing)
      // disposalMethod 3 = restore to previous (not fully implemented)

      graphicControlExtension = null;
    } else if (blockType === 0x3B) {
      // Trailer - end of GIF
      break;
    } else {
      // Unknown block, try to skip
      break;
    }
  }

  return { frames, width, height };
}

// LZW decoder
function decodeLZW(data, minCodeSize) {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;

  let codeSize = minCodeSize + 1;
  let nextCode = endCode + 1;
  let maxCode = 1 << codeSize;

  // Initialize code table with single-character codes
  const codeTable = [];
  for (let i = 0; i < clearCode; i++) {
    codeTable[i] = [i];
  }

  const output = [];
  let bitBuffer = 0;
  let bitsInBuffer = 0;
  let dataIndex = 0;
  let prevCode = -1;

  function readCode() {
    while (bitsInBuffer < codeSize && dataIndex < data.length) {
      bitBuffer |= data[dataIndex++] << bitsInBuffer;
      bitsInBuffer += 8;
    }
    const code = bitBuffer & ((1 << codeSize) - 1);
    bitBuffer >>= codeSize;
    bitsInBuffer -= codeSize;
    return code;
  }

  while (dataIndex < data.length || bitsInBuffer >= codeSize) {
    const code = readCode();

    if (code === clearCode) {
      codeSize = minCodeSize + 1;
      nextCode = endCode + 1;
      maxCode = 1 << codeSize;
      codeTable.length = clearCode;
      for (let i = 0; i < clearCode; i++) {
        codeTable[i] = [i];
      }
      prevCode = -1;
      continue;
    }

    if (code === endCode) {
      break;
    }

    let sequence;
    if (code < nextCode) {
      sequence = codeTable[code];
    } else if (code === nextCode && prevCode !== -1) {
      sequence = [...codeTable[prevCode], codeTable[prevCode][0]];
    } else {
      break; // Invalid code
    }

    output.push(...sequence);

    if (prevCode !== -1 && nextCode < 4096) {
      codeTable[nextCode++] = [...codeTable[prevCode], sequence[0]];
      if (nextCode >= maxCode && codeSize < 12) {
        codeSize++;
        maxCode = 1 << codeSize;
      }
    }

    prevCode = code;
  }

  return output;
}

// Deinterlace GIF frame
function deinterlace(indexStream, width, height) {
  const output = new Array(indexStream.length);
  const passes = [
    { start: 0, step: 8 },
    { start: 4, step: 8 },
    { start: 2, step: 4 },
    { start: 1, step: 2 },
  ];

  let inputRow = 0;
  for (const pass of passes) {
    for (let outputY = pass.start; outputY < height; outputY += pass.step) {
      for (let x = 0; x < width; x++) {
        output[outputY * width + x] = indexStream[inputRow * width + x];
      }
      inputRow++;
    }
  }

  return output;
}

// Render function called by the engine
export function render(sceneF32, W, H, t, params) {
  const { gifPath = '', speed = 1.0, scaleWidth = 100, scaleHeight = 100 } = params;

  if (!gifPath) {
    // No GIF selected - fill with dark gray
    for (let i = 0; i < sceneF32.length; i += 3) {
      sceneF32[i] = 0.1;
      sceneF32[i + 1] = 0.1;
      sceneF32[i + 2] = 0.1;
    }
    return;
  }

  const gifData = getCachedGif(gifPath);
  if (!gifData || !gifData.frames || gifData.frames.length === 0) {
    // Browser: trigger async fetch so next frames render the GIF
    if (!pendingLoads.has(gifPath) && typeof globalThis.fetch === 'function') {
      pendingLoads.add(gifPath);
      fetch(`/gif/${encodeURIComponent(gifPath)}`)
        .then(response => response.arrayBuffer())
        .then(buffer => { loadGifIntoCache(gifPath, parseGif(buffer)); })
        .catch(() => {})
        .finally(() => pendingLoads.delete(gifPath));
    }
    // GIF not loaded yet - fill with purple to indicate loading
    for (let i = 0; i < sceneF32.length; i += 3) {
      sceneF32[i] = 0.3;
      sceneF32[i + 1] = 0.0;
      sceneF32[i + 2] = 0.3;
    }
    return;
  }

  // Calculate which frame to show based on time and speed
  const { frames, width: gifWidth, height: gifHeight } = gifData;

  // Calculate total animation duration
  let totalDuration = 0;
  for (const frame of frames) {
    totalDuration += frame.delay;
  }

  // Get current time in animation (accounting for speed)
  const animTime = (t * 1000 * speed) % totalDuration;

  // Find current frame
  let elapsed = 0;
  let currentFrame = frames[0];
  for (const frame of frames) {
    elapsed += frame.delay;
    if (elapsed > animTime) {
      currentFrame = frame;
      break;
    }
  }

  // Tile dimensions: each tile occupies scaleWidth%/scaleHeight% of the view
  const tileWidth = Math.max(1, Math.round(W * scaleWidth / 100));
  const tileHeight = Math.max(1, Math.round(H * scaleHeight / 100));

  for (let y = 0; y < H; y++) {
    const tileY = y % tileHeight;
    const gifY = Math.floor(tileY * gifHeight / tileHeight);

    for (let x = 0; x < W; x++) {
      const tileX = x % tileWidth;
      const gifX = Math.floor(tileX * gifWidth / tileWidth);
      const gifOffset = (gifY * gifWidth + gifX) * 4;

      const sceneOffset = (y * W + x) * 3;

      // Convert from 0-255 to 0.0-1.0
      sceneF32[sceneOffset] = currentFrame.data[gifOffset] / 255;
      sceneF32[sceneOffset + 1] = currentFrame.data[gifOffset + 1] / 255;
      sceneF32[sceneOffset + 2] = currentFrame.data[gifOffset + 2] / 255;
    }
  }
}
