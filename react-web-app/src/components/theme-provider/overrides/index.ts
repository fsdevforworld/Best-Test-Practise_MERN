import { ThemeOptions } from '@material-ui/core';
import Button from './button';

const overrides: ThemeOptions['overrides'] = {
  MuiButton: Button,
};

export default overrides;
