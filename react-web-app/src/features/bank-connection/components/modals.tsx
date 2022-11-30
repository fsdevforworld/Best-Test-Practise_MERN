import React, { FunctionComponent, useMemo, useEffect, useState } from 'react';
import classNames from 'classnames';
import { RouteComponentProps, withRouter } from 'react-router-dom';

import { CUSTOM_ERROR_CODES } from 'lib/error';
import { EVENTS } from 'lib/analytics';
import { usePrevious } from 'lib/hooks';

import AppStoreButtons from 'components/app-store-buttons';
import Button from 'components/button';
import CarouselModal from 'components/carousel-modal';
import Modal, { ModalProps } from 'components/modal';
import Icon from 'components/icon';
import ProgressBar from 'components/progress-bar';

import {
  BankConnecting1,
  BankConnecting2,
  BankConnecting3,
  BankConnecting4,
  Bills,
  Download,
  HelpDesk,
  Paycheck,
  Security,
  Sherlock,
  UnsupportedAccount,
} from 'img/modals';

import styles from './modals.module.css';

export { default as PlaidModal } from './plaid-modal';

type BankConnectingProps = {
  step: number;
} & ModalProps;

export const BankConnectingModal: FunctionComponent<BankConnectingProps> = ({
  step,
  ...modalProps
}) => {
  const lookup = [
    {
      key: 'account',
      image: BankConnecting1,
      header: 'Just a minute please...',
      text: 'Securely connecting to account',
    },
    {
      key: 'transactions',
      image: BankConnecting2,
      header: 'Just a minute please...',
      text: 'Analyzing transaction data',
    },
    {
      key: 'paychecks',
      image: BankConnecting3,
      header: 'Just a minute please...',
      text: 'Identifying income',
    },
    {
      key: 'connected',
      image: BankConnecting4,
      header: 'Connected!',
    },
  ];
  const ModalImage = lookup[step].image;
  const { header } = lookup[step];
  const progress = (step + 1) / lookup.length;

  return (
    <Modal
      openEvent={EVENTS.ONBOARDING_MODAL_OPENED}
      closeEvent={EVENTS.ONBOARDING_MODAL_CLOSED}
      canDismiss={false}
      {...modalProps}
    >
      <>
        <ProgressBar progress={progress} className={styles.progressBar} />
        <ModalImage />
        <p className={classNames([styles.header, 'title-3'])}>{header}</p>
        {lookup
          .filter((item) => item.text)
          .map((item, idx) => (
            <div key={item.key} className={styles.stepWrapper}>
              <Icon styles={styles.icon} name="check" fill={step > idx ? 'green3' : 'gray2'} />
              <span className={classNames([styles.stepText, 'body-4 text-black'])}>
                {item.text}
              </span>
            </div>
          ))}
      </>
    </Modal>
  );
};

const lookup = {
  [CUSTOM_ERROR_CODES.BANK_CONNECTION_PLAID_ERROR]: {
    body:
      'The service we use to connect to your bank (Plaid.com) is down right now. We are working with them on a fix, please try connecting your bank again later.',
    bottomButton: 'Try again later',
    dave: <HelpDesk />,
    title: 'Our partner service is down',
    openEvent: EVENTS.PLAID_DOWN_MODAL_OPENED,
    closeEvent: EVENTS.PLAID_DOWN_MODAL_CLOSED,
    reconnect: false,
  },
  [CUSTOM_ERROR_CODES.CONFLICT_ERROR_STATUS_CODE]: {
    body:
      'The account you just tried to connect is already being used. I can’t support joint accounts.',
    bottomButton: 'Connect your bank',
    dave: <Sherlock />,
    title: 'We got this account covered',
    openEvent: EVENTS.BANK_CONNECT_ALREADY_CONNECTED_MODAL_OPENED,
    closeEvent: EVENTS.BANK_CONNECT_ALREADY_CONNECTED_MODAL_CLOSED,
    reconnect: true,
  },
  [CUSTOM_ERROR_CODES.UNSUPPORTED_PLAID_ITEM_ERROR_STATUS_CODE]: {
    body:
      'That account only has a savings account or credit card. I only support checking accounts.',
    bottomButton: 'Connect your bank',
    dave: <UnsupportedAccount />,
    title: 'I can’t detect a checking account',
    openEvent: EVENTS.BANK_CONNECT_NOT_SUPPORTED_MODAL_OPENED,
    closeEvent: EVENTS.BANK_CONNECT_NOT_SUPPORTED_MODAL_CLOSED,
    reconnect: true,
  },
  [CUSTOM_ERROR_CODES.MICRODEPOSIT_REQUIRED_ERROR_CODE]: {
    body: 'To continue, please download the Dave app below.',
    bottomButton: <AppStoreButtons />,
    dave: <Download />,
    title: 'Download our app to proceed',
    openEvent: EVENTS.BANK_CONNECT_MICRODEPOSIT_REQUIRED_MODAL_OPENED,
    closeEvent: EVENTS.BANK_CONNECT_MICRODEPOSIT_REQUIRED_MODAL_CLOSED,
    reconnect: false,
    redirect: '/register',
  },
  [CUSTOM_ERROR_CODES.DEFAULT_ERROR]: {
    body:
      'I’m having trouble connecting to your bank. Can you check back in an hour while I work on this for you?',
    bottomButton: 'Try again later',
    dave: <HelpDesk />,
    title: 'Something went wrong :(',
    openEvent: EVENTS.BANK_CONNECT_DEFAULT_ERROR_MODAL_OPENED,
    closeEvent: EVENTS.BANK_CONNECT_DEFAULT_ERROR_MODAL_CLOSED,
    reconnect: false,
  },
};

