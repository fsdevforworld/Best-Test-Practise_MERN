import { Button, Grid, makeStyles, Theme, Typography } from '@material-ui/core';
import React, { FC, useContext } from 'react';
import { MoneyParachuteIcon, ShieldIcon } from 'img/icon';
import { CheckParachuteIcon, CreditScoreIcon } from 'img/icon/v2';
import { useModeStyle } from 'lib/use-mode-style';
import FooterLink from 'components/footer-link/footer-link';
import clsx from 'clsx';
import { useIsMobile } from 'lib/hooks';
import Feature from './feature';
import LandingPageContext from '../context';

interface Props {
  onCTAClick?: () => void;
  showFooter?: boolean;
}

const useStyles = makeStyles((theme: Theme) => ({
  container: {
    padding: theme.spacing(20, 0),
    paddingLeft: '7vw',
    paddingRight: '7vw',
    overflowX: 'hidden',
    [theme.breakpoints.down('sm')]: {
      paddingTop: theme.spacing(15),
      paddingBottom: theme.spacing(15),
    },
  },
  titleContainer: {
    marginBottom: theme.spacing(12),
    [theme.breakpoints.down('sm')]: {
      marginBottom: theme.spacing(8),
    },
  },
  title: {
    textAlign: 'center',
    fontSize: 48,
    [theme.breakpoints.down('sm')]: {
      fontSize: 36,
      lineHeight: '40px',
    },
  },
  featuresContainer: {
    maxWidth: '1200px',
  },
  buttonContainer: {
    marginTop: theme.spacing(10),
    marginBottom: theme.spacing(8),
    [theme.breakpoints.down('xs')]: {
      margin: theme.spacing(6, 2, 2),
    },
  },
  button: {
    backgroundColor: theme.palette.grey['50'],
    color: theme.palette.grey['500'],
    '&:hover': {
      backgroundColor: theme.palette.grey['300'],
      color: theme.palette.grey['700'],
    },
  },
  footerContainer: {
    textAlign: 'center',
    maxWidth: '800px',
  },
  footer: {
    color: theme.palette.grey['300'],
    fontSize: '14px',
  },
  link: {
    color: theme.palette.grey['200'],
    fontWeight: 700,
  },
}));

const FeatureGrid: FC<Props> = ({ onCTAClick, showFooter = true }) => {
  const classes = useStyles();
  const { classes: modeClasses } = useModeStyle();
  const { variant } = useContext(LandingPageContext);

  const isMobile = useIsMobile();

  return (
    <Grid
      container
      className={classes.container}
      direction="column"
      alignItems={isMobile ? 'stretch' : 'center'}
    >
      <Grid item className={classes.titleContainer}>
        <Typography variant="h1" className={clsx(classes.title, modeClasses.textPrimary)}>
          Unlock with direct deposit
        </Typography>
      </Grid>
      <Grid container item className={classes.featuresContainer} spacing={8} justify="center">
        <Grid item xs={isMobile ? 12 : 6}>
          <Feature
            title="Say goodbye to overdraft fees and in-network ATM fees"
            disclaimerKey={variant === 'promotion' ? 3 : 1}
            Icon={ShieldIcon}
          />
        </Grid>
        <Grid item xs={isMobile ? 12 : 6}>
          <Feature
            title="Enjoy up to $200 advances with no interest or credit check"
            disclaimerKey={variant === 'promotion' ? 4 : 2}
            Icon={MoneyParachuteIcon}
          />
        </Grid>
        <Grid item xs={isMobile ? 12 : 6}>
          <Feature
            title="Celebrate payday up to two days earlier"
            disclaimerKey={variant === 'promotion' ? 5 : 3}
            Icon={CheckParachuteIcon}
          />
        </Grid>
        <Grid item xs={isMobile ? 12 : 6}>
          <Feature
            title="Get help building your credit"
            disclaimerKey={variant === 'promotion' ? 6 : 4}
            Icon={CreditScoreIcon}
          />
        </Grid>
      </Grid>
      {onCTAClick && (
        <Grid item className={classes.buttonContainer}>
          <Button
            className={classes.button}
            fullWidth={isMobile}
            variant="contained"
            color="default"
            size={isMobile ? 'medium' : 'large'}
            onClick={onCTAClick}
          >
            Unlock my bonus
          </Button>
        </Grid>
      )}
      {showFooter && (
        <Grid item className={classes.footerContainer}>
          <Typography variant="body2" className={classes.footer}>
            Banking services provided by Evolve Bank &amp; Trust, member FDIC. The Dave Debit
            Mastercard® is issued by Evolve Bank &amp; Trust, pursuant to a license from Mastercard
            International. For a complete list of terms and fees for Dave Banking see the Deposit
            Account Agreement&nbsp;
            <FooterLink href="https://dave.com/deposit-agreement" className={classes.link}>
              https://dave.com/deposit-agreement
            </FooterLink>
            &nbsp;and for the Advance service see&nbsp;
            <FooterLink href="https://dave.com/terms" className={classes.link}>
              https://dave.com/terms
            </FooterLink>
            &nbsp;.
          </Typography>
        </Grid>
      )}
    </Grid>
  );
};

export default FeatureGrid;
