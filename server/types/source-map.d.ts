declare module "source-map" {
  export interface RawSourceMap {
    version: number;
    sources: string[];
    names: string[];
    mappings: string;
    file?: string;
    sourceRoot?: string;
    sourcesContent?: string[];
  }

  export interface MappedPosition {
    source: string | null;
    line: number | null;
    column: number | null;
    name: string | null;
  }

  export class SourceMapConsumer {
    constructor(rawSourceMap: RawSourceMap | string);
    originalPositionFor(generatedPosition: {
      line: number;
      column: number;
      bias?: number;
    }): MappedPosition;
    destroy(): void;
    static GREATEST_LOWER_BOUND: number;
    static LEAST_UPPER_BOUND: number;
  }
}
