export class BackgroundScoringPreprocessError extends Error {
  public readonly quiet: boolean;

  /**
   * @param {string} message
   * @param {boolean | undefined} quiet - Should error message get logged or not
   */
  constructor(message: string, { quiet = false }: { quiet?: boolean } = {}) {
    super(message);

    this.quiet = quiet;
  }
}
