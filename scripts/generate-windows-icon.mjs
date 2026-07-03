#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = path.join(root, 'build', 'icon.ico')
const sizes = [16, 24, 32, 48, 64, 128, 256]
const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index

  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }

  return value >>> 0
})

await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, createIco(sizes))
console.log(`Generated ${path.relative(root, outputPath)}`)

function createIco(iconSizes) {
  const images = iconSizes.map((size) => ({
    size,
    png: encodePng(size, size, renderIcon(size))
  }))
  const headerSize = 6 + images.length * 16
  const totalSize = headerSize + images.reduce((sum, image) => sum + image.png.length, 0)
  const ico = Buffer.alloc(totalSize)

  ico.writeUInt16LE(0, 0)
  ico.writeUInt16LE(1, 2)
  ico.writeUInt16LE(images.length, 4)

  let offset = headerSize

  images.forEach((image, index) => {
    const entryOffset = 6 + index * 16
    ico[entryOffset] = image.size === 256 ? 0 : image.size
    ico[entryOffset + 1] = image.size === 256 ? 0 : image.size
    ico[entryOffset + 2] = 0
    ico[entryOffset + 3] = 0
    ico.writeUInt16LE(1, entryOffset + 4)
    ico.writeUInt16LE(32, entryOffset + 6)
    ico.writeUInt32LE(image.png.length, entryOffset + 8)
    ico.writeUInt32LE(offset, entryOffset + 12)
    image.png.copy(ico, offset)
    offset += image.png.length
  })

  return ico
}

function renderIcon(size) {
  const samples = size <= 64 ? 4 : size <= 128 ? 3 : 2
  const canvas = createCanvas(size * samples, size * samples)
  const scale = canvas.width / 1024

  fillRoundedRect(
    canvas,
    42 * scale,
    42 * scale,
    940 * scale,
    940 * scale,
    212 * scale,
    (x, y) => mix(hex('#0f172a'), hex('#1e293b'), clamp01((x + y) / 2048))
  )
  fillRoundedRect(canvas, 126 * scale, 278 * scale, 772 * scale, 548 * scale, 58 * scale, [
    3,
    7,
    18,
    90
  ])
  fillRoundedRect(
    canvas,
    140 * scale,
    280 * scale,
    744 * scale,
    520 * scale,
    56 * scale,
    (x, y) => mix(hex('#1e293b'), hex('#0f172a'), clamp01((x + y - 420) / 1000))
  )
  fillRoundedRect(canvas, 140 * scale, 280 * scale, 744 * scale, 82 * scale, 56 * scale, [
    30,
    41,
    59,
    255
  ])
  fillRect(canvas, 140 * scale, 322 * scale, 744 * scale, 42 * scale, [30, 41, 59, 255])

  fillCircle(canvas, 200 * scale, 320 * scale, 14 * scale, hex('#ef4444'))
  fillCircle(canvas, 250 * scale, 320 * scale, 14 * scale, hex('#f59e0b'))
  fillCircle(canvas, 300 * scale, 320 * scale, 14 * scale, hex('#22c55e'))

  strokeLine(canvas, 220 * scale, 460 * scale, 310 * scale, 530 * scale, 34 * scale, hex('#3b82f6'))
  strokeLine(canvas, 310 * scale, 530 * scale, 220 * scale, 600 * scale, 34 * scale, hex('#06b6d4'))
  fillRoundedRect(canvas, 350 * scale, 505 * scale, 30 * scale, 52 * scale, 5 * scale, [
    59,
    130,
    246,
    220
  ])

  fillRoundedRect(canvas, 220 * scale, 650 * scale, 280 * scale, 18 * scale, 9 * scale, [
    51,
    65,
    85,
    135
  ])
  fillRoundedRect(canvas, 220 * scale, 690 * scale, 420 * scale, 18 * scale, 9 * scale, [
    51,
    65,
    85,
    110
  ])
  fillRoundedRect(canvas, 220 * scale, 730 * scale, 200 * scale, 18 * scale, 9 * scale, [
    51,
    65,
    85,
    90
  ])

  fillRoundedRect(canvas, 620 * scale, 470 * scale, 120 * scale, 220 * scale, 30 * scale, [
    15,
    23,
    42,
    185
  ])
  fillStatusLight(canvas, 680 * scale, 510 * scale, 26 * scale, hex('#22c55e'), hex('#34d399'))
  fillStatusLight(canvas, 680 * scale, 580 * scale, 26 * scale, hex('#f59e0b'), hex('#fbbf24'))
  fillStatusLight(canvas, 680 * scale, 650 * scale, 26 * scale, hex('#ef4444'), hex('#f87171'))

  return downsample(canvas, size, samples)
}

function fillStatusLight(canvas, cx, cy, radius, outer, inner) {
  fillCircle(canvas, cx, cy, radius, [...outer.slice(0, 3), 235])
  fillCircle(canvas, cx, cy, radius * 0.68, inner)
}

function createCanvas(width, height) {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4)
  }
}

function fillRect(canvas, x, y, width, height, color) {
  const x0 = Math.max(0, Math.floor(x))
  const y0 = Math.max(0, Math.floor(y))
  const x1 = Math.min(canvas.width, Math.ceil(x + width))
  const y1 = Math.min(canvas.height, Math.ceil(y + height))

  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      blend(canvas, px, py, resolveColor(color, px, py))
    }
  }
}

