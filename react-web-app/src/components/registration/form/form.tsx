import { Button, Grid, makeStyles, Theme, Typography } from '@material-ui/core';
import Input, { PasswordInput } from 'components/input';
import { LandingPageContext } from 'components/landing-page';
import React, { FC, useContext, useMemo, useState } from 'react';
import { getCheckDuplicateEmail } from 'actions/email-verification';
import { CUSTOM_ERROR_CODES, errorToString, getErrorCode } from 'lib/error';
import { verifyUser } from 'actions/user';
import { EVENTS, trackEvent } from 'lib/analytics';
import { AnalyticsData } from 'typings/analytics';
import { useDispatch } from 'react-redux';
import { get } from 'lodash';
import { bindActionCreators } from 'redux';
import { useModeStyle } from 'lib/use-mode-style';
import clsx from 'clsx';
import { useIsMobile } from 'lib/hooks';
import { Mode } from 'lib/mode-context';
import Form from 'components/form';
import { Step } from '../registration-step';
import RegistrationContext, { RegistrationValues } from '../context';

interface Props {
  onChange: (newValues: RegistrationValues) => void;
  goToStep: (nextStep: Step) => void;
  buttonText?: string;
}

type StyleArg = {
  align: 'left' | 'center';
  mode: Mode;
};

const useStyles = makeStyles((theme: Theme) => ({
  titleContainer: {
    marginBottom: theme.spacing(4),
    [theme.breakpoints.up('sm')]: {
      marginBottom: theme.spacing(6),
    },
  },
  title: {
    fontSize: 76,
    textAlign: 'center',
    [theme.breakpoints.up('sm')]: {
      textAlign: ({ align }: StyleArg) => align,
    },
    [theme.breakpoints.down('lg')]: {
      fontSize: 62,
    },
    [theme.breakpoints.down('md')]: {
      fontSize: 56,
    },
    [theme.breakpoints.down('sm')]: {
      fontSize: 36,
      letterSpacing: '-1px',
    },
  },
  members: {
    color: theme.palette.secondary.main,
  },
  formContainer: {
    maxWidth: ({ align }: StyleArg) => (align === 'left' ? 900 : 700),
    [theme.breakpoints.down('sm')]: {
      maxWidth: 500,
    },
  },
  form: {
    width: '100%',
  },
  button: {
    marginTop: theme.spacing(2),
    '&:disabled': {
      backgroundColor: ({ mode }: StyleArg) => mode === 'dark' && theme.palette.grey['400'],
      color: ({ mode }: StyleArg) => mode === 'dark' && theme.palette.grey['300'],
    },
  },
  whiteButton: {
    backgroundColor: theme.palette.grey['50'],
    color: theme.palette.grey['500'],
    '&:disabled': {
      backgroundColor: ({ mode }: StyleArg) => mode === 'dark' && theme.palette.grey['400'],
      color: ({ mode }: StyleArg) => mode === 'dark' && theme.palette.grey['300'],
    },
  },
}));

type FieldName = 'firstName' | 'lastName' | 'email' | 'password' | 'phoneNumber';

