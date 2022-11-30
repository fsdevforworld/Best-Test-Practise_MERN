import React, { FunctionComponent, useState } from 'react';
import { useDispatch } from 'react-redux';
import { RouteComponentProps } from 'react-router-dom';
import { Box, makeStyles, Theme, useMediaQuery, useTheme } from '@material-ui/core';
import classNames from 'classnames';

import { setPassword } from 'actions/set-password';
import Button from 'components/button';
import Form from 'components/form';
import { PasswordInput, ConfirmPasswordInput } from 'components/input';
import styles from 'components/input/index.module.css';
import Navbar from 'components/navbar';
import { errorToString } from 'lib/error';

import { ErrorModal } from '../components/error-modal';
import { useUserEmail, useUserToken } from '../hooks';

const CreateNewPassword: FunctionComponent<RouteComponentProps> = ({ history }) => {
  const dispatch = useDispatch();
  const classes = useStyles();
  const userEmail = useUserEmail();
  const userToken = useUserToken();
  const theme = useTheme();
  const breakpoint = useMediaQuery(theme.breakpoints.up('md'));

  const [newPassword, setNewPassword] = useState({
    value: '',
    isValid: false,
  });
  const [confirmPassword, setConfirmPassword] = useState({
    value: '',
    isValid: false,
  });

  const [error, setError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const isValid = newPassword.isValid && confirmPassword.isValid && userEmail && userToken;

  const onSubmit = async () => {
    if (!isValid) return;

    try {
      await dispatch(setPassword(newPassword.value, userToken));
      history.push('/set-password/success');
    } catch (submitError) {
      const errorString: string = errorToString(submitError, true);
      setError(errorString);
      setIsVisible(true);
    }
  };

  const onClose = () => {
    setIsVisible(false);
  };

  return (
    <>
      <Navbar />
      <Box className={classes.box}>
        <div className={classes.container}>
          <h1 className={classNames([classes.header, breakpoint ? 'title-6' : 'title-3'])}>
            Set your new password
          </h1>
          <div className={styles.inputContainer}>
            <Form onSubmit={onSubmit}>
              <PasswordInput onChange={setNewPassword} value={newPassword.value} />
              <ConfirmPasswordInput
                onChange={setConfirmPassword}
                value={confirmPassword.value}
                comparisonValue={newPassword.value}
              />
            </Form>
            <Button disabled={!isValid} title="Submit" onClick={onSubmit} />
          </div>
        </div>
      </Box>
      <ErrorModal error={error} isVisible={isVisible} onClose={onClose} />
    </>
  );
};

export default CreateNewPassword;

const useStyles = makeStyles((theme: Theme) => {
  return {
    box: {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      flexWrap: 'nowrap',
      [theme.breakpoints.up('md')]: {
        height: '75vh',
      },
    },
    container: {
      maxWidth: '22rem',
      marginBottom: '1rem',
      padding: '1rem',
    },
    header: {
      marginTop: '2rem',
      marginBottom: '2rem',
      [theme.breakpoints.up('md')]: {
        textAlign: 'center',
      },
    },
  };
});
