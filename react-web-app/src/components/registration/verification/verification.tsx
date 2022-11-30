import React, { FunctionComponent, useContext, useState } from 'react';
import classNames from 'classnames';
import { bindActionCreators } from 'redux';

import { verifyCode, verifyUser, updateUserSettings } from 'actions/user';

import Form from 'components/form';
import Icon from 'components/icon';
import Input from 'components/input';

import * as Analytics from 'lib/analytics';
import { CUSTOM_ERROR_CODES, errorToString, getErrorCode } from 'lib/error';
import { getDigits } from 'lib/format';

import { Grid, makeStyles, Theme, Typography, Button as MuiButton } from '@material-ui/core';
import { useDispatch } from 'react-redux';
import { useModeStyle } from 'lib/use-mode-style';
import { Mode } from 'lib/mode-context';
import { useIsMobile } from 'lib/hooks';
import clsx from 'clsx';
import { LandingPageContext } from 'components/landing-page';
import VerificationCodeModal from './modal';
import { Step } from '../registration-step';
import RegistrationContext from '../context';
import SMSOptIn from './sms-opt-in';

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
    fontSize: 56,
    textAlign: 'center',
    [theme.breakpoints.up('sm')]: {
      textAlign: ({ align }: StyleArg) => align,
    },
    [theme.breakpoints.down('md')]: {
      fontSize: 36,
      letterSpacing: '-1px',
    },
  },
  inputContainer: {
    maxWidth: ({ align }: StyleArg) => (align === 'left' ? 900 : 700),
    marginTop: theme.spacing(2),
  },
  getHelpContainer: {
    marginTop: theme.spacing(2),
  },
  getHelp: {
    color: theme.palette.secondary.main,
    fontSize: '16px',
    fontWeight: 700,
  },
  button: {
    marginTop: theme.spacing(2),
    '&:disabled': {
      backgroundColor: ({ mode }: StyleArg) => mode === 'dark' && theme.palette.grey['400'],
      color: ({ mode }: StyleArg) => mode === 'dark' && theme.palette.grey['300'],
    },
  },
  resendWrapper: {
    marginTop: theme.spacing(2),
  },
  resendText: {
    marginLeft: theme.spacing(),
  },
}));

type Props = {
  goToStep: (nextStep: Step) => void;
};

