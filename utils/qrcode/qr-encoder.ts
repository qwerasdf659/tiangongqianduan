/**
 * QR 码编码器 — 纯算法模块，不依赖任何平台 API
 *
 * 从 weapp-qrcode.js v1.0.0 提取并重写为 TypeScript
 * 支持 MODE_8BIT_BYTE，纠错等级 L/M/Q/H
 */

export enum ErrorCorrectLevel {
  L = 1,
  M = 0,
  Q = 3,
  H = 2
}

// === 内部常量 ===

const MODE_8BIT_BYTE = 4

const PATTERN_POSITION_TABLE = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
  [6, 30, 54],
  [6, 32, 58],
  [6, 34, 62],
  [6, 26, 46, 66],
  [6, 26, 48, 70],
  [6, 26, 50, 74],
  [6, 30, 54, 78],
  [6, 30, 56, 82],
  [6, 30, 58, 86],
  [6, 34, 62, 90],
  [6, 28, 50, 72, 94],
  [6, 26, 50, 74, 98],
  [6, 30, 54, 78, 102],
  [6, 28, 54, 80, 106],
  [6, 32, 58, 84, 110],
  [6, 30, 58, 86, 114],
  [6, 34, 62, 90, 118],
  [6, 26, 50, 74, 98, 122],
  [6, 30, 54, 78, 102, 126],
  [6, 26, 52, 78, 104, 130],
  [6, 30, 56, 82, 108, 134],
  [6, 34, 60, 86, 112, 138],
  [6, 30, 58, 86, 114, 142],
  [6, 34, 62, 90, 118, 146],
  [6, 30, 54, 78, 102, 126, 150],
  [6, 24, 50, 76, 102, 128, 154],
  [6, 28, 54, 80, 106, 132, 158],
  [6, 32, 58, 84, 110, 136, 162],
  [6, 26, 54, 82, 110, 138, 166],
  [6, 30, 58, 86, 114, 142, 170]
] as number[][]

const G15 = 1335
const G18 = 7973
const G15_MASK = 21522

// === GF(256) 数学 ===

const EXP_TABLE: number[] = new Array(256)
const LOG_TABLE: number[] = new Array(256)

for (let i = 0; i < 8; i++) {
  EXP_TABLE[i] = 1 << i
}
for (let i = 8; i < 256; i++) {
  EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8]
}
for (let i = 0; i < 255; i++) {
  LOG_TABLE[EXP_TABLE[i]] = i
}

function glog(n: number): number {
  if (n < 1) {
    throw new Error('glog(' + n + ')')
  }
  return LOG_TABLE[n]
}

function gexp(n: number): number {
  let v = n
  while (v < 0) {
    v += 255
  }
  while (v >= 256) {
    v -= 255
  }
  return EXP_TABLE[v]
}

// === Polynomial ===
class Polynomial {
  private num: number[]

  constructor(num: number[], shift: number) {
    let offset = 0
    while (offset < num.length && num[offset] === 0) {
      offset++
    }
    this.num = new Array(num.length - offset + shift)
    for (let i = 0; i < num.length - offset; i++) {
      this.num[i] = num[i + offset]
    }
  }

  get(index: number): number {
    return this.num[index]
  }
  getLength(): number {
    return this.num.length
  }

  multiply(other: Polynomial): Polynomial {
    const result = new Array(this.getLength() + other.getLength() - 1)
    for (let i = 0; i < result.length; i++) {
      result[i] = 0
    }
    for (let i = 0; i < this.getLength(); i++) {
      for (let j = 0; j < other.getLength(); j++) {
        result[i + j] ^= gexp(glog(this.get(i)) + glog(other.get(j)))
      }
    }
    return new Polynomial(result, 0)
  }

  mod(other: Polynomial): Polynomial {
    if (this.getLength() - other.getLength() < 0) {
      return this
    }
    const ratio = glog(this.get(0)) - glog(other.get(0))
    const result = new Array(this.getLength())
    for (let i = 0; i < this.getLength(); i++) {
      result[i] = this.get(i)
    }
    for (let i = 0; i < other.getLength(); i++) {
      result[i] ^= gexp(glog(other.get(i)) + ratio)
    }
    return new Polynomial(result, 0).mod(other)
  }
}

// === BitBuffer ===
class BitBuffer {
  buffer: number[] = []
  length = 0

