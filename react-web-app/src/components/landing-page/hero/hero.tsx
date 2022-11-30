import { Button, Grid, makeStyles, Theme } from '@material-ui/core';
import React, { FC } from 'react';

import classnames from 'classnames';
import {
  InfluencerHeroLG,
  InfluencerHeroMD,
  InfluencerHeroSM,
  InfluencerHeroMobile,
  JasonHeroLG,
  JasonHeroMD,
  JasonHeroSM,
  JasonHeroMobile,
} from 'img/splash';
import { useIsMobile } from 'lib/hooks';

interface Props {
  variant: 'celebrity' | 'influencer';
  onCTAClick: () => void;
}

const useStyles = makeStyles((theme: Theme) => ({
  container: {
    paddingBottom: '12vw',
  },
  celebrityBackground: {
    background: `linear-gradient(180deg, rgba(27, 27, 27, 0) 0%, #1B1B1B 100%), url(${JasonHeroLG})`,
    backgroundBlendMode: 'normal',
    backgroundRepeat: 'no-repeat',
    backgroundSize: 'cover',
    backgroundPosition: 'center 15%',

    [theme.breakpoints.down('md')]: {
      background: `linear-gradient(180deg, rgba(27, 27, 27, 0) 0%, #1B1B1B 100%),  url(${JasonHeroMD})`,
      backgroundRepeat: 'no-repeat',
      backgroundSize: 'cover',
      backgroundPosition: 'center 15%',
    },
    [theme.breakpoints.down('sm')]: {
      background: `linear-gradient(180deg, rgba(27, 27, 27, 0) 0%, #1B1B1B 100%),  url(${JasonHeroSM})`,
      backgroundRepeat: 'no-repeat',
      backgroundSize: 'cover',
      backgroundPosition: 'center 15%',
    },
    // width of the mobile image
    [theme.breakpoints.down(475)]: {
      backgroundImage: `url(${JasonHeroMobile})`,
      backgroundSize: 'contain',
      backgroundPosition: 'center top',
    },
  },
  influencerBackground: {
    background: `linear-gradient(180deg, rgba(27, 27, 27, 0) 50%, #1B1B1B 100%),  url(${InfluencerHeroLG})`,
    backgroundBlendMode: 'normal',
    backgroundRepeat: 'no-repeat',
    backgroundSize: '140%',
    backgroundPosition: 'center 40%',
    [theme.breakpoints.down('md')]: {
      background: `linear-gradient(180deg, rgba(27, 27, 27, 0) 50%, #1B1B1B 100%),  url(${InfluencerHeroMD})`,
      backgroundRepeat: 'no-repeat',
      backgroundSize: '140%',
      backgroundPosition: 'center 50%',
    },
    [theme.breakpoints.down('sm')]: {
      background: `linear-gradient(180deg, rgba(27, 27, 27, 0) 50%, #1B1B1B 100%),  url(${InfluencerHeroSM})`,
      backgroundRepeat: 'no-repeat',
      backgroundSize: '140%',
      backgroundPosition: 'center 36%',
    },
    // width of the mobile image
    [theme.breakpoints.down(475)]: {
      backgroundImage: `url(${InfluencerHeroMobile})`,
      backgroundSize: 'contain',
      backgroundPosition: 'center top',
    },
  },
  contentContainer: {
    padding: theme.spacing(14),
    paddingBottom: theme.spacing(30),
    [theme.breakpoints.down('md')]: {
      padding: theme.spacing(8),
    },
    [theme.breakpoints.down('xs')]: {
      padding: theme.spacing(4),
    },
  },
  titleContainer: {
    maxWidth: '1200px',
    marginTop: '24vw',
    [theme.breakpoints.down('md')]: {
      marginTop: '35vw',
    },
    [theme.breakpoints.down(475)]: {
      marginTop: '60vw',
    },
  },
  buttonContainer: {
    display: 'flex',
    marginTop: theme.spacing(16),
    [theme.breakpoints.down(475)]: {
      margin: theme.spacing(10, 2, 0),
    },
  },
}));

const Hero: FC<Props> = ({ variant, onCTAClick, children }) => {
  const classes = useStyles();

  const isMobile = useIsMobile();

  return (
    <Grid
      container
      className={classnames(
        classes.container,
        variant === 'celebrity' ? classes.celebrityBackground : classes.influencerBackground,
      )}
      direction="column"
    >
      <Grid
        container
        item
        direction="column"
        className={classes.contentContainer}
        alignItems={isMobile ? 'stretch' : 'center'}
      >
        <Grid item className={classes.titleContainer}>
          {children}
        </Grid>
        <Grid item className={classes.buttonContainer}>
          <Button
            variant="contained"
            size={isMobile ? 'medium' : 'large'}
            fullWidth={isMobile}
            color="secondary"
            onClick={onCTAClick}
          >
            Unlock my bonus
          </Button>
        </Grid>
      </Grid>
    </Grid>
  );
};

export default Hero;
