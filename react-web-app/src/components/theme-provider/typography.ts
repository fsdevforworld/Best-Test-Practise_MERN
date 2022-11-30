import { ThemeOptions } from '@material-ui/core/styles';

const typography: ThemeOptions['typography'] = {
  fontFamily: `"Basis Grotesque", "Helvetica Neue", "Lucida Grande", Arial, sans-serif`,
  h1: {
    fontSize: '48px',
    letterSpacing: '-1.5px',
    fontFamily: `"Larsseit", "Helvetica Neue", "Lucida Grande", Arial, sans-serif`,
  },
  h2: {
    fontSize: '36px',
    letterSpacing: '-0.5px',
    fontFamily: `"Larsseit", "Helvetica Neue", "Lucida Grande", Arial, sans-serif`,
  },
  h3: {
    fontSize: '24px',
    letterSpacing: '0px',
    fontFamily: `"Larsseit", "Helvetica Neue", "Lucida Grande", Arial, sans-serif`,
  },
  h4: {
    fontSize: '20px',
    letterSpacing: '0.25px',
    fontFamily: `"Larsseit", "Helvetica Neue", "Lucida Grande", Arial, sans-serif`,
  },
  h5: {
    fontSize: '16px',
    letterSpacing: '0px',
    lineHeight: '19px',
    fontFamily: `"Larsseit", "Helvetica Neue", "Lucida Grande", Arial, sans-serif`,
  },
  h6: {
    fontSize: '14px',
    letterSpacing: '0.15px',
    fontFamily: `"Larsseit", "Helvetica Neue", "Lucida Grande", Arial, sans-serif`,
  },
  body1: {
    fontSize: '16px',
  },
  body2: {
    fontSize: '12px',
  },
  subtitle1: {
    fontSize: '13px',
    letterSpacing: '0.15px',
    lineHeight: '20px',
  },
  subtitle2: {
    fontSize: '12px',
    letterSpacing: '0px',
    lineHeight: '18px',
  },
  button: {
    fontSize: '14px',
    letterSpacing: '0.25px',
    lineHeight: '18px',
    textTransform: 'none',
  },
  caption: {
    fontSize: '12px',
    letterSpacing: '0.125px',
    '& b': {
      letterSpacing: '0.25px',
    },
  },
  overline: {
    fontSize: '10px',
    letterSpacing: '0px',
    textTransform: 'capitalize',
  },
};

export default typography;