  put(num: number, length: number): void {
    for (let i = 0; i < length; i++) {
      this.putBit(((num >>> (length - i - 1)) & 1) === 1)
    }
  }

  getLengthInBits(): number {
    return this.length
  }

  putBit(bit: boolean): void {
    const idx = Math.floor(this.length / 8)
    if (this.buffer.length <= idx) {
      this.buffer.push(0)
    }
    if (bit) {
      this.buffer[idx] |= 128 >>> this.length % 8
    }
    this.length++
  }
}

// === RSBlock ===
interface RSBlockEntry {
  totalCount: number
  dataCount: number
}

/* RS_BLOCK_TABLE 压缩为 flat 数组，每 3 个元素一组 [count, total, data] */
const RS_BLOCK_TABLE: number[][] = [
  [1, 26, 19],
  [1, 26, 16],
  [1, 26, 13],
  [1, 26, 9],
  [1, 44, 34],
  [1, 44, 28],
  [1, 44, 22],
  [1, 44, 16],
  [1, 70, 55],
  [1, 70, 44],
  [2, 35, 17],
  [2, 35, 13],
  [1, 100, 80],
  [2, 50, 32],
  [2, 50, 24],
  [4, 25, 9],
  [1, 134, 108],
  [2, 67, 43],
  [2, 33, 15, 2, 34, 16],
  [2, 33, 11, 2, 34, 12],
  [2, 86, 68],
  [4, 43, 27],
  [4, 43, 19],
  [4, 43, 15],
  [2, 98, 78],
  [4, 49, 31],
  [2, 32, 14, 4, 33, 15],
  [4, 39, 13, 1, 40, 14],
  [2, 121, 97],
  [2, 60, 38, 2, 61, 39],
  [4, 40, 18, 2, 41, 19],
  [4, 40, 14, 2, 41, 15],
  [2, 146, 116],
  [3, 58, 36, 2, 59, 37],
  [4, 36, 16, 4, 37, 17],
  [4, 36, 12, 4, 37, 13]
]

/* RS_BLOCK_TABLE 续（type 10-20） */
const RS_BLOCK_TABLE_2: number[][] = [
  [2, 86, 68, 2, 87, 69],
  [4, 69, 43, 1, 70, 44],
  [6, 43, 19, 2, 44, 20],
  [6, 43, 15, 2, 44, 16],
  [4, 101, 81],
  [1, 80, 50, 4, 81, 51],
  [4, 50, 22, 4, 51, 23],
  [3, 36, 12, 8, 37, 13],
  [2, 116, 92, 2, 117, 93],
  [6, 58, 36, 2, 59, 37],
  [4, 46, 20, 6, 47, 21],
  [7, 42, 14, 4, 43, 15],
  [4, 133, 107],
  [8, 59, 37, 1, 60, 38],
  [8, 44, 20, 4, 45, 21],
  [12, 33, 11, 4, 34, 12],
  [3, 145, 115, 1, 146, 116],
  [4, 64, 40, 5, 65, 41],
  [11, 36, 16, 5, 37, 17],
  [11, 36, 12, 5, 37, 13],
  [5, 109, 87, 1, 110, 88],
  [5, 65, 41, 5, 66, 42],
  [5, 54, 24, 7, 55, 25],
  [11, 36, 12],
  [5, 122, 98, 1, 123, 99],
  [7, 73, 45, 3, 74, 46],
  [15, 43, 19, 2, 44, 20],
  [3, 45, 15, 13, 46, 16],
  [1, 135, 107, 5, 136, 108],
  [10, 74, 46, 1, 75, 47],
  [1, 50, 22, 15, 51, 23],
  [2, 42, 14, 17, 43, 15],
  [5, 150, 120, 1, 151, 121],
  [9, 69, 43, 4, 70, 44],
  [17, 50, 22, 1, 51, 23],
  [2, 42, 14, 19, 43, 15],
  [3, 141, 113, 4, 142, 114],
  [3, 70, 44, 11, 71, 45],
  [17, 47, 21, 4, 48, 22],
  [9, 39, 13, 16, 40, 14],
  [3, 135, 107, 5, 136, 108],
  [3, 67, 41, 13, 68, 42],
  [15, 54, 24, 5, 55, 25],
  [15, 43, 15, 10, 44, 16]
]

