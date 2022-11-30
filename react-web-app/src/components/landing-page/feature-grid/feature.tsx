import { Grid, makeStyles, SvgIconProps, Theme, Typography } from '@material-ui/core';
import clsx from 'clsx';
import { useModeStyle } from 'lib/use-mode-style';
import React, { FC } from 'react';

interface Props {
  title: string;
  disclaimerKey?: number;
  Icon: React.ComponentType<SvgIconProps>;
}

const useStyles = makeStyles((theme: Theme) => ({
  container: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    height: '80px',
    [theme.breakpoints.down('sm')]: {
      height: '56px',
    },
  },
  iconContainer: {
    margin: theme.spacing(0, 4, 0, 0),
    display: 'flex',
    padding: theme.spacing(),
    borderRadius: '12px',
    [theme.breakpoints.down('xs')]: {
      marginRight: theme.spacing(2),
    },
  },
  titleContainer: {
    flexBasis: 0,
    flexGrow: 1,
    maxWidth: '400px',
  },
  title: {
    fontWeight: 400,
    fontFamily: 'Basis Grotesque',
    fontSize: '24px',
    lineHeight: '32px',
    [theme.breakpoints.down('sm')]: {
      fontSize: '20px',
      lineHeight: '26px',
    },
    [theme.breakpoints.down('xs')]: {
      fontSize: '18px',
      lineHeight: '21px',
    },
  },
  disclaimerKey: {
    fontSize: '12px',
    paddingLeft: theme.spacing(0.5),
    lineHeight: 0,
  },
}));

const Feature: FC<Props> = ({ title, disclaimerKey, Icon }) => {
  const classes = useStyles();
  const { classes: modeClasses } = useModeStyle();

  return (
    <Grid container className={classes.container}>
      <Grid item className={clsx(classes.iconContainer, modeClasses.backgroundDefault)}>
        <Icon fontSize="large" />
      </Grid>
      <Grid item className={classes.titleContainer}>
        <Typography className={clsx(classes.title, modeClasses.textPrimary)}>
          {title}
          {disclaimerKey && <sup className={classes.disclaimerKey}>{disclaimerKey}</sup>}
        </Typography>
      </Grid>
    </Grid>
  );
};

export default Feature;
