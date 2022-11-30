import { Button, Grid, makeStyles, Theme, Typography } from '@material-ui/core';
import { useIsMobile } from 'lib/hooks';
import React, { FC } from 'react';
import { RainingMoneyLeft, RainingMoneyRight } from '../raining-money';

interface Props {
  onCTAClick: () => void;
}

const useStyles = makeStyles((theme: Theme) => ({
  container: {
    position: 'relative',
    marginTop: -theme.spacing(20),
    padding: theme.spacing(25, 3, 38),
    [theme.breakpoints.down('xs')]: {
      marginTop: theme.spacing(0),
      padding: theme.spacing(15, 3, 15),
    },
  },
  textContainer: {
    zIndex: 1,
    maxWidth: '750px',
    marginBottom: theme.spacing(6),
    padding: theme.spacing(3, 0),
    [theme.breakpoints.down('xs')]: {
      marginBottom: 0,
    },
  },
  text: {
    color: theme.palette.grey['200'],
    fontSize: '24px',
    fontWeight: 700,
    lineHeight: '34px',
    textAlign: 'center',
  },
  bonus: {
    color: theme.palette.secondary.main,
  },
  buttonContainer: {
    zIndex: 1,
    [theme.breakpoints.down('xs')]: {
      alignSelf: 'stretch',
      marginLeft: theme.spacing(2),
      marginRight: theme.spacing(2),
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
  disclaimerKey: {
    fontSize: '12px',
    paddingLeft: theme.spacing(0.5),
    lineHeight: 0,
    fontWeight: 400,
  },
}));

const InfluencerPromotion: FC<Props> = ({ onCTAClick }) => {
  const classes = useStyles();

  const isMobile = useIsMobile();

  return (
    <Grid container className={classes.container} direction="column" alignItems="center">
      <RainingMoneyLeft />
      <RainingMoneyRight />
      <Grid item className={classes.textContainer}>
        <Typography className={classes.text}>
          Dave is giving away up to <span className={classes.bonus}>$10 Million</span>
          <sup className={classes.disclaimerKey}>2</sup> to members who set up direct deposit into
          their Dave spending account by April 15, 2021.
          <sup className={classes.disclaimerKey}>1</sup>
        </Typography>
      </Grid>
      {!isMobile && (
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
    </Grid>
  );
};

export default InfluencerPromotion;