/* RS_BLOCK_TABLE 续（type 21-30） */
const RS_BLOCK_TABLE_3: number[][] = [
  [4, 144, 116, 4, 145, 117],
  [17, 68, 42],
  [17, 50, 22, 6, 51, 23],
  [19, 46, 16, 6, 47, 17],
  [2, 139, 111, 7, 140, 112],
  [17, 74, 46],
  [7, 54, 24, 16, 55, 25],
  [34, 37, 13],
  [4, 151, 121, 5, 152, 122],
  [4, 75, 47, 14, 76, 48],
  [11, 54, 24, 14, 55, 25],
  [16, 45, 15, 14, 46, 16],
  [6, 147, 117, 4, 148, 118],
  [6, 73, 45, 14, 74, 46],
  [11, 54, 24, 16, 55, 25],
  [30, 46, 16, 2, 47, 17],
  [8, 132, 106, 4, 133, 107],
  [8, 75, 47, 13, 76, 48],
  [7, 54, 24, 22, 55, 25],
  [22, 45, 15, 13, 46, 16],
  [10, 142, 114, 2, 143, 115],
  [19, 74, 46, 4, 75, 47],
  [28, 50, 22, 6, 51, 23],
  [33, 46, 16, 4, 47, 17],
  [8, 152, 122, 4, 153, 123],
  [22, 73, 45, 3, 74, 46],
  [8, 53, 23, 26, 54, 24],
  [12, 45, 15, 28, 46, 16],
  [3, 147, 117, 10, 148, 118],
  [3, 73, 45, 23, 74, 46],
  [4, 54, 24, 31, 55, 25],
  [11, 45, 15, 31, 46, 16],
  [7, 146, 116, 7, 147, 117],
  [21, 73, 45, 7, 74, 46],
  [1, 53, 23, 37, 54, 24],
  [19, 45, 15, 26, 46, 16],
  [5, 145, 115, 10, 146, 116],
  [19, 75, 47, 10, 76, 48],
  [15, 54, 24, 25, 55, 25],
  [23, 45, 15, 25, 46, 16]
]

/* RS_BLOCK_TABLE 续（type 31-40） */
const RS_BLOCK_TABLE_4: number[][] = [
  [13, 145, 115, 3, 146, 116],
  [2, 74, 46, 29, 75, 47],
  [42, 54, 24, 1, 55, 25],
  [23, 45, 15, 28, 46, 16],
  [17, 145, 115],
  [10, 74, 46, 23, 75, 47],
  [10, 54, 24, 35, 55, 25],
  [19, 45, 15, 35, 46, 16],
  [17, 145, 115, 1, 146, 116],
  [14, 74, 46, 21, 75, 47],
  [29, 54, 24, 19, 55, 25],
  [11, 45, 15, 46, 46, 16],
  [13, 145, 115, 6, 146, 116],
  [14, 74, 46, 23, 75, 47],
  [44, 54, 24, 7, 55, 25],
  [59, 46, 16, 1, 47, 17],
  [12, 151, 121, 7, 152, 122],
  [12, 75, 47, 26, 76, 48],
  [39, 54, 24, 14, 55, 25],
  [22, 45, 15, 41, 46, 16],
  [6, 151, 121, 14, 152, 122],
  [6, 75, 47, 34, 76, 48],
  [46, 54, 24, 10, 55, 25],
  [2, 45, 15, 64, 46, 16],
  [17, 152, 122, 4, 153, 123],
  [29, 74, 46, 14, 75, 47],
  [49, 54, 24, 10, 55, 25],
  [24, 45, 15, 46, 46, 16],
  [4, 152, 122, 18, 153, 123],
  [13, 74, 46, 32, 75, 47],
  [48, 54, 24, 14, 55, 25],
  [42, 45, 15, 32, 46, 16],
  [20, 147, 117, 4, 148, 118],
  [40, 75, 47, 7, 76, 48],
  [43, 54, 24, 22, 55, 25],
  [10, 45, 15, 67, 46, 16],
  [19, 148, 118, 6, 149, 119],
  [18, 75, 47, 31, 76, 48],
  [34, 54, 24, 34, 55, 25],
  [20, 45, 15, 61, 46, 16]
]

const FULL_RS_TABLE = [
  ...RS_BLOCK_TABLE,
  ...RS_BLOCK_TABLE_2,
  ...RS_BLOCK_TABLE_3,
  ...RS_BLOCK_TABLE_4
]

