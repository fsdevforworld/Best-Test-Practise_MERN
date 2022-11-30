import React, { FC, useRef } from 'react';
import {
  FeatureGrid,
  SignUp,
  Header,
  Hero,
  Footer,
  LandingPageContext,
} from 'components/landing-page';
import { makeStyles, Theme, Typography } from '@material-ui/core';
import InfluencerPromotion from 'components/landing-page/influencer-promotion';
import ModeContext from 'lib/mode-context';
import { useScrollToElement } from 'lib/hooks';

const useStyles = makeStyles((theme: Theme) => ({
  container: {
    backgroundColor: theme.palette.grey['700'],
  },
  title: {
    color: theme.palette.grey['50'],
    fontSize: '100px',
    fontWeight: 700,
    lineHeight: '100px',
    textAlign: 'center',
    [theme.breakpoints.down('md')]: {
      fontSize: '80px',
      lineHeight: '80px',
    },
    [theme.breakpoints.down('sm')]: {
      fontSize: '60px',
      lineHeight: '60px',
    },
    [theme.breakpoints.down('xs')]: {
      fontSize: '36px',
      lineHeight: '40px',
    },
  },
  buffer: {
    [theme.breakpoints.down('xs')]: {
      width: '100%',
      height: theme.spacing(7),
    },
  },
  bonus: {
    color: theme.palette.secondary.main,
  },
  footerContainer: {
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  disclaimerKey: {
    paddingLeft: theme.spacing(0.5),
    fontSize: '14px',
    lineHeight: '36px',
    verticalAlign: '45%',
    [theme.breakpoints.up('sm')]: {
      fontSize: '30px',
      lineHeight: 'unset',
      verticalAlign: '50%',
    },
  },
}));

const InfluencerLanding: FC = () => {
  const classes = useStyles();
  const scrollTo = useScrollToElement();

  const signUpRef = useRef<HTMLDivElement>(null);

  const scrollToSignUp = () => {
    if (signUpRef && signUpRef.current) {
      scrollTo(signUpRef.current);
    }
  };

  return (
    <div className={classes.container}>
      <ModeContext.Provider value="dark">
        <LandingPageContext.Provider value={{ variant: 'promotion', align: 'center' }}>
          <Header />
          <Hero variant="influencer" onCTAClick={scrollToSignUp}>
            <Typography className={classes.title}>
              Join the Dave community to get your <span className={classes.bonus}>$100</span> bonus
              <sup className={classes.disclaimerKey}>1</sup>
            </Typography>
          </Hero>
          <InfluencerPromotion onCTAClick={scrollToSignUp} />
          <FeatureGrid onCTAClick={scrollToSignUp} />
          <div className={classes.buffer} />
          <div ref={signUpRef}>
            <SignUp onStepChange={scrollToSignUp} />
          </div>
          <div className={classes.footerContainer}>
            <Footer />
          </div>
        </LandingPageContext.Provider>
      </ModeContext.Provider>
    </div>
  );
};

export default InfluencerLanding;
