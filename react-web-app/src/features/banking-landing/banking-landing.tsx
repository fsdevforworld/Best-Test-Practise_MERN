import { makeStyles, Theme } from '@material-ui/core';
import { FeatureGrid, Footer, Header, LandingPageContext, SignUp } from 'components/landing-page';
import { useScrollToElement } from 'lib/hooks';
import ModeContext from 'lib/mode-context';
import React, { FC, useRef } from 'react';
import Hero from './hero';

const useStyles = makeStyles((theme: Theme) => ({
  signUpContainer: {
    backgroundColor: '#FAFAFA',
  },
  buffer: {
    backgroundColor: '#FAFAFA',
    [theme.breakpoints.down('xs')]: {
      width: '100%',
      height: theme.spacing(7),
    },
  },
}));

const BankingLanding: FC = () => {
  const classes = useStyles();
  const scrollTo = useScrollToElement();
  const signUpRef = useRef<HTMLDivElement>(null);

  const scrollToSignUp = () => {
    if (signUpRef && signUpRef.current) {
      scrollTo(signUpRef.current);
    }
  };

  return (
    <div>
      <ModeContext.Provider value="light">
        <LandingPageContext.Provider value={{ variant: 'banking', align: 'center' }}>
          <Header />
          <Hero onCTAClick={scrollToSignUp} />
          <FeatureGrid showFooter={false} />
          <div className={classes.buffer} />
          <div className={classes.signUpContainer} ref={signUpRef}>
            <SignUp onStepChange={scrollToSignUp} />
          </div>
          <Footer />
        </LandingPageContext.Provider>
      </ModeContext.Provider>
    </div>
  );
};

export default BankingLanding;