function getRsBlockTable(
  typeNumber: number,
  errorCorrectLevel: ErrorCorrectLevel
): number[] | undefined {
  const ecIndex = [1, 0, 3, 2].indexOf(errorCorrectLevel)
  if (ecIndex < 0) {
    return undefined
  }
  return FULL_RS_TABLE[4 * (typeNumber - 1) + ecIndex]
}

function getRSBlocks(typeNumber: number, errorCorrectLevel: ErrorCorrectLevel): RSBlockEntry[] {
  const rsBlock = getRsBlockTable(typeNumber, errorCorrectLevel)
  if (!rsBlock) {
    throw new Error(
      'bad rs block @ typeNumber:' + typeNumber + '/errorCorrectLevel:' + errorCorrectLevel
    )
  }
  const list: RSBlockEntry[] = []
  for (let i = 0; i < rsBlock.length / 3; i++) {
    const count = rsBlock[i * 3]
    const totalCount = rsBlock[i * 3 + 1]
    const dataCount = rsBlock[i * 3 + 2]
    for (let j = 0; j < count; j++) {
      list.push({ totalCount, dataCount })
    }
  }
  return list
}

// === QRUtil ===
function getBCHDigit(data: number): number {
  let digit = 0
  let d = data
  while (d !== 0) {
    digit++
    d >>>= 1
  }
  return digit
}

function getBCHTypeInfo(data: number): number {
  let d = data << 10
  while (getBCHDigit(d) - getBCHDigit(G15) >= 0) {
    d ^= G15 << (getBCHDigit(d) - getBCHDigit(G15))
  }
  return ((data << 10) | d) ^ G15_MASK
}

function getBCHTypeNumber(data: number): number {
  let d = data << 12
  while (getBCHDigit(d) - getBCHDigit(G18) >= 0) {
    d ^= G18 << (getBCHDigit(d) - getBCHDigit(G18))
  }
  return (data << 12) | d
}

function getErrorCorrectPolynomial(ecLength: number): Polynomial {
  let a = new Polynomial([1], 0)
  for (let i = 0; i < ecLength; i++) {
    a = a.multiply(new Polynomial([1, gexp(i)], 0))
  }
  return a
}

function getLengthInBits(mode: number, type: number): number {
  if (type >= 1 && type < 10) {
    if (mode === 1) {
      return 10
    }
    if (mode === 2) {
      return 9
    }
    if (mode === 4 || mode === 8) {
      return 8
    }
  } else if (type < 27) {
    if (mode === 1) {
      return 12
    }
    if (mode === 2) {
      return 11
    }
    if (mode === 4) {
      return 16
    }
    if (mode === 8) {
      return 10
    }
  } else if (type < 41) {
    if (mode === 1) {
      return 14
    }
    if (mode === 2) {
      return 13
    }
    if (mode === 4) {
      return 16
    }
    if (mode === 8) {
      return 12
    }
  }
  throw new Error('mode:' + mode + '/type:' + type)
}

function getMask(maskPattern: number, i: number, j: number): boolean {
  switch (maskPattern) {
    case 0:
      return (i + j) % 2 === 0
    case 1:
      return i % 2 === 0
    case 2:
      return j % 3 === 0
    case 3:
      return (i + j) % 3 === 0
    case 4:
      return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0
    case 5:
      return ((i * j) % 2) + ((i * j) % 3) === 0
    case 6:
      return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0
    case 7:
      return (((i * j) % 3) + ((i + j) % 2)) % 2 === 0
    default:
      throw new Error('bad maskPattern:' + maskPattern)
  }
}

