declare module 'amplitude' {
  class Amplitude {
    constructor(apiKey: string);

    public track(data: any): Promise<void>;
    public identify(data: any): Promise<void>;
  }

  export = Amplitude;
}
