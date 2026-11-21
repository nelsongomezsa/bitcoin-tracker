// Genera iconos PNG sencillos (fondo oscuro + círculo naranja con una B) sin dependencias.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

function crc32(buf) {
  let c, crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(size) {
  const bg = [0x0b, 0x0e, 0x13], fg = [0xf7, 0x93, 0x1a], dark = [0x0b, 0x0e, 0x13]
  const raw = Buffer.alloc((size * 4 + 1) * size)
  const cx = size / 2, r = size * 0.36
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5, dy = y - cx + 0.5
      let col = bg
      if (Math.hypot(dx, dy) <= r) {
        col = fg
        // "B" esquemática: barra vertical y dos arcos
        const u = dx / r, v = dy / r
        const bar = u > -0.45 && u < -0.2 && v > -0.6 && v < 0.6
        const top = u >= -0.2 && u < 0.45 && ((v > -0.6 && v < -0.4) || (v > -0.1 && v < 0.1) || (v > 0.4 && v < 0.6))
        const right = u > 0.3 && u < 0.5 && ((v > -0.5 && v < -0.1) || (v > 0.1 && v < 0.5))
        if (bar || top || right) col = dark
      }
      const o = y * (size * 4 + 1) + 1 + x * 4
      raw[o] = col[0]; raw[o + 1] = col[1]; raw[o + 2] = col[2]; raw[o + 3] = 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
}
for (const [name, s] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(new URL(`../public/${name}`, import.meta.url), png(s))
}