function getLostPoint(qr: QRCode): number {
  const moduleCount = qr.getModuleCount()
  let lostPoint = 0

  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      let sameCount = 0
      const dark = qr.isDark(row, col)
      for (let r = -1; r <= 1; r++) {
        if (row + r < 0 || moduleCount <= row + r) {
          continue
        }
        for (let c = -1; c <= 1; c++) {
          if (col + c < 0 || moduleCount <= col + c) {
            continue
          }
          if (r === 0 && c === 0) {
            continue
          }
          if (dark === qr.isDark(row + r, col + c)) {
            sameCount++
          }
        }
      }
      if (sameCount > 5) {
        lostPoint += 3 + sameCount - 5
      }
    }
  }

  for (let row = 0; row < moduleCount - 1; row++) {
    for (let col = 0; col < moduleCount - 1; col++) {
      let count = 0
      if (qr.isDark(row, col)) {
        count++
      }
      if (qr.isDark(row + 1, col)) {
        count++
      }
      if (qr.isDark(row, col + 1)) {
        count++
      }
      if (qr.isDark(row + 1, col + 1)) {
        count++
      }
      if (count === 0 || count === 4) {
        lostPoint += 3
      }
    }
  }

  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount - 6; col++) {
      if (
        qr.isDark(row, col) &&
        !qr.isDark(row, col + 1) &&
        qr.isDark(row, col + 2) &&
        qr.isDark(row, col + 3) &&
        qr.isDark(row, col + 4) &&
        !qr.isDark(row, col + 5) &&
        qr.isDark(row, col + 6)
      ) {
        lostPoint += 40
      }
    }
  }

  for (let col = 0; col < moduleCount; col++) {
    for (let row = 0; row < moduleCount - 6; row++) {
      if (
        qr.isDark(row, col) &&
        !qr.isDark(row + 1, col) &&
        qr.isDark(row + 2, col) &&
        qr.isDark(row + 3, col) &&
        qr.isDark(row + 4, col) &&
        !qr.isDark(row + 5, col) &&
        qr.isDark(row + 6, col)
      ) {
        lostPoint += 40
      }
    }
  }

  let darkCount = 0
  for (let col = 0; col < moduleCount; col++) {
    for (let row = 0; row < moduleCount; row++) {
      if (qr.isDark(row, col)) {
        darkCount++
      }
    }
  }
  lostPoint += (Math.abs((100 * darkCount) / moduleCount / moduleCount - 50) / 5) * 10
  return lostPoint
}

/** UTF-8 编码（QR 码需要将中文等多字节字符编码为 UTF-8） */
function utf8Encode(str: string): string {
  let result = ''
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    if (c >= 1 && c <= 127) {
      result += str.charAt(i)
    } else if (c > 2047) {
      result += String.fromCharCode(224 | ((c >> 12) & 15))
      result += String.fromCharCode(128 | ((c >> 6) & 63))
      result += String.fromCharCode(128 | (c & 63))
    } else {
      result += String.fromCharCode(192 | ((c >> 6) & 31))
      result += String.fromCharCode(128 | (c & 63))
    }
  }
  return result
}

// === QRCode 主类 ===
interface QR8BitByte {
  mode: number
  data: string
  getLength(): number
  write(buffer: BitBuffer): void
}

function create8BitByte(data: string): QR8BitByte {
  return {
    mode: MODE_8BIT_BYTE,
    data,
    getLength() {
      return this.data.length
    },
    write(buffer: BitBuffer) {
      for (let i = 0; i < this.data.length; i++) {
        buffer.put(this.data.charCodeAt(i), 8)
      }
    }
  }
}

export class QRCode {
  private typeNumber: number
  private errorCorrectLevel: ErrorCorrectLevel
  private modules: (boolean | null)[][] | null = null
  private moduleCount = 0
  private dataCache: number[] | null = null
  private dataList: QR8BitByte[] = []

  constructor(typeNumber: number, errorCorrectLevel: ErrorCorrectLevel) {
    this.typeNumber = typeNumber
    this.errorCorrectLevel = errorCorrectLevel
  }

  addData(data: string): void {
    this.dataList.push(create8BitByte(utf8Encode(data)))
    this.dataCache = null
  }

  isDark(row: number, col: number): boolean {
    if (row < 0 || this.moduleCount <= row || col < 0 || this.moduleCount <= col) {
      throw new Error(row + ',' + col)
    }
    return this.modules![row][col] === true
  }

  getModuleCount(): number {
    return this.moduleCount
  }

  make(): void {
    if (this.typeNumber < 1) {
      let tn = 1
      for (tn = 1; tn < 40; tn++) {
        const rsBlocks = getRSBlocks(tn, this.errorCorrectLevel)
        const buffer = new BitBuffer()
        let totalDataCount = 0
        for (let i = 0; i < rsBlocks.length; i++) {
          totalDataCount += rsBlocks[i].dataCount
        }
        for (let i = 0; i < this.dataList.length; i++) {
          const data = this.dataList[i]
          buffer.put(data.mode, 4)
          buffer.put(data.getLength(), getLengthInBits(data.mode, tn))
          data.write(buffer)
        }
        if (buffer.getLengthInBits() <= totalDataCount * 8) {
          break
        }
      }
      this.typeNumber = tn
    }
    this.makeImpl(false, this.getBestMaskPattern())
  }

