export function noKeyChecks(sql: string) {
  return `SET FOREIGN_KEY_CHECKS = 0; ${sql} SET FOREIGN_KEY_CHECKS = 1;`;
}
