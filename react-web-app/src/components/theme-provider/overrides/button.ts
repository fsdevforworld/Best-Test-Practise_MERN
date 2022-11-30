import { Overrides } from '@material-ui/core/styles/overrides';

const Button: Overrides['MuiButton'] = {
  root: {
    borderRadius: '50px',
    fontFamily: `"Larsseit", sans-serif`,
    padding: '16px 30px',
    fontSize: '20px',
    lineHeight: '24px',
    fontWeight: 'bold',
  },
  sizeLarge: {
    padding: '15px 60px',
    fontSize: '24px',
    lineHeight: '32px',
  },
  contained: {
    boxShadow: 'none',
  },
};

export default Button;