  private makeImpl(test: boolean, maskPattern: number): void {
    this.moduleCount = this.typeNumber * 4 + 17
    this.modules = new Array(this.moduleCount)
    for (let row = 0; row < this.moduleCount; row++) {
      this.modules[row] = new Array(this.moduleCount)
      for (let col = 0; col < this.moduleCount; col++) {
        this.modules[row][col] = null
      }
    }
    this.setupPositionProbePattern(0, 0)
    this.setupPositionProbePattern(this.moduleCount - 7, 0)
    this.setupPositionProbePattern(0, this.moduleCount - 7)
    this.setupPositionAdjustPattern()
    this.setupTimingPattern()
    this.setupTypeInfo(test, maskPattern)
    if (this.typeNumber >= 7) {
      this.setupTypeNumber(test)
    }
    if (this.dataCache === null) {
      this.dataCache = QRCode.createData(this.typeNumber, this.errorCorrectLevel, this.dataList)
    }
    this.mapData(this.dataCache, maskPattern)
  }

  private setupPositionProbePattern(row: number, col: number): void {
    for (let r = -1; r <= 7; r++) {
      if (row + r <= -1 || this.moduleCount <= row + r) {
        continue
      }
      for (let c = -1; c <= 7; c++) {
        if (col + c <= -1 || this.moduleCount <= col + c) {
          continue
        }
        this.modules![row + r][col + c] =
          (0 <= r && r <= 6 && (c === 0 || c === 6)) ||
          (0 <= c && c <= 6 && (r === 0 || r === 6)) ||
          (2 <= r && r <= 4 && 2 <= c && c <= 4)
      }
    }
  }

  private setupTimingPattern(): void {
    for (let r = 8; r < this.moduleCount - 8; r++) {
      if (this.modules![r][6] === null) {
        this.modules![r][6] = r % 2 === 0
      }
    }
    for (let c = 8; c < this.moduleCount - 8; c++) {
      if (this.modules![6][c] === null) {
        this.modules![6][c] = c % 2 === 0
      }
    }
  }

