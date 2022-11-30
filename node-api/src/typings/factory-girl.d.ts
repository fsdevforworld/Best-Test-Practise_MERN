declare module 'factory-girl' {
  import { Options, Static } from 'factory-girl/index';

  interface IStaticExtended extends Static {
    create(name: string, attrs?: object, buildOpts?: object): Promise<any>;
    create<T>(name: string, attrs?: Partial<T>, buildOpts?: object): Promise<T>;

    createMany(name: string, num: number, attrs?: object, buildOptions?: object): Promise<any[]>;
    createMany(name: string, attrs?: object[], buildOptions?: object): Promise<any[]>;

    createMany<T>(
      name: string,
      num: number,
      attrs?: Partial<T>,
      buildOptions?: Options<T>,
    ): Promise<T[]>;
    createMany<T>(name: string, attrs?: Array<Partial<T>>, buildOptions?: Options<T>): Promise<T[]>;

    build(name: string, attrs?: object, buildOptions?: object): Promise<any>;
    build<T>(name: string, attrs?: Partial<T>, buildOptions?: object): Promise<T>;

    setAdapter(adapter: any, name?: string[]): void;
    setAdapter(adapter: any, name?: string): void;

    withOptions(buildOpts?: object): void;
  }

  export class DefaultAdapter {
    constructor();
  }
  export const SequelizeAdapter: any;
  export const ObjectAdapter: any;
  export const factory: IStaticExtended;
}
