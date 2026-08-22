/**
 * 스트리밍 ZIP 작성기 — 저장(store) 방식, 의존성 없음.
 *
 * 왜 압축하지 않는가: 담는 것이 전부 PDF·HWP라 이미 압축돼 있다. deflate를 걸어도
 * 몇 %도 줄지 않으면서 1GB를 통째로 CPU에 태우게 된다. store 로 두면 파일을 읽어
 * 그대로 흘려보내면 되므로 메모리도 상수로 유지된다.
 *
 * 왜 data descriptor 를 쓰는가: 로컬 헤더에는 CRC와 크기가 먼저 와야 하는데,
 * 스트리밍하려면 파일을 다 읽기 전에 헤더를 내보내야 한다. 범용 플래그 3번 비트를 켜면
 * CRC·크기를 파일 데이터 **뒤**에 붙일 수 있다. 11번 비트는 파일명이 UTF-8임을 알린다
 * (한글 파일명이 깨지지 않게).
 */
import fs from "node:fs";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array, seed = 0): number {
  let c = ~seed >>> 0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

/** DOS 형식 시각 — 초는 2초 단위로 저장된다 */
function dosTime(d: Date) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

function u16(v: number) { const b = Buffer.alloc(2); b.writeUInt16LE(v >>> 0, 0); return b; }
function u32(v: number) { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0, 0); return b; }

export interface ZipEntry {
  /** ZIP 안에서 보일 경로 */
  name: string;
  /** 읽어올 실제 파일의 절대경로 */
  path: string;
}

const FLAGS = 0x0808; // bit3: data descriptor, bit11: UTF-8 파일명

/**
 * 항목들을 ZIP 스트림으로 만든다. 파일은 한 번에 하나씩만 메모리에 올린다.
 * 읽지 못하는 파일은 건너뛴다 — 한 건 때문에 전체 내려받기가 깨지면 안 된다.
 */
export function createZipStream(entries: ZipEntry[]): ReadableStream<Uint8Array> {
  const central: Buffer[] = [];
  let offset = 0;
  let count = 0;
  let i = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      // 모든 파일을 다 흘려보냈으면 중앙 디렉터리와 EOCD를 붙이고 끝낸다
      if (i >= entries.length) {
        const cd = Buffer.concat(central);
        controller.enqueue(cd);
        controller.enqueue(
          Buffer.concat([
            u32(0x06054b50), u16(0), u16(0),
            u16(count), u16(count),
            u32(cd.length), u32(offset),
            u16(0),
          ]),
        );
        controller.close();
        return;
      }

      const e = entries[i++];
      let stat: fs.Stats;
      try {
        stat = fs.statSync(e.path);
        if (!stat.isFile()) return;
      } catch {
        return; // 없는 파일은 조용히 건너뛴다
      }

      const name = Buffer.from(e.name, "utf8");
      const { time, date } = dosTime(stat.mtime);
      const localOffset = offset;

      const local = Buffer.concat([
        u32(0x04034b50), u16(20), u16(FLAGS), u16(0),
        u16(time), u16(date),
        u32(0), u32(0), u32(0),          // CRC·크기는 뒤(data descriptor)에서
        u16(name.length), u16(0),
        name,
      ]);
      controller.enqueue(local);
      offset += local.length;

      // 파일 본문을 조각으로 읽어 흘려보내며 CRC를 누적한다
      let crc = 0;
      let size = 0;
      const fd = fs.openSync(e.path, "r");
      try {
        const buf = Buffer.allocUnsafe(1 << 18); // 256KB
        for (;;) {
          const read = fs.readSync(fd, buf, 0, buf.length, null);
          if (read <= 0) break;
          const chunk = buf.subarray(0, read);
          crc = crc32(chunk, crc);
          size += read;
          controller.enqueue(Buffer.from(chunk)); // 재사용 버퍼라 복사해서 넘긴다
        }
      } finally {
        fs.closeSync(fd);
      }
      offset += size;

      const desc = Buffer.concat([u32(0x08074b50), u32(crc), u32(size), u32(size)]);
      controller.enqueue(desc);
      offset += desc.length;

      central.push(
        Buffer.concat([
          u32(0x02014b50), u16(20), u16(20), u16(FLAGS), u16(0),
          u16(time), u16(date),
          u32(crc), u32(size), u32(size),
          u16(name.length), u16(0), u16(0),
          u16(0), u16(0), u32(0),
          u32(localOffset),
          name,
        ]),
      );
      count++;
    },
  });
}
