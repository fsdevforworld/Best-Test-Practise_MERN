declare module 'natural' {
  export class NGrams {
    public static ngrams(
      sequence: string,
      n: number,
      startSymbol?: string,
      endSymbol?: string,
      stats?: boolean,
    ): string[][];
  }
}
