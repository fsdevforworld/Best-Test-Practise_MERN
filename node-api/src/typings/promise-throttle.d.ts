declare module 'promise-throttle' {
  class PromiseThrottle {
    constructor(data: any);

    public add(x: any): PromiseLike<any>;
  }
  export = PromiseThrottle;
}
