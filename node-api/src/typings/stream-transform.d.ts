declare module 'stream-transform' {
  import * as Stream from 'stream';
  function Transform(transformer: (data: any, cb: () => {}) => any): Stream.Transform;
  export = Transform;
}
