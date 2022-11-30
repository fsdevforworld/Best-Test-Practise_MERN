import { Grid, Typography, makeStyles } from '@material-ui/core';
import React, { FunctionComponent } from 'react';

import TermsLayout from '../components/TermsLayout';

const useStyles = makeStyles({
  header: {
    marginTop: '1em',
    marginBottom: '0.5em',
  },
  paragraph: {
    marginBottom: '1em',
  },
});

const Get5Give5TermsScreen: FunctionComponent = () => {
  const styles = useStyles();

  return (
    <TermsLayout
      content={
        <Grid item xs={11} sm={10} md={7} lg={5}>
          <Typography variant="h3" className={styles.header}>
            “Gift 5 referrals $5.” Offer terms
          </Typography>

          <Typography variant="h4" className={styles.header}>
            Referred User
          </Typography>
          <Typography variant="body1" className={styles.paragraph}>
            In order to receive the $5 referral reward, the following conditions must be met: You
            must not have previously opened a Dave Spending Account (“Account”); you must have
            received an invitation from an existing Dave member to Join Dave and redeem the reward,
            and you must open the new account using the referring Dave member’s unique referral
            link.
          </Typography>
          <Typography variant="body1" className={styles.paragraph}>
            The reward will be paid to you within 24 hours after you open a new Account. Dave
            reserves the right to cancel or modify the terms of the referral reward offer or
            terminate your eligibility at any time with or without prior notice.
          </Typography>

          <Typography variant="h4" className={styles.header}>
            Referring User
          </Typography>
          <Typography variant="body1" className={styles.paragraph}>
            To qualify for the referral bonus of $5 for the maximum combined total of $25 for this
            promotion, all of the following conditions must be satisfied.
          </Typography>
          <Typography variant="body1" className={styles.paragraph}>
            The person you are referring to open an account must not have previously opened a Dave
            Spending Account (“Account”); they must have received an invitation from you, a Dave
            Member to Join Dave and redeem the reward, and they must open the new account using your
            Dave member’s unique referral link.
          </Typography>
          <Typography variant="body1" className={styles.paragraph}>
            The reward will be paid to you within 24 hours after the person you referred opens a new
            Account. Dave reserves the right to cancel or modify the terms of the referral reward
            offer or terminate your eligibility at any time with or without prior notice.
          </Typography>
          <br />
          <Typography variant="body1" className={styles.paragraph}>
            Banking services provided by Evolve Bank & Trust, member FDIC. The Dave Debit Mastercard
            <sup>
              <small>&reg;</small>
            </sup>
            &nbsp;is issued by Evolve Bank & Trust, pursuant to a license from Mastercard
            International.
          </Typography>
        </Grid>
      }
    />
  );
};

export default Get5Give5TermsScreen;
