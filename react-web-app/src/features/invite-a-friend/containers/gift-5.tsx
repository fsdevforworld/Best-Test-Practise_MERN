import React, { FunctionComponent, useMemo } from 'react';
import { RouteComponentProps } from 'react-router-dom';
import { Grid, makeStyles, Theme, Typography } from '@material-ui/core';

import { useAnalytics, getVariant } from 'lib/analytics';
import AppStoreButtons from 'components/app-store-buttons';
import Colors from 'components/colors';

import Card from '../img/card.svg';
import SimpleLayout from '../components/SimpleLayout';
import EVENTS from '../events';
import { useInviteUrl } from '../hooks';

type BackgroundColor = 'green' | 'white';
type Props = {
  backgroundColor?: BackgroundColor;
} & RouteComponentProps;

const Gift5Screen: FunctionComponent<Props> = () => {
  const values: BackgroundColor[] = ['green', 'white'];
  const backgroundColor = getVariant('InviteBackground', values, [0.5, 0.5]);
  const inviteUrl = useInviteUrl();

  const analyticsData = useMemo(() => ({ backgroundColor }), [backgroundColor]);
  useAnalytics(EVENTS.RECIPIENT_LANDING_PAGE_VIEWED, analyticsData);

  const classes = useStyles({ backgroundColor });
  return (
    <SimpleLayout
      backgroundColor={backgroundColor}
      content={
        <Grid className={classes.content} direction="column" container>
          <img className={classes.cardLarge} src={Card} alt="Dave debit card" />
          <Grid item xs={9} className={classes.offerText}>
            <Typography variant="h2">Your $5 is already in your account</Typography>
          </Grid>
          <Grid item xs={9} sm={12}>
            <AppStoreButtons
              url={inviteUrl}
              backgroundColor={backgroundColor === 'green' ? 'black' : 'white'}
            />
          </Grid>
          <img className={classes.cardSmall} src={Card} alt="Dave debit card" />
        </Grid>
      }
      footer={
        <div className={classes.footerText}>
          <Typography variant="body1">
            Open a Dave spending account to redeem reward.{' '}
            <a
              className={classes.referralLink}
              target="_blank"
              rel="noopener noreferrer"
              href="https://dave.com/invite-a-friend/gift-5/terms"
            >
              Referral agreement.
            </a>
          </Typography>
        </div>
      }
    />
  );
};

const useStyles = makeStyles((theme: Theme) => {
  return {
    content: {
      position: 'relative',
      [theme.breakpoints.up('sm')]: {
        alignItems: 'center',
      },
    },
    cardSmall: {
      position: 'absolute',
      right: theme.spacing(-6.5),
      top: 0,
      [theme.breakpoints.up('sm')]: {
        display: 'none',
      },
    },
    cardLarge: {
      marginTop: theme.spacing(4.5),
      display: 'none',
      [theme.breakpoints.up('sm')]: {
        display: 'block',
      },
    },
    offerText: ({ backgroundColor }: { backgroundColor: BackgroundColor }) => ({
      marginBottom: theme.spacing(3),
      color: backgroundColor === 'green' ? Colors.white : Colors.black,
      [theme.breakpoints.up('sm')]: {
        textAlign: 'center',
        maxWidth: '424px',
        marginTop: theme.spacing(3),
        marginBottom: theme.spacing(4.5),
      },
    }),
    footerText: ({ backgroundColor }: { backgroundColor: BackgroundColor }) => ({
      color: backgroundColor === 'green' ? Colors.white : Colors.black,
      [theme.breakpoints.up('sm')]: {
        textAlign: 'center',
      },
    }),
    referralLink: ({ backgroundColor }: { backgroundColor: BackgroundColor }) => ({
      color: backgroundColor === 'green' ? Colors.white : Colors.black,
    }),
  };
});

export default Gift5Screen;
