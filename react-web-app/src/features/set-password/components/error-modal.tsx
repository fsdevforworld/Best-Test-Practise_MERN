import React, { FunctionComponent } from 'react';
import { makeStyles } from '@material-ui/core';

import classNames from 'classnames';

import Modal from 'components/modal';

import { RedAlert } from 'img/icon';

type ErrorModalProps = {
  error: string | null;
  onClose: () => void;
  isVisible: boolean;
};

export const ErrorModal: FunctionComponent<ErrorModalProps> = ({ error, onClose, isVisible }) => {
  const classes = useStyles();

  return (
    <Modal showModal={isVisible} onClose={onClose}>
      <>
        <RedAlert />
        <h1 className={classNames([classes.errorTitle, 'title-3'])}>Oops, something happened</h1>
        <p className={classNames([classes.errorBody, 'body-4'])}> {error} </p>
      </>
    </Modal>
  );
};

const useStyles = makeStyles(() => {
  return {
    errorImage: {
      marginTop: '64px',
    },
    errorTitle: {
      marginTop: '24px',
    },
    errorBody: {
      maxWidth: '320px',
    },
  };
});
