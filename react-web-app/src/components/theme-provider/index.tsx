import React, { FC } from 'react';
import {
  createMuiTheme,
  Theme,
  ThemeProvider as MaterialUiThemeProvider,
} from '@material-ui/core/styles';

import palette from './palette';
import typography from './typography';
import overrides from './overrides';

const ThemeProvider: FC = ({ children }) => {
  const theme: Theme = createMuiTheme({
    typography,
    palette,
    overrides,
  });
  return <MaterialUiThemeProvider theme={theme}>{children}</MaterialUiThemeProvider>;
};

export default ThemeProvider;
