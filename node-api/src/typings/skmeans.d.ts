declare module 'skmeans' {
  type Cluster = {
    id: number;
    k: number;
    idxs: number[];
    centroids: number[];
  };

  function Clusterize(
    points: number[][],
    k: number,
    centroids?: 'kmpp' | 'kmrand' | number[][],
    iterations?: number,
  ): Cluster;

  export = Clusterize;
}
