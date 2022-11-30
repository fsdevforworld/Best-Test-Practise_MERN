type ParseOptions = {
  normalize: boolean;
  forgiving: boolean;
  warning: (...args: any[]) => any;
};

type LocaleSchema = {
  language: string | null;
  extendedLanguageSubtags: string[];
  script: string | null;
  region: string | null;
  variants: string[];
  extensions: any[];
  privateuse: string[];
  irregular: string[] | null;
  regular: string[] | null;
};

declare module 'bcp-47' {
  export function parse(locale: string, options?: ParseOptions): LocaleSchema;
  export function stringify(parsedLocale: LocaleSchema): string;
}
