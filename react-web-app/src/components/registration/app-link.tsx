import { Grid, makeStyles, Theme, Typography } from '@material-ui/core';
import clsx from 'clsx';
import AppStoreButtons from 'components/app-store-buttons';
import { LandingPageContext } from 'components/landing-page';
import { LandingPageAlignment } from 'components/landing-page/context';
import { useIsMobile } from 'lib/hooks';
import { useModeStyle } from 'lib/use-mode-style';
import React, { FC, useContext } from 'react';

interface Props {
  title: string;
  subtitle: string;
}

const useStyles = makeStyles((theme: Theme) => ({
  titleContainer: {
    padding: theme.spacing(0, 0, 6),
    [theme.breakpoints.down('md')]: {
      padding: theme.spacing(0, 2, 4),
    },
  },
  title: {
    fontSize: 56,
    textAlign: 'center',
    [theme.breakpoints.up('sm')]: {
      textAlign: ({ align }: { align: LandingPageAlignment }) => align,
    },
    [theme.breakpoints.down('md')]: {
      fontSize: 36,
      letterSpacing: '-1px',
    },
  },
  subtitleContainer: {
    marginBottom: theme.spacing(10),
    maxWidth: 600,
  },
  subtitle: {
    fontFamily: 'Basis Grotesque',
    fontWeight: 400,
    lineHeight: '24px',
    fontSize: '20px',
    textAlign: 'center',
    [theme.breakpoints.up('sm')]: {
      textAlign: ({ align }: { align: LandingPageAlignment }) => align,
    },
    [theme.breakpoints.down('sm')]: {
      lineHeight: '24px',
    },
  },
  buttonsContainer: {
    marginBottom: theme.spacing(4),
  },
}));

const AppLink: FC<Props> = ({ title, subtitle }) => {
  const { classes: modeClasses } = useModeStyle();
  const { align } = useContext(LandingPageContext);
  const classes = useStyles({ align });

  const isMobile = useIsMobile();

  return (
    <Grid
      container
      item
      direction="column"
      alignItems={align === 'center' || isMobile ? 'center' : 'flex-start'}
    >
      <Grid item className={classes.titleContainer}>
        <Typography variant="h1" className={clsx(classes.title, modeClasses.textPrimary)}>
          {title}
        </Typography>
      </Grid>
      <Grid item className={classes.subtitleContainer}>
        <Typography className={clsx(classes.subtitle, modeClasses.textSecondary)} variant="h3">
          {subtitle}
        </Typography>
      </Grid>
      <Grid item className={classes.buttonsContainer}>
        <AppStoreButtons justify="center" />
      </Grid>
    </Grid>
  );
};

export default AppLink;
