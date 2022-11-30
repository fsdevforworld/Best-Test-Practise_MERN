import { Button, Grid, makeStyles, Theme, Typography } from '@material-ui/core';
import { BankingHero, BankingHeroMobile } from 'img/splash';
import { useIsMobile } from 'lib/hooks';
import React, { FC } from 'react';

interface Props {
  onCTAClick: () => void;
}

const useStyles = makeStyles((theme: Theme) => ({
  container: {
    backgroundColor: '#CCE5EC',
  },
  backgroundImage: {
    flex: 0.45,
    backgroundImage: `url(${BankingHero})`,
    backgroundSize: 'contain',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'bottom right',
    [theme.breakpoints.down('xs')]: {
      marginTop: 'max(10vh, 75px)',
      height: '60vh',
      maxHeight: '400px',
      width: '100%',
      flex: 'unset',
      backgroundImage: `url(${BankingHeroMobile})`,
      backgroundPosition: 'bottom left',
    },
  },
  contentContainer: {
    position: 'relative',
    padding: theme.spacing(35, 8, 35, 8),
    flex: 0.55,
    [theme.breakpoints.down('lg')]: {
      paddingTop: '20vw',
      paddingBottom: '20vw',
    },
    [theme.breakpoints.down('md')]: {
      paddingTop: '10vw',
      paddingBottom: '10vw',
    },
    [theme.breakpoints.down('xs')]: {
      marginTop: -theme.spacing(4),
      padding: theme.spacing(0, 3, 3),
    },
  },
  titleContainer: {
    marginBottom: theme.spacing(2),
  },
  title: {
    fontSize: '74px',
    [theme.breakpoints.down('md')]: {
      fontSize: '56px',
    },
    [theme.breakpoints.down('sm')]: {
      fontSize: '36px',
    },
    [theme.breakpoints.down('xs')]: {
      textAlign: 'center',
    },
  },
  descriptionContainer: {
    maxWidth: '700px',
    marginBottom: theme.spacing(4),
  },
  description: {
    fontSize: '20px',
    [theme.breakpoints.down('sm')]: {
      fontSize: '16px',
    },
    [theme.breakpoints.down('xs')]: {
      textAlign: 'center',
    },
  },
  buttonContainer: {
    [theme.breakpoints.down('xs')]: {
      display: 'flex',
      alignSelf: 'stretch',
      marginLeft: theme.spacing(2),
      marginRight: theme.spacing(2),
    },
  },
  button: {
    backgroundColor: theme.palette.grey['50'],
    color: theme.palette.grey['500'],
    [theme.breakpoints.down('xs')]: {
      paddingLeft: '0px',
      paddingRight: '0px',
    },
  },
}));

const Hero: FC<Props> = ({ onCTAClick }) => {
  const classes = useStyles();

  const isMobile = useIsMobile();

  return (
    <Grid
      container
      className={classes.container}
      justify="flex-end"
      direction={isMobile ? 'column' : 'row'}
    >
      <div className={classes.backgroundImage} />
      <Grid
        container
        direction="column"
        className={classes.contentContainer}
        justify={isMobile ? 'center' : 'flex-start'}
      >
        <Grid item className={classes.titleContainer}>
          <Typography variant="h1" className={classes.title}>
            Banking for humans
          </Typography>
        </Grid>
        <Grid item className={classes.descriptionContainer}>
          <Typography variant="body1" className={classes.description}>
            Dave’s on a mission to help Americans build success on their own terms. So join today to
            wave goodbye to hidden fees, get help building your credit, and enjoy a little extra
            cash in your pocket.
          </Typography>
        </Grid>
        <Grid item className={classes.buttonContainer}>
          <Button
            fullWidth={isMobile}
            variant="contained"
            size={isMobile ? 'medium' : 'large'}
            className={classes.button}
            onClick={onCTAClick}
          >
            Sign up for Dave Banking
          </Button>
        </Grid>
      </Grid>
    </Grid>
  );
};

export default Hero;
