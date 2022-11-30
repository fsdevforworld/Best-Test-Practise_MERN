import { Button, Grid, makeStyles, Theme, Typography } from '@material-ui/core';
import { useIsMobile } from 'lib/hooks';
import React, { FC } from 'react';
import { RainingMoneyLeft, RainingMoneyRight } from '../raining-money';
import Video from './video';

interface Props {
  onCTAClick: () => void;
}

const useStyles = makeStyles((theme: Theme) => {
  return {
    container: {
      position: 'relative',
      marginTop: -theme.spacing(10),
      paddingLeft: theme.spacing(30),
      paddingRight: theme.spacing(30),
      [theme.breakpoints.down('lg')]: {
        paddingLeft: theme.spacing(20),
        paddingRight: theme.spacing(20),
      },
      [theme.breakpoints.down('md')]: {
        marginTop: theme.spacing(5),
        paddingLeft: theme.spacing(12),
        paddingRight: theme.spacing(12),
      },
      [theme.breakpoints.down('sm')]: {
        paddingLeft: theme.spacing(8),
        paddingRight: theme.spacing(8),
      },
      [theme.breakpoints.down('xs')]: {
        marginTop: theme.spacing(12),
        paddingLeft: theme.spacing(4),
        paddingRight: theme.spacing(4),
      },
    },
    leftPanelContainer: {
      zIndex: 1,
      display: 'flex',
      flexBasis: 0,
      flexGrow: 1,
      maxWidth: 800,
      [theme.breakpoints.up('sm')]: {
        paddingRight: theme.spacing(10),
      },
    },
    titleContainer: {
      marginTop: theme.spacing(2),
      marginBottom: theme.spacing(2),
      [theme.breakpoints.down('xs')]: {
        marginTop: theme.spacing(8),
        marginBottom: theme.spacing(2),
      },
    },
    title: {
      color: theme.palette.grey['50'],
      fontSize: 70,
      [theme.breakpoints.down('sm')]: {
        fontSize: 50,
      },
      [theme.breakpoints.down('xs')]: {
        fontSize: 36,
        lineHeight: '40px',
        textAlign: 'center',
      },
    },
    subtitleContainer: {
      maxWidth: 800,
    },
    subtitle: {
      color: theme.palette.grey['200'],
      fontFamily: 'Basis Grotesque',
      fontWeight: 600,
      lineHeight: '36px',
      fontSize: '24px',
      textAlign: 'left',
      [theme.breakpoints.down('sm')]: {
        fontSize: '18px',
        lineHeight: '24px',
      },
      [theme.breakpoints.down('xs')]: {
        textAlign: 'center',
      },
    },
    prize: {
      color: theme.palette.secondary.main,
    },
    buttonContainer: {
      display: 'flex',
      marginTop: theme.spacing(6),
      [theme.breakpoints.down('sm')]: {
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
    videoContainer: {
      maxWidth: '500px',
    },
    mobileVideoContainer: {
      alignSelf: 'center',
    },
    disclaimerKey: {
      fontSize: '12px',
      paddingLeft: theme.spacing(0.5),
      lineHeight: 0,
    },
  };
});

const CelebrityPromotion: FC<Props> = ({ onCTAClick }) => {
  const classes = useStyles();

  const isMobile = useIsMobile();

  return (
    <Grid
      container
      className={classes.container}
      direction="row"
      alignItems="center"
      justify="center"
    >
      <RainingMoneyLeft />
      <RainingMoneyRight />
      <Grid
        item
        className={classes.leftPanelContainer}
        alignItems={isMobile ? 'stretch' : 'flex-start'}
        direction="column"
      >
        {isMobile && (
          <Grid container item className={classes.mobileVideoContainer} xs={8}>
            <Video />
          </Grid>
        )}
        <Grid item className={classes.titleContainer}>
          <Typography variant="h1" className={classes.title}>
            You read that right
          </Typography>
        </Grid>
        <Grid item className={classes.subtitleContainer}>
          <Typography className={classes.subtitle} variant="h3">
            Jason Derulo is celebrating the Dave giveaway of up to&nbsp;
            <span className={classes.prize}>$10 Million</span> to people who set up direct deposit
            into their Dave spending account before April 15, 2021.
            <sup className={classes.disclaimerKey}>1</sup>
          </Typography>
        </Grid>
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
      </Grid>
      {!isMobile && (
        <Grid item className={classes.videoContainer} xs={4}>
          <Video />
        </Grid>
      )}
    </Grid>
  );
};

export default CelebrityPromotion;
