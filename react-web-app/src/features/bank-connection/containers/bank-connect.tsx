import React, { FunctionComponent, useState } from 'react';
import classNames from 'classnames';
import { RouteComponentProps } from 'react-router-dom';
import { bindActionCreators, Dispatch } from 'redux';
import { connect } from 'react-redux';
import { RootAction } from 'typings/redux';
import { PlaidSuccessMetadata } from 'typings/plaid';

import {
  detectPaychecks as detectPaychecksAction,
  submitRecurringIncome as submitRecurringIncomeAction,
} from 'actions/transactions';
import { advanceTerms as advanceTermsAction } from 'actions/advances';
import { bankConnect as bankConnectAction } from 'actions/bank-connection';
import { getConfig as getConfigAction } from 'actions/config';
import { submitOnboardingStep as submitOnboardingStepAction } from 'actions/onboarding';
import { setPromoCode as setPromoCodeAction } from 'actions/user';

import { CUSTOM_ERROR_CODES, getErrorCode, getErrorStatus } from 'lib/error';
import { EVENTS, useAnalytics } from 'lib/analytics';

import Button from 'components/button';
import Icon from 'components/icon';
import TwoColumnLayout from 'components/layout';
import {
  BankConnectingModal,
  ErrorConnectingModal,
  PlaidModal,
  WhyConnectModal,
} from 'features/bank-connection/components/modals';

import { BankConnect as BankConnectBg } from 'img/daveWithBg';
import styles from './bank-connect.module.css';
import { completeOnboardingSteps } from '../helpers';

const mapDispatchToProps = (dispatch: Dispatch<RootAction>) =>
  bindActionCreators(
    {
      detectPaychecks: detectPaychecksAction,
      advanceTerms: advanceTermsAction,
      submitRecurringIncome: submitRecurringIncomeAction,
      bankConnect: bankConnectAction,
      getConfig: getConfigAction,
      submitOnboardingStep: submitOnboardingStepAction,
      setPromoCode: setPromoCodeAction,
    },
    dispatch,
  );

type Props = ReturnType<typeof mapDispatchToProps> & RouteComponentProps;

const BankConnect: FunctionComponent<Props> = ({
  bankConnect,
  getConfig,
  detectPaychecks,
  submitRecurringIncome,
  advanceTerms,
  submitOnboardingStep,
  history,
  location,
  setPromoCode,
}) => {
  const [showPlaid, setShowPlaid] = useState(false);

  const [showConnectingModal, setShowConnectingModal] = useState(false);
  const [showWhyModal, setShowWhyModal] = useState(false);
  const [errorModal, setErrorModal] = useState<null | string>(null);
  const [currentStep, setCurrentStep] = useState(0);

  // page load analytics
  useAnalytics(EVENTS.CONNECT_YOUR_BANK_LOADED);

  const onSuccess = async (plaidToken: string, metadata: PlaidSuccessMetadata) => {
    setShowPlaid(false);
    setShowConnectingModal(true);
    try {
      const steps = completeOnboardingSteps({
        institutionName: metadata.institution.name,
        institutionId: metadata.institution.institution_id,
        plaidToken,
        bankConnect,
        detectPaychecks,
        submitRecurringIncome,
        advanceTerms,
        submitOnboardingStep,
      });
      for await (const current of steps) {
        const { step, done, isApproved } = current;
        setCurrentStep(step);
        if (done) {
          // @ts-ignore
          const { promoCode } = location.state;

          if (promoCode) {
            try {
              await setPromoCode(promoCode);
            } catch (error) {
              // don't prevent user from continuing
            }
          }
          history.push('/register/advance-qualify', { isApproved });
        }
      }
    } catch (error) {
      setShowConnectingModal(false);
      const errorCode =
        getErrorCode(error) || getErrorStatus(error) || CUSTOM_ERROR_CODES.DEFAULT_ERROR;
      setErrorModal(errorCode);
    }
  };

  const onEvent = () => {
    setShowConnectingModal(false);
  };

  const closePlaid = () => {
    setShowPlaid(false);
  };

  const openPlaid = async () => {
    const config = await getConfig();
    if (config.PLAID_DOWN) {
      setErrorModal(CUSTOM_ERROR_CODES.BANK_CONNECTION_PLAID_ERROR);
    } else {
      setShowPlaid(true);
    }
  };

  const onReconnect = () => {
    setErrorModal(null);
    openPlaid();
  };

  return (
    <TwoColumnLayout
      title={<span className="title-6 text-black col-12 col-lg-10">Connect your bank</span>}
      body={
        <>
          <span className="body-4 text-black col-12 col-lg-10">
            Connect your bank account to see if you qualify for an advance. I look at your
            transactions to find income and if you&apos;d have enough to pay me back.
          </span>
          <div className={styles.inputContainer}>
            <div className="col-12 col-lg-10">
              <Button title="Connect bank" onClick={openPlaid} />
            </div>
          </div>
          <div className={styles.security}>
            <Icon name="lock" fill="gray3" />
            <span className={classNames([styles.securityText, 'body-1 text-gray4'])}>
              Dave uses 2048-bit encryption. Your sensitive data is encrypted and read-only.
            </span>
          </div>
          <p className="link" onClick={() => setShowWhyModal(true)}>
            Why do you need my bank?
          </p>
          <BankConnectingModal
            showModal={showConnectingModal}
            onClose={() => {
              setShowConnectingModal(false);
            }}
            step={currentStep}
          />
          <ErrorConnectingModal
            error={errorModal}
            onClose={() => setErrorModal(null)}
            onReconnect={onReconnect}
          />
          <WhyConnectModal onClose={() => setShowWhyModal(false)} showModal={showWhyModal} />
          {showPlaid && <PlaidModal onSuccess={onSuccess} onEvent={onEvent} onExit={closePlaid} />}
        </>
      }
      backgroundImage={BankConnectBg}
    />
  );
};

export default connect(null, mapDispatchToProps)(BankConnect);