  private setupPositionAdjustPattern(): void {
    const pos = PATTERN_POSITION_TABLE[this.typeNumber - 1]
    for (let i = 0; i < pos.length; i++) {
      for (let j = 0; j < pos.length; j++) {
        const row = pos[i],
          col = pos[j]
        if (this.modules![row][col] !== null) {
          continue
        }
        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            this.modules![row + r][col + c] =
              r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0)
          }
        }
      }
    }
  }

  private setupTypeNumber(test: boolean): void {
    const bits = getBCHTypeNumber(this.typeNumber)
    for (let i = 0; i < 18; i++) {
      const mod = !test && ((bits >> i) & 1) === 1
      this.modules![Math.floor(i / 3)][(i % 3) + this.moduleCount - 8 - 3] = mod
    }
    for (let i = 0; i < 18; i++) {
      const mod = !test && ((bits >> i) & 1) === 1
      this.modules![(i % 3) + this.moduleCount - 8 - 3][Math.floor(i / 3)] = mod
    }
  }

  private setupTypeInfo(test: boolean, maskPattern: number): void {
    const data = (this.errorCorrectLevel << 3) | maskPattern
    const bits = getBCHTypeInfo(data)
    for (let i = 0; i < 15; i++) {
      const mod = !test && ((bits >> i) & 1) === 1
      if (i < 6) {
        this.modules![i][8] = mod
      } else if (i < 8) {
        this.modules![i + 1][8] = mod
      } else {
        this.modules![this.moduleCount - 15 + i][8] = mod
      }
    }
    for (let i = 0; i < 15; i++) {
      const mod = !test && ((bits >> i) & 1) === 1
      if (i < 8) {
        this.modules![8][this.moduleCount - i - 1] = mod
      } else if (i < 9) {
        this.modules![8][15 - i - 1 + 1] = mod
      } else {
        this.modules![8][15 - i - 1] = mod
      }
    }
    this.modules![this.moduleCount - 8][8] = !test
  }

  private getBestMaskPattern(): number {
    let minLostPoint = 0,
      pattern = 0
    for (let i = 0; i < 8; i++) {
      this.makeImpl(true, i)
      const lp = getLostPoint(this)
      if (i === 0 || minLostPoint > lp) {
        minLostPoint = lp
        pattern = i
      }
    }
    return pattern
  }

  private mapData(data: number[], maskPattern: number): void {
    let inc = -1,
      row = this.moduleCount - 1,
      bitIndex = 7,
      byteIndex = 0
    for (let col = this.moduleCount - 1; col > 0; col -= 2) {
      if (col === 6) {
        col--
      }
      let continueMapping = true
      while (continueMapping) {
        for (let c = 0; c < 2; c++) {
          if (this.modules![row][col - c] === null) {
            let dark = false
            if (byteIndex < data.length) {
              dark = ((data[byteIndex] >>> bitIndex) & 1) === 1
            }
            if (getMask(maskPattern, row, col - c)) {
              dark = !dark
            }
            this.modules![row][col - c] = dark
            bitIndex--
            if (bitIndex === -1) {
              byteIndex++
              bitIndex = 7
            }
          }
        }
        row += inc
        if (row < 0 || this.moduleCount <= row) {
          row -= inc
          inc = -inc
          continueMapping = false
        }
      }
    }
  }

  static createData(
    typeNumber: number,
    ecLevel: ErrorCorrectLevel,
    dataList: QR8BitByte[]
  ): number[] {
    const rsBlocks = getRSBlocks(typeNumber, ecLevel)
    const buffer = new BitBuffer()
    for (let i = 0; i < dataList.length; i++) {
      const data = dataList[i]
      buffer.put(data.mode, 4)
      buffer.put(data.getLength(), getLengthInBits(data.mode, typeNumber))
      data.write(buffer)
    }
    let totalDataCount = 0
    for (let i = 0; i < rsBlocks.length; i++) {
      totalDataCount += rsBlocks[i].dataCount
    }
    if (buffer.getLengthInBits() > totalDataCount * 8) {
      throw new Error(
        'code length overflow. (' + buffer.getLengthInBits() + '>' + totalDataCount * 8 + ')'
      )
    }
    if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
      buffer.put(0, 4)
    }
    while (buffer.getLengthInBits() % 8 !== 0) {
      buffer.putBit(false)
    }
    while (buffer.getLengthInBits() < totalDataCount * 8) {
      buffer.put(236, 8)
      if (buffer.getLengthInBits() < totalDataCount * 8) {
        buffer.put(17, 8)
      }
    }
    return QRCode.createBytes(buffer, rsBlocks)
  }

  static createBytes(buffer: BitBuffer, rsBlocks: RSBlockEntry[]): number[] {
    let offset = 0,
      maxDcCount = 0,
      maxEcCount = 0
    const dcdata: number[][] = new Array(rsBlocks.length)
    const ecdata: number[][] = new Array(rsBlocks.length)
    for (let r = 0; r < rsBlocks.length; r++) {
      const dcCount = rsBlocks[r].dataCount
      const ecCount = rsBlocks[r].totalCount - dcCount
      maxDcCount = Math.max(maxDcCount, dcCount)
      maxEcCount = Math.max(maxEcCount, ecCount)
      dcdata[r] = new Array(dcCount)
      for (let i = 0; i < dcdata[r].length; i++) {
        dcdata[r][i] = 0xff & buffer.buffer[i + offset]
      }
      offset += dcCount
      const rsPoly = getErrorCorrectPolynomial(ecCount)
      const rawPoly = new Polynomial(dcdata[r], rsPoly.getLength() - 1)
      const modPoly = rawPoly.mod(rsPoly)
      ecdata[r] = new Array(rsPoly.getLength() - 1)
      for (let i = 0; i < ecdata[r].length; i++) {
        const modIndex = i + modPoly.getLength() - ecdata[r].length
        ecdata[r][i] = modIndex >= 0 ? modPoly.get(modIndex) : 0
      }
    }
    let totalCodeCount = 0
    for (let i = 0; i < rsBlocks.length; i++) {
      totalCodeCount += rsBlocks[i].totalCount
    }
    const data = new Array(totalCodeCount)
    let index = 0
    for (let i = 0; i < maxDcCount; i++) {
      for (let r = 0; r < rsBlocks.length; r++) {
        if (i < dcdata[r].length) {
          data[index++] = dcdata[r][i]
        }
      }
    }
    for (let i = 0; i < maxEcCount; i++) {
      for (let r = 0; r < rsBlocks.length; r++) {
        if (i < ecdata[r].length) {
          data[index++] = ecdata[r][i]
        }
      }
    }
    return data
  }
}