const RegistrationForm: FC<Props> = ({ onChange, goToStep, buttonText = 'Join' }) => {
  const dispatch = useDispatch();
  const { mode, classes: modeClasses } = useModeStyle();
  const { align } = useContext(LandingPageContext);
  const classes = useStyles({ mode, align });
  const { variant } = useContext(LandingPageContext);
  const values = useContext(RegistrationContext);

  const isMobile = useIsMobile();

  const {
    getCheckDuplicateEmail: dispatchCheckDuplicateEmail,
    verifyUser: dispatchVerifyUser,
  } = bindActionCreators(
    {
      getCheckDuplicateEmail,
      verifyUser,
    },
    dispatch,
  );

  const [isLoading, setIsLoading] = useState(false);

  const [validity, setValidity] = useState<Record<FieldName, boolean>>({
    firstName: true,
    lastName: true,
    email: true,
    password: true,
    phoneNumber: true,
  });

  const baseErrorState = {
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phoneNumber: '',
  };

  const [errorMessages, setErrorMessages] = useState<Record<FieldName, string>>(baseErrorState);

  const updateFormValue = (name: FieldName, value: string, isValid: boolean) => {
    setErrorMessages(baseErrorState);
    onChange({
      ...values,
      [name]: value,
    });
    setValidity({
      ...validity,
      [name]: isValid,
    });
  };

  const isDisabled = useMemo(() => {
    return Object.values(validity).some((v) => !v) || Object.values(values).some((v) => !v);
  }, [validity, values]);

  const verifyEmail = async () => {
    try {
      await dispatchCheckDuplicateEmail(values.email);
    } catch (error) {
      throw errorToString(error, true);
    }
  };

  const verifyPhoneNumber = async () => {
    // verify phone number
    const { phoneNumber } = values;

    try {
      const status = await dispatchVerifyUser(phoneNumber);

      trackEvent(EVENTS.JOIN_DAVE_SUCCESS, status as AnalyticsData);

      setIsLoading(false);

      if ('isNewUser' in status && status.isNewUser) {
        goToStep('verification');
      } else {
        goToStep('existing_user');
      }
    } catch (error) {
      let errorString = errorToString(error, true);
      const errorCode = getErrorCode(error);

      trackEvent(EVENTS.JOIN_DAVE_FAILED, { errorString });

      if (errorCode === CUSTOM_ERROR_CODES.DELETED_ACCOUNT_TOO_SOON_ERROR) {
        errorString = `Sorry, but you’ve got to wait ${get(
          error,
          'response.data.data.daysRemaining',
        )} days before I can let you back in. It costs us money when you delete/rejoin.`;
      } else if (errorCode === CUSTOM_ERROR_CODES.MESSAGES_UNSUBSCRIBED_ERROR) {
        errorString =
          'Text notifications are disabled. Text “Start” to 964-19 to get the verification code.';
      }

      throw errorString;
    }
  };

  const onSubmit = async () => {
    setIsLoading(true);
    setErrorMessages(baseErrorState);

    try {
      await verifyEmail();
    } catch (err) {
      setErrorMessages({
        ...baseErrorState,
        email: err,
      });

      setIsLoading(false);

      return;
    }

    try {
      await verifyPhoneNumber();
    } catch (err) {
      setErrorMessages({
        ...baseErrorState,
        phoneNumber: err,
      });

      setIsLoading(false);
    }
  };

  const handleSubmit = () => {
    if (!isDisabled && !isLoading) {
      onSubmit();
    }
  };

  const nameHelperText = (name: string) => {
    if (name.length <= 1) {
      return 'Please provide at least two characters.';
    }
    return "Alphabetical characters, hyphens (-), apostrophes ('), and spaces ( ) only.";
  };

  return (
    <Grid container direction="column" alignItems="center">
      <Grid item className={classes.titleContainer}>
        <Typography variant="h1" className={clsx(classes.title, modeClasses.textPrimary)}>
          Join over <span className={classes.members}>10,000,000+</span> members
        </Typography>
      </Grid>

      <Grid container item direction="column" alignItems="center" className={classes.formContainer}>
        <Form className={classes.form} onSubmit={handleSubmit}>
          <Grid container justify="space-between" spacing={2}>
            <Grid item xs={6}>
              <Input
                errorHelperText={nameHelperText(values.firstName)}
                inputType="name"
                hasError={!validity.firstName || !!errorMessages.firstName}
                onChange={({ value, isValid }) => updateFormValue('firstName', value, isValid)}
                title="First name"
                value={values.firstName}
                size="large"
                variant={mode}
              />
            </Grid>
            <Grid item xs={6}>
              <Input
                errorHelperText={nameHelperText(values.lastName)}
                inputType="name"
                hasError={!validity.lastName || !!errorMessages.lastName}
                onChange={({ value, isValid }) => updateFormValue('lastName', value, isValid)}
                title="Last name"
                value={values.lastName}
                size="large"
                variant={mode}
              />
            </Grid>
          </Grid>
          <Input
            errorHelperText={errorMessages.email || 'Please provide a valid email address.'}
            hasError={!validity.email || !!errorMessages.email}
            inputType="email"
            onChange={({ value, isValid }) => updateFormValue('email', value, isValid)}
            title="Email address"
            value={values.email}
            size="large"
            variant={mode}
          />
          <PasswordInput
            onChange={({ value, isValid }) => updateFormValue('password', value, isValid)}
            value={values.password}
            size="large"
            variant={mode}
          />
          <Input
            errorHelperText={errorMessages.phoneNumber}
            hasError={!validity.phoneNumber || !!errorMessages.phoneNumber}
            maskType="phone"
            onChange={({ value, isValid }) => updateFormValue('phoneNumber', value, isValid)}
            title="Mobile number"
            value={values.phoneNumber}
            size="large"
            variant={mode}
          />
          <Button
            variant="contained"
            color="secondary"
            size={isMobile ? 'medium' : 'large'}
            fullWidth
            className={variant === 'promotion' ? classes.whiteButton : classes.button}
            disabled={isDisabled || isLoading}
            onClick={onSubmit}
          >
            {buttonText}
          </Button>
        </Form>
      </Grid>
    </Grid>
  );
};

export default RegistrationForm;
