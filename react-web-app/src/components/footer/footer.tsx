import React, { FC } from 'react';
import { Grid, Typography, makeStyles, Divider, Theme } from '@material-ui/core';

import { useModeStyle } from 'lib/use-mode-style';
import clsx from 'clsx';
import Links, { NavigationGroup } from './links';

interface Props {
  showLegal?: boolean;
  navigationGroups?: NavigationGroup[];
}

const useStyles = makeStyles((theme: Theme) => ({
  wrapper: {
    marginTop: theme.spacing(4),
  },
  container: {
    maxWidth: '1036px',
    [theme.breakpoints.between(992, 1199)]: {
      maxWidth: '933px',
    },
    [theme.breakpoints.between(768, 991)]: {
      maxWidth: '723px',
    },
    [theme.breakpoints.down(768)]: {
      maxWidth: '500px',
    },
  },
  divider: {
    margin: theme.spacing(0, 3),
  },
  legalVerbiageContainer: {
    padding: '14px 24px',
  },
  legalVerbiage: {
    color: '#aaa',
    fontFamily: 'Basis Grotesque',
    fontSize: '12px',
    lineHeight: '27px',
  },
  copyrightContainer: {
    margin: theme.spacing(4, 3, 8),
  },
}));

const Footer: FC<Props> = ({ showLegal = true, navigationGroups, children }) => {
  const classes = useStyles();
  const { classes: modeClasses } = useModeStyle();

  return (
    <Grid container justify="center" className={classes.wrapper}>
      <Grid container direction="column" className={classes.container}>
        {children}
        <Grid item>
          <Divider className={clsx(classes.divider, modeClasses.divider)} />
        </Grid>
        <Links navigationGroups={navigationGroups} />
        {showLegal && (
          <Grid item xs={12} className={classes.legalVerbiageContainer}>
            <Typography color="inherit" className={classes.legalVerbiage}>
              Banking services provided by Evolve Bank &#38; Trust, member FDIC. The Dave Debit
              Mastercard® is issued by Evolve Bank &#38; Trust, pursuant to a license from
              Mastercard International. Apple, the Apple logo, and iPhone are trademarks of Apple
              Inc., registered in the U.S. and other countries. App Store is a service mark of Apple
              Inc. Google, Android and Google Play are trademarks of Google Inc., registered in the
              U.S. and other countries.
            </Typography>
          </Grid>
        )}
        <Grid item className={classes.copyrightContainer}>
          <Typography color="inherit" className={classes.legalVerbiage}>
            &#169;2021 Dave, Inc.
          </Typography>
        </Grid>
      </Grid>
    </Grid>
  );
};

export default Footer;
