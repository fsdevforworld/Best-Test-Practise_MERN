import { Grid, Link, makeStyles, Theme, Typography } from '@material-ui/core';
import React, { FC, useContext } from 'react';
import Urls from 'lib/urls';
import { useModeStyle } from 'lib/use-mode-style';
import clsx from 'clsx';
import { LandingPageContext } from 'components/landing-page';
import { LandingPageAlignment } from 'components/landing-page/context';
import { useIsMobile } from 'lib/hooks';

const useStyles = makeStyles((theme: Theme) => ({
  wrapper: {
    width: '100%',
    maxWidth: ({ align }: { align: LandingPageAlignment }) => (align === 'left' ? 900 : 650),
  },
  footerContainer: {
    marginTop: theme.spacing(5),
    textAlign: 'center',
    [theme.breakpoints.up('sm')]: {
      textAlign: ({ align }: { align: LandingPageAlignment }) => align,
    },
  },
  noSell: {
    fontWeight: 600,
  },
}));

const Disclaimer: FC = () => {
  const { align } = useContext(LandingPageContext);
  const classes = useStyles({ align });
  const { classes: modeClasses } = useModeStyle();

  const isMobile = useIsMobile();

  return (
    <Grid
      container
      justify={align === 'center' || isMobile ? 'center' : 'flex-start'}
      className={classes.wrapper}
    >
      <Grid container item className={clsx(classes.footerContainer, modeClasses.textSecondary)}>
        <Typography>
          <span className={classes.noSell}>
            We don&apos;t sell your data to any third parties.&nbsp;
          </span>
          By joining, I agree to Dave&apos;s&nbsp;
          <Link
            underline="always"
            href={Urls.PRIVACY_POLICY}
            target="_blank"
            className={modeClasses.textSecondary}
          >
            Privacy Policy
          </Link>
          ,&nbsp;
          <Link
            underline="always"
            href={Urls.TERMS_OF_SERVICE}
            target="_blank"
            className={modeClasses.textSecondary}
          >
            TOS
          </Link>
          ,&nbsp;
          <Link
            underline="always"
            href={Urls.PAYMENT_AUTHORIZATION}
            target="_blank"
            className={modeClasses.textSecondary}
          >
            Payment Authorization
          </Link>
          &nbsp;&amp;&nbsp;
          <Link
            underline="always"
            href={Urls.CONSENT_FOR_ELECTRONIC_DISCLOSURE}
            target="_blank"
            className={modeClasses.textSecondary}
          >
            Electronic Communication Consent
          </Link>
        </Typography>
      </Grid>
    </Grid>
  );
};

export default Disclaimer;
