import React, { FC } from 'react';
import { Grid, makeStyles, Theme } from '@material-ui/core';
import { BankingForHumans, DaveLogo } from 'img/logos';
import { useModeStyle } from 'lib/use-mode-style';
import clsx from 'clsx';

const useStyles = makeStyles((theme: Theme) => ({
  header: {
    position: 'absolute',
    backgroundColor: 'transparent',
  },
  logoContainer: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    width: '120px',
    cursor: 'pointer',
    padding: theme.spacing(3),
    zIndex: 3,
    '&:focus': {
      outlineColor: theme.palette.grey['50'],
      outlineWidth: 'medium',
      outlineOffset: '-2px',
    },
    [theme.breakpoints.down('xs')]: {
      width: '95px',
    },
  },
  daveLogo: {
    marginBottom: theme.spacing(),
    width: '100%',
    height: 'auto',
  },
  bankingForHumansLogo: {
    width: '100%',
    height: 'auto',
  },
}));

const Header: FC = () => {
  const classes = useStyles();
  const { classes: modeClasses } = useModeStyle();

  return (
    <Grid container justify="space-between" className={classes.header}>
      <a href="/" target="_blank" rel="noopener noreferer" className={classes.logoContainer}>
        <DaveLogo className={clsx(classes.daveLogo, modeClasses.textPrimary)} />
        <BankingForHumans className={clsx(classes.bankingForHumansLogo, modeClasses.textPrimary)} />
      </a>
    </Grid>
  );
};

export default Header;
