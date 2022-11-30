declare module 'js-yaml' {
  export function dump(spec: any): string;

  export function safeLoad(yamlString: string): { [key: string]: any };
}
