declare module '@material-ui/core/styles/createPalette' {
  interface Palette {
    green: Palette['grey'];
  }
  interface PaletteOptions {
    green: PaletteOptions['grey'];
  }
}

export {};
