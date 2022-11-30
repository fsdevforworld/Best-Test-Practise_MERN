import React, { FC, ReactElement, useContext, useEffect, useState } from 'react';

import { EVENTS, trackEvent } from 'lib/analytics';
import LandingPageContext, { LandingPageVariant } from 'components/landing-page/context';
import { makeStyles } from '@material-ui/core';
import RegistrationForm from './form';
import Verification from './verification';
import { Step } from './registration-step';
import AppLink from './app-link';
import RegistrationContext, { RegistrationValues } from './context';

interface Props {
  onStepChange?: (step: Step) => void;
}

const useStyles = makeStyles({
  registrationStepContainer: {
    width: '100%',
    maxWidth: 900,
  },
});

const Registration: FC<Props> = ({
  onStepChange = () => {
    /**/
  },
}) => {
  const classes = useStyles();
  const { variant } = useContext(LandingPageContext);

  const [formValues, setFormValues] = useState<RegistrationValues>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phoneNumber: '',
  });

  const [step, setStep] = useState<Step>('form');

  useEffect(() => {
    const stepToEvent: Record<Step, string> = {
      form: EVENTS.PHONE_NUMBER_REGISTER_LOADED,
      verification: EVENTS.PHONE_NUMBER_VERIFY_LOADED,
      existing_user: EVENTS.WELCOME_BACK_LOADED,
      registration_success: EVENTS.SUCCESSFUL_REGISTRATION_LOADED,
    };

    trackEvent(stepToEvent[step]);
  }, [onStepChange, step]);

  const handleStepChange = (newStep: Step) => {
    onStepChange(newStep);
    setStep(newStep);
  };

  const buttonTitles: Record<LandingPageVariant, string> = {
    banking: 'Sign up for Dave Banking',
    promotion: 'Unlock my bonus',
    default: 'Join',
  };

  const steps: Record<Step, ReactElement> = {
    form: (
      <RegistrationForm
        onChange={setFormValues}
        goToStep={handleStepChange}
        buttonText={buttonTitles[variant]}
      />
    ),
    verification: <Verification goToStep={handleStepChange} />,
    existing_user: (
      <AppLink
        title="Welcome back!"
        subtitle="Looks like you're already a Dave member. Download the app to unlock your Dave
    membership benefits."
      />
    ),
    registration_success: (
      <AppLink
        title="Welcome!"
        subtitle={
          variant === 'promotion'
            ? 'Download the app and set up direct deposit to get your bonus.'
            : 'Download the app to get started.'
        }
      />
    ),
  };

  return (
    <RegistrationContext.Provider value={formValues}>
      <div className={classes.registrationStepContainer}>{steps[step]}</div>
    </RegistrationContext.Provider>
  );
};

export default Registration;
