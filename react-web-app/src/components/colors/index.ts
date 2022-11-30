/*
If any changes are made to the keys or hex codes, make sure to also update css/colors.css
*/

enum Colors {
  transparent = 'rgba(0, 0, 0, 0.01)',
  white = '#ffffff',
  pitchBlack = '#000000',
  black = '#3C3C3C',
  gray1 = '#F5F5F5',
  gray2 = '#E6E6E6',
  gray3 = '#C0C0C0',
  gray4 = '#898989',
  gray5 = '#4D4D4D',
  green1 = '#D3FFE3',
  green2 = '#36D571',
  green3 = '#0B9A40',
  green4 = '#066027',
  green5 = '#043616',
  green6 = '#1AD760',
  berry1 = '#EDF3FE',
  berry2 = '#82AEF8',
  berry3 = '#3C81F4',
  berry4 = '#326AC8',
  berry5 = '#1C3B6F',
  grape1 = '#F3EFFE',
  grape2 = '#AE92FC',
  grape3 = '#8155FB',
  grape4 = '#6A46CE',
  grape5 = '#3B2773',
  banana1 = '#FFF9E8',
  banana2 = '#FFD761',
  banana3 = '#FFC107',
  banana4 = '#D19E06',
  banana5 = '#745804',
  banana6 = '#ffc208',
  carrot1 = '#FEF4F1',
  carrot2 = '#F9B69E',
  carrot3 = '#F68D68',
  carrot4 = '#CA7456',
  carrot5 = '#704130',
  candy1 = '#FFEFEF',
  candy2 = '#FF9090',
  candy3 = '#FF5252',
  candy4 = '#D14444',
  candy5 = '#742626',
}

export default Colors;

export type ColorName = keyof typeof Colors;
