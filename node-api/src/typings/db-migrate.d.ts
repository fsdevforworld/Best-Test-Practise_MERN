declare module 'db-migrate' {
  class DBItem {
    public internals: {
      argv: {
        _: string[];
      };
    };

    public up(): Promise<void>;
    public runSql(sql: string, params?: Array<string | number>): Promise<any>;
  }

  export type DBType = {
    CHAR: string;
    STRING: string;
    TEXT: string;
    SMALLINT: string;
    BIGINT: string;
    INTEGER: string;
    SMALL_INTEGER: string;
    BIG_INTEGER: string;
    REAL: string;
    DATE: string;
    DATE_TIME: string;
    TIME: string;
    BLOB: string;
    TIMESTAMP: string;
    BINARY: string;
    BOOLEAN: string;
    DECIMAL: 'decimal';
  };

  export function getInstance(isModule: boolean, options: any): DBItem;
}
