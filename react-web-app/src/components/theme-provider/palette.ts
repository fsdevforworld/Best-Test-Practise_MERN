import { ThemeOptions } from '@material-ui/core/styles';

const palette: ThemeOptions['palette'] = {
  background: {
    default: '#F5F5F5',
    paper: '#FFFFFF',
  },
  divider: '#EFEFEF',
  primary: {
    main: '#326AC8',
  },
  secondary: {
    light: '#15B650',
    main: '#0B9A40',
  },
  warning: {
    main: '#FFC107',
    dark: '#FF8F00',
  },
  error: {
    main: '#FF5252',
  },
  text: {
    secondary: '#4D4D4D',
    primary: '#3C3C3C',
  },
  grey: {
    '50': '#F5F5F5',
    '100': '#E6E6E6',
    '200': '#C0C0C0',
    '300': '#898989',
    '400': '#4D4D4D',
    '500': '#3C3C3C',
    '600': '#282828',
    '700': '#1B1B1B',
  },
  green: {
    '50': '#D3FFE3',
    '100': '#36D571',
    '200': '#1AD760',
    '300': '#0B9A40',
    '400': '#066027',
    '500': '#043616',
  },
};

export default palette;
