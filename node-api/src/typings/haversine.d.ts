declare module 'haversine' {
  type Coordinates = {
    latitude: number;
    longitude: number;
  };

  type Options = {
    unit: string;
  };

  function haversine(
    startCoordinates: Coordinates,
    endCoordinates: Coordinates,
    options: Options,
  ): number;

  export = haversine;
}