function fillRoundedRect(canvas, x, y, width, height, radius, color) {
  const x0 = Math.max(0, Math.floor(x))
  const y0 = Math.max(0, Math.floor(y))
  const x1 = Math.min(canvas.width, Math.ceil(x + width))
  const y1 = Math.min(canvas.height, Math.ceil(y + height))

  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      const nearestX = clamp(px + 0.5, x + radius, x + width - radius)
      const nearestY = clamp(py + 0.5, y + radius, y + height - radius)
      const dx = px + 0.5 - nearestX
      const dy = py + 0.5 - nearestY

      if (dx * dx + dy * dy <= radius * radius) {
        blend(canvas, px, py, resolveColor(color, px / (canvas.width / 1024), py / (canvas.height / 1024)))
      }
    }
  }
}

function fillCircle(canvas, cx, cy, radius, color) {
  const x0 = Math.max(0, Math.floor(cx - radius))
  const y0 = Math.max(0, Math.floor(cy - radius))
  const x1 = Math.min(canvas.width, Math.ceil(cx + radius))
  const y1 = Math.min(canvas.height, Math.ceil(cy + radius))
  const radiusSq = radius * radius

  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      const dx = px + 0.5 - cx
      const dy = py + 0.5 - cy

      if (dx * dx + dy * dy <= radiusSq) {
        blend(canvas, px, py, resolveColor(color, px, py))
      }
    }
  }
}

function strokeLine(canvas, x1, y1, x2, y2, width, color) {
  const radius = width / 2
  const minX = Math.max(0, Math.floor(Math.min(x1, x2) - radius))
  const minY = Math.max(0, Math.floor(Math.min(y1, y2) - radius))
  const maxX = Math.min(canvas.width, Math.ceil(Math.max(x1, x2) + radius))
  const maxY = Math.min(canvas.height, Math.ceil(Math.max(y1, y2) + radius))
  const vx = x2 - x1
  const vy = y2 - y1
  const lenSq = vx * vx + vy * vy

  for (let py = minY; py < maxY; py += 1) {
    for (let px = minX; px < maxX; px += 1) {
      const t = clamp(((px + 0.5 - x1) * vx + (py + 0.5 - y1) * vy) / lenSq, 0, 1)
      const nx = x1 + t * vx
      const ny = y1 + t * vy
      const dx = px + 0.5 - nx
      const dy = py + 0.5 - ny

      if (dx * dx + dy * dy <= radius * radius) {
        blend(canvas, px, py, resolveColor(color, px, py))
      }
    }
  }
}

function downsample(canvas, size, samples) {
  const output = Buffer.alloc(size * size * 4)

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0

      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const source = ((y * samples + sy) * canvas.width + x * samples + sx) * 4
          r += canvas.data[source]
          g += canvas.data[source + 1]
          b += canvas.data[source + 2]
          a += canvas.data[source + 3]
        }
      }

      const count = samples * samples
      const target = (y * size + x) * 4
      output[target] = Math.round(r / count)
      output[target + 1] = Math.round(g / count)
      output[target + 2] = Math.round(b / count)
      output[target + 3] = Math.round(a / count)
    }
  }

  return output
}

function blend(canvas, x, y, color) {
  const index = (y * canvas.width + x) * 4
  const sourceAlpha = (color[3] ?? 255) / 255
  const targetAlpha = canvas.data[index + 3] / 255
  const outputAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha)

  if (outputAlpha === 0) {
    return
  }

  canvas.data[index] = Math.round(
    (color[0] * sourceAlpha + canvas.data[index] * targetAlpha * (1 - sourceAlpha)) /
      outputAlpha
  )
  canvas.data[index + 1] = Math.round(
    (color[1] * sourceAlpha + canvas.data[index + 1] * targetAlpha * (1 - sourceAlpha)) /
      outputAlpha
  )
  canvas.data[index + 2] = Math.round(
    (color[2] * sourceAlpha + canvas.data[index + 2] * targetAlpha * (1 - sourceAlpha)) /
      outputAlpha
  )
  canvas.data[index + 3] = Math.round(outputAlpha * 255)
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc(height * (1 + width * 4))
  const ihdr = Buffer.alloc(13)

  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 4)
    raw[rowStart] = 0
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type)
  const chunk = Buffer.alloc(12 + data.length)
  chunk.writeUInt32BE(data.length, 0)
  typeBuffer.copy(chunk, 4)
  data.copy(chunk, 8)
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length)
  return chunk
}

function crc32(buffer) {
  let crc = 0xffffffff

  for (const byte of buffer) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff]
  }

  return (crc ^ 0xffffffff) >>> 0
}

function hex(value) {
  const clean = value.replace('#', '')
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
    255
  ]
}

function mix(left, right, amount) {
  return [
    Math.round(left[0] + (right[0] - left[0]) * amount),
    Math.round(left[1] + (right[1] - left[1]) * amount),
    Math.round(left[2] + (right[2] - left[2]) * amount),
    Math.round((left[3] ?? 255) + ((right[3] ?? 255) - (left[3] ?? 255)) * amount)
  ]
}

function resolveColor(color, x, y) {
  return typeof color === 'function' ? color(x, y) : color
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function clamp01(value) {
  return clamp(value, 0, 1)
}