const PhoneNumberVerification: FunctionComponent<Props> = ({ goToStep }) => {
  const dispatch = useDispatch();
  const { mode, classes: modeClasses } = useModeStyle();
  const { align } = useContext(LandingPageContext);
  const classes = useStyles({ mode, align });

  const { firstName, lastName, email, phoneNumber, password } = useContext(RegistrationContext);

  const isMobile = useIsMobile();

  const {
    verifyCode: dispatchVerifyCode,
    verifyUser: dispatchVerifyUser,
    updateUserSettings: dispatchUpdateUserSettings,
  } = bindActionCreators(
    {
      verifyCode,
      verifyUser,
      updateUserSettings,
    },
    dispatch,
  );

  const [verificationCode, setVerificationCode] = useState({
    value: '',
    isValid: false,
  });
  const [hasError, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [verificationCodeResent, setVerificationCodeResent] = useState(false);
  const [isSMSChecked, setIsSMSChecked] = useState(false);

  const toggleSMSCheckbox = () => setIsSMSChecked((prev) => !prev);

  const onEdit = () => {
    setShowModal(false);
    goToStep('form');
  };

  const onResend = async () => {
    try {
      Analytics.trackEvent(Analytics.EVENTS.PHONE_NUMBER_RESEND_VERIFICATION_CODE);
      await dispatchVerifyUser(phoneNumber);
      Analytics.trackEvent(Analytics.EVENTS.PHONE_NUMBER_RESEND_VERIFICATION_CODE_SUCCESS);
      setVerificationCodeResent(true);
      setShowModal(false);
      setVerificationCode({
        value: '',
        isValid: false,
      });
    } catch (error) {
      Analytics.trackEvent(Analytics.EVENTS.PHONE_NUMBER_RESEND_VERIFICATION_CODE_FAILED);
      setShowModal(false);
    }
  };

  const onClose = () => {
    setShowModal(false);
  };

  const onVerify = async () => {
    if (!verificationCode.isValid) return;

    try {
      setVerificationCodeResent(false);
      setError(false);

      Analytics.trackEvent(Analytics.EVENTS.PHONE_NUMBER_VERIFICATION_REQUESTED);
      const user = await dispatchVerifyCode({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email,
        password,
        phoneNumber,
        code: getDigits(verificationCode.value),
      });
      Analytics.setUser(user);
      Analytics.trackEvent(Analytics.EVENTS.PHONE_NUMBER_VERIFICATION_SUCCESS);
      Analytics.trackEvent(Analytics.EVENTS.EMAIL_AND_PASSWORD_CREATION_SUCCESS);

      if (isSMSChecked) {
        try {
          await dispatchUpdateUserSettings({
            sms_notifications_enabled: isSMSChecked,
          });
          Analytics.trackEvent(Analytics.EVENTS.NOTIFICATIONS_ENABLED, {
            notification_type: 'sms',
          });
        } catch (error) {
          // no-op if this fails -- should not prevent user from signing up
        }
      }

      goToStep('registration_success');
    } catch (error) {
      let errorString: string = errorToString(error, true);
      const errorCode: string = getErrorCode(error);

      if (errorCode === CUSTOM_ERROR_CODES.INVALID_VERIFICATION_CODE_ERROR) {
        errorString = 'That code is incorrect, try again.';
      }

      const reason = `${errorCode} ${errorString}`;
      Analytics.trackEvent(Analytics.EVENTS.PHONE_NUMBER_VERIFICATION_FAILED, { reason });
      Analytics.trackEvent(Analytics.EVENTS.EMAIL_AND_PASSWORD_CREATION_FAIL);

      setError(true);
      setErrorMessage(errorString);
    }
  };

  return (
    <Grid container direction="column" alignItems="center">
      <Grid item className={classes.titleContainer}>
        <Typography variant="h1" className={clsx(classes.title, modeClasses.textPrimary)}>
          Please verify your phone number
        </Typography>
      </Grid>
      <Grid
        container
        item
        className={classes.inputContainer}
        direction="column"
        alignItems="stretch"
      >
        <Form onSubmit={onVerify}>
          <Input
            errorHelperText={errorMessage}
            hasError={hasError}
            onChange={setVerificationCode}
            title="Enter code"
            maskType="verificationCode"
            value={verificationCode.value}
            variant={mode}
            size="large"
          />
        </Form>
        <MuiButton
          variant="contained"
          color="secondary"
          size={isMobile ? 'medium' : 'large'}
          fullWidth
          className={classes.button}
          disabled={!verificationCode.isValid}
          onClick={onVerify}
        >
          Verify
        </MuiButton>

        <Grid container item justify="center" className={classes.getHelpContainer}>
          <MuiButton
            variant="text"
            className={classes.getHelp}
            onClick={(event) => {
              event.preventDefault();
              setShowModal(true);
            }}
          >
            Get help
          </MuiButton>
        </Grid>
        {verificationCodeResent && (
          <Grid container item justify="center" className={classes.resendWrapper}>
            <Icon name="check" fill="green3" />
            <span className={classNames([classes.resendText, 'body-3', modeClasses.textPrimary])}>
              We sent you a new code
            </span>
          </Grid>
        )}
      </Grid>
      <SMSOptIn checked={isSMSChecked} onChange={toggleSMSCheckbox} />
      <VerificationCodeModal
        onClose={onClose}
        showModal={showModal}
        onEdit={onEdit}
        onResend={onResend}
        openEvent={Analytics.EVENTS.PHONE_NUMBER_VERIFICATION_HELP_MODAL_OPENED}
        closeEvent={Analytics.EVENTS.PHONE_NUMBER_VERIFICATION_HELP_MODAL_CLOSED}
      />
    </Grid>
  );
};

export default PhoneNumberVerification;
