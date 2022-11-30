import { Grid, makeStyles, Theme, Typography } from '@material-ui/core';
import React, { FC, useContext } from 'react';
import FooterLink from 'components/footer-link/footer-link';
import LandingPageContext from '../context';

const useStyles = makeStyles((theme: Theme) => ({
  disclaimerContainer: {
    margin: theme.spacing(3, 3, 4),
  },
  disclaimer: {
    color: theme.palette.grey['300'],
    fontWeight: 400,
    fontSize: '14px',
    lineHeight: '20px',
    marginLeft: '5px',
  },
  listContainer: {
    paddingInlineStart: '15px',
  },
  listItems: {
    '&::marker': {
      color: theme.palette.grey['300'],
      fontSize: '14px',
    },
  },
  disclaimerSection: {
    marginTop: theme.spacing(2),
  },
  link: {
    color: theme.palette.grey['200'],
    fontWeight: 700,
  },
}));

const Disclaimers: FC = () => {
  const classes = useStyles();
  const { variant } = useContext(LandingPageContext);

  const promotionDisclaimers: JSX.Element[] = [
    <>
      To qualify, members must have or set up an active Dave spending account, in good standing.
      Members must click the &quot;Jason Derulo Direct Deposit&quot; promotion banner in the Dave
      app and sign up for direct deposit by April 15, 2021. Members must have at least two
      qualifying direct deposits within a month that total at least $1,000 (combined) credited to
      their Dave spending account by May 31, 2021. The $100 bonus will be added to member&apos;s
      Dave spending account within five days of meeting the two qualifying direct deposit
      requirements.
    </>,
  ];

  const defaultDisclaimers: JSX.Element[] = [
    <>
      The amount given away is dependent upon the number of Dave Banking accounts opened for the
      maximum of $10M, $100 bonus per account.
    </>,
    <>No ATM fees within Dave&apos;s network of 32,000+ ATMs.</>,
    <>
      Available after at least two qualifying direct deposits that total at least $1000 in a month
      (combined). Other eligibility criteria applies,&nbsp;
      <FooterLink href="https://dave.com/terms" className={classes.link}>
        see terms
      </FooterLink>
      &nbsp;for more details.
    </>,
    <>
      Early access to direct deposit funds depends on timing and availability of the payroll files
      sent from your employer. These funds can be made available up to 2 days in advance.
    </>,
    <>
      After two qualifying direct deposits that total at least $1000 in a month (combined). Other
      eligibility requirements apply. Free one-year subscription to LevelCredit. Enrollment
      required.
    </>,
  ];

  let disclaimers: JSX.Element[] = [];

  if (variant === 'promotion') {
    disclaimers = disclaimers.concat(promotionDisclaimers);
  }

  disclaimers = disclaimers.concat(defaultDisclaimers);

  return (
    <Grid item className={classes.disclaimerContainer}>
      <ol className={classes.listContainer}>
        {disclaimers.map((disclaimer) => {
          return (
            <li className={classes.listItems}>
              <Typography className={classes.disclaimer}>{disclaimer}</Typography>
            </li>
          );
        })}
      </ol>
    </Grid>
  );
};

export default Disclaimers;
