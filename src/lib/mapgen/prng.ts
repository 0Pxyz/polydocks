/**
 * MurmurHash3 string hashing algorithm for deterministic seed hashing.
 */
export function hashStringToSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  }
  h += h << 13;
  h ^= h >>> 7;
  h += h << 3;
  h ^= h >>> 17;
  return (h + (h << 5)) >>> 0;
}

/**
 * Deterministic Pseudo-Random Number Generator using Mulberry32.
 */
export class PRNG {
  private state: number;

  constructor(seed: string | number = "polymax-default-seed") {
    if (typeof seed === "string") {
      this.state = hashStringToSeed(seed);
    } else {
      this.state = (seed >>> 0) || 1;
    }
  }

  /**
   * Returns a float in [0, 1).
   */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns a float in [min, max).
   */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /**
   * Returns an integer in [min, max] (inclusive).
   */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /**
   * Randomly picks one element from an array.
   */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error("Cannot pick from an empty array");
    }
    const index = Math.floor(this.next() * items.length);
    return items[index];
  }

  /**
   * Shuffles an array deterministically using Fisher-Yates.
   */
  shuffle<T>(array: readonly T[]): T[] {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const temp = copy[i];
      copy[i] = copy[j];
      copy[j] = temp;
    }
    return copy;
  }
}