type ErrorConnectingModalProps = {
  onReconnect: () => void;
  error: string | null;
  onClose: () => void;
} & RouteComponentProps;
const ErrorConnecting: FunctionComponent<ErrorConnectingModalProps> = ({
  error,
  history,
  onReconnect,
  onClose,
}) => {
  const getModal = (index: string | null) => {
    if (index && index in lookup) {
      return lookup[index];
    }
    return lookup[CUSTOM_ERROR_CODES.DEFAULT_ERROR];
  };
  const prevError = usePrevious(error);
  const [showModal, setShowModal] = useState<boolean>(Boolean(error));

  /**
   * allow modal analytics to trigger before removing modal reference
   */
  const errorCode = useMemo(() => {
    if (prevError && !error) {
      setShowModal(false);
      return prevError;
    }
    return error;
  }, [error, prevError]);
  useEffect(() => {
    if (error) {
      setShowModal(true);
    }
  }, [error]);

  const { body, bottomButton, dave, title, openEvent, closeEvent, reconnect, redirect } = getModal(
    errorCode,
  );

  const handleClose = () => {
    onClose();

    if (redirect) {
      history.push(redirect);
    }
  };

  const buttonClick = reconnect ? onReconnect : onClose;

  const button =
    typeof bottomButton === 'string' ? (
      <Button title={bottomButton} onClick={buttonClick} />
    ) : (
      bottomButton
    );

  return (
    <Modal
      openEvent={openEvent}
      closeEvent={closeEvent}
      showModal={showModal}
      onClose={handleClose}
    >
      <>
        <div className={styles.errorImage}>{dave}</div>
        <h1 className={classNames([styles.errorTitle, 'title-3'])}>{title}</h1>
        <p className={classNames([styles.errorBody, 'body-4'])}> {body} </p>
        <div className={classNames([styles.errorButtonContainer, 'col-12'])}>{button}</div>
      </>
    </Modal>
  );
};

export const ErrorConnectingModal = withRouter(ErrorConnecting);

type WhyConnectModalProps = {
  onClose: () => void;
  showModal: boolean;
};

const elements = [
  {
    image: <Paycheck />,
    title: 'Reliable income source',
    body:
      'I need to see that you have a reliable paycheck coming to your bank account so I know you can pay me back.',
  },
  {
    image: <Bills />,
    title: 'Pay other bills first',
    body:
      'I’ll check if you have money after your last payday to pay me back after your other expenses.',
  },
  {
    image: <Security />,
    title: 'Best-in-class security',
    body:
      'Dave uses the same 2048-bit encryption that big banks use. Your sensitive data (like your SSN) is encrypted and read-only.',
  },
];

export const WhyConnectModal: FunctionComponent<WhyConnectModalProps> = ({
  onClose,
  showModal,
}) => {
  return (
    <CarouselModal
      elements={elements}
      showModal={showModal}
      onClose={onClose}
      openEvent={EVENTS.PLAID_WHY_CONNECT_MODAL_OPENED}
      closeEvent={EVENTS.PLAID_WHY_CONNECT_MODAL_CLOSED}
      slideChangedEvent={EVENTS.PLAID_WHY_CONNECT_MODAL_SLIDE_CHANGED}
    />
  );
};
