import { Grid, makeStyles, Theme } from '@material-ui/core';
import { LandingPageContext } from 'components/landing-page';
import TwoColumnLayout from 'components/layout';
import Registration, { Disclaimer } from 'components/registration';
import { Step } from 'components/registration/registration-step';
import {
  RegistrationCompleteHero,
  RegistrationHero,
  RegistrationVerificationHero,
} from 'img/splash';
import React, { FC, useState } from 'react';

const useStyles = makeStyles((theme: Theme) => ({
  bodyWrapper: {
    paddingBottom: theme.spacing(4),
    // Match breakpoint of TwoColumnLayout
    [theme.breakpoints.up(768)]: {
      width: '40vw',
    },
  },
}));

const RegistrationLanding: FC = () => {
  const classes = useStyles();

  const [step, setStep] = useState<Step>('form');

  const images: Record<Step, string> = {
    form: RegistrationHero,
    verification: RegistrationVerificationHero,
    existing_user: RegistrationCompleteHero,
    registration_success: RegistrationCompleteHero,
  };

  return (
    <LandingPageContext.Provider value={{ variant: 'default', align: 'left' }}>
      <TwoColumnLayout
        title={null}
        body={
          <Grid container direction="column" alignItems="center" className={classes.bodyWrapper}>
            <Registration onStepChange={setStep} />
            <Disclaimer />
          </Grid>
        }
        backgroundImage={images[step]}
      />
    </LandingPageContext.Provider>
  );
};

export default RegistrationLanding;
