export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** Build an interoperable ZIP archive with STORE entries (no compression dependency). */
export class ZipArchive {
  private readonly encoder = new TextEncoder();

  create(entries: ZipEntry[]): Uint8Array {
    const localParts: Uint8Array[] = [];
    const centralParts: Uint8Array[] = [];
    let offset = 0;

    for (const entry of entries) {
      const name = this.encoder.encode(entry.name);
      const crc = this._crc32(entry.data);
      const local = this._localHeader(name, entry.data.length, crc);
      const central = this._centralHeader(name, entry.data.length, crc, offset);
      localParts.push(local, name, entry.data);
      centralParts.push(central, name);
      offset += local.length + name.length + entry.data.length;
    }

    const centralLength = centralParts.reduce((size, part) => size + part.length, 0);
    const end = new Uint8Array(22);
    const view = new DataView(end.buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(8, entries.length, true);
    view.setUint16(10, entries.length, true);
    view.setUint32(12, centralLength, true);
    view.setUint32(16, offset, true);

    return this._join([...localParts, ...centralParts, end]);
  }

  private _localHeader(name: Uint8Array, length: number, crc: number): Uint8Array {
    const header = new Uint8Array(30);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x0800, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, length, true);
    view.setUint32(22, length, true);
    view.setUint16(26, name.length, true);
    return header;
  }

  private _centralHeader(name: Uint8Array, length: number, crc: number, offset: number): Uint8Array {
    const header = new Uint8Array(46);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0x0800, true);
    view.setUint32(16, crc, true);
    view.setUint32(20, length, true);
    view.setUint32(24, length, true);
    view.setUint16(28, name.length, true);
    view.setUint32(42, offset, true);
    return header;
  }

  private _crc32(bytes: Uint8Array): number {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) {
        const mask = -(crc & 1);
        crc = (crc >>> 1) ^ (0xedb88320 & mask);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  private _join(parts: Uint8Array[]): Uint8Array {
    const size = parts.reduce((sum, part) => sum + part.length, 0);
    const result = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.length;
    }
    return result;
  }
}
