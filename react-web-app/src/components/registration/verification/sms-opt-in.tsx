import React, { FunctionComponent } from 'react';

import Icon from 'components/icon';

import { Grid, makeStyles, Theme, Typography, Checkbox } from '@material-ui/core';
import { useModeStyle } from 'lib/use-mode-style';
import FooterLink from 'components/footer-link';

const useStyles = makeStyles((theme: Theme) => ({
  smsContainer: {
    maxWidth: 700,
    margin: theme.spacing(2, 0),
    [theme.breakpoints.down('xs')]: {
      width: 'unset',
      marginLeft: -theme.spacing(3),
    },
  },
  checkboxWrapper: {
    width: 'unset',
  },
  checkboxContainer: {
    height: 'fit-content',
  },
  checkbox: {
    color: ({ mode }: { mode: 'light' | 'dark' }) =>
      mode === 'light' ? theme.palette.grey[500] : theme.palette.grey[300],
  },
  smsDisclosureContainer: {
    flex: '1 1',
  },
  smsDisclosure: {
    color: theme.palette.grey['300'],
    fontSize: '14px',
    lineHeight: '17px',
  },
  callout: {
    height: theme.spacing(2),
  },
}));

type Props = {
  checked: boolean;
  onChange: () => void;
};

const SMSOptIn: FunctionComponent<Props> = ({ checked, onChange }) => {
  const { mode } = useModeStyle();
  const classes = useStyles({ mode });

  return (
    <Grid container item className={classes.smsContainer}>
      <Grid container className={classes.checkboxWrapper}>
        <Grid container item alignItems="center" className={classes.checkboxContainer}>
          <Icon
            styles={classes.callout}
            name="calloutArrow"
            fill={checked ? 'transparent' : 'banana3'}
          />
          <Checkbox checked={checked} onChange={onChange} className={classes.checkbox} />
        </Grid>
      </Grid>
      <Grid container item className={classes.smsDisclosureContainer}>
        <Typography variant="body1" className={classes.smsDisclosure}>
          I agree to receive updates, special offers and promotions via SMS at the number provided.
          Consent is not a condition to purchase. Message &amp; data rates may apply. Message
          frequency varies. Reply &apos;STOP&apos; to unsubscribe. View our
          <FooterLink href="/terms">&nbsp;Terms of Use&nbsp;</FooterLink>and
          <FooterLink href="/privacy">&nbsp;Privacy Policy&nbsp;</FooterLink>for details.
        </Typography>
      </Grid>
    </Grid>
  );
};

export default SMSOptIn;
