import { makeStyles, Theme } from '@material-ui/core';
import { useContext } from 'react';
import ModeContext, { Mode } from './mode-context';

const useStyles = makeStyles((theme: Theme) => ({
  backgroundDefault: {
    backgroundColor: ({ mode }: { mode: Mode }) =>
      mode === 'light' ? theme.palette.background.default : theme.palette.grey['600'],
  },
  textPrimary: {
    color: ({ mode }: { mode: Mode }) =>
      mode === 'light' ? theme.palette.text.primary : theme.palette.grey['50'],
  },
  textSecondary: {
    color: ({ mode }: { mode: Mode }) =>
      mode === 'light' ? theme.palette.text.secondary : theme.palette.grey['200'],
  },
  textTertiary: {
    color: ({ mode }: { mode: Mode }) =>
      mode === 'light' ? theme.palette.text.secondary : theme.palette.grey['300'],
  },
  divider: {
    backgroundColor: ({ mode }: { mode: Mode }) =>
      mode === 'light' ? theme.palette.divider : theme.palette.grey['600'],
  },
}));

export const useModeStyle = () => {
  const mode = useContext(ModeContext);
  const classes = useStyles({ mode });

  return {
    mode,
    classes,
  };
};
