declare module "ngeohash" {
  const ngeohash: {
    encode(latitude: number, longitude: number, precision?: number): string;
    decode(hash: string): { latitude: number; longitude: number };
    decode_bbox(hash: string): [number, number, number, number];
    neighbor(hash: string, direction: [number, number]): string;
    neighbors(hash: string): string[];
    bboxes(
      minLat: number,
      minLon: number,
      maxLat: number,
      maxLon: number,
      precision?: number,
    ): string[];
  };
  export = ngeohash;
}
