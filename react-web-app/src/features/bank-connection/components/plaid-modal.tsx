import React, { FunctionComponent, useCallback, useEffect, useState } from 'react';
// @ts-ignore
import Script from 'react-load-script';
import { PlaidEventMetadata, PlaidExitMetadata, PlaidSuccessMetadata } from 'typings/plaid';

import { Config } from 'lib/config';
import { EVENTS, setUserProperties, trackEvent } from 'lib/analytics';

type PlaidModalProps = {
  // A function that is called during a user's flow in Link.
  // See https://plaid.com/docs/#onevent-callback
  onEvent: (eventname: string, metadata: PlaidEventMetadata) => void;

  // A function that is called when a user has specifically exited Link flow
  onExit: (error: object, metadata: PlaidExitMetadata) => void;

  // A function that is called when the Link module has finished loading.
  // Calls to plaidLinkHandler.open() prior to the onLoad callback will be
  // delayed until the module is fully loaded.
  onLoad?: () => void;

  // A function that is called when a user has successfully onboarded their
  // account. The function should expect two arguments, the public_key and a
  // metadata object
  onSuccess: (token: string, metadata: PlaidSuccessMetadata) => void;
};

const PlaidModal: FunctionComponent<PlaidModalProps> = ({ onExit, onEvent, onLoad, onSuccess }) => {
  const [userClosedPlaid, setUserClosedPlaid] = useState(false);
  const [institutionSearchQuery, setInstitutionSearchQuery] = useState('');
  const [institutionId, setInstitutionId] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [hasSubmittedCredentials, setHasSubmittedCredentials] = useState(false);

  useEffect(() => {
    trackEvent(EVENTS.PLAID_OPENED);
  }, []);

  // plaid closed analytics
  useEffect(() => {
    if (userClosedPlaid) {
      trackEvent(EVENTS.PLAID_CLOSED, {
        institutionSearchQuery,
        institutionId,
        institutionName,
        hasSubmittedCredentials,
      });
      setUserClosedPlaid(false);
    }
  }, [
    userClosedPlaid,
    institutionSearchQuery,
    institutionId,
    institutionName,
    hasSubmittedCredentials,
  ]);

  const onPlaidEvent = useCallback(
    (eventname: string, metadata: PlaidEventMetadata) => {
      if (eventname === 'SEARCH_INSTITUTION') {
        setInstitutionSearchQuery(metadata.institution_search_query);
        setUserProperties({ bank_name: metadata.institution_name });
      }

      if (eventname === 'SELECT_INSTITUTION') {
        setInstitutionId(metadata.institution_id);
        setInstitutionName(metadata.institution_name);
        trackEvent(EVENTS.PLAID_BANK_SELECTED, {
          bank_name: metadata.institution_name,
          update_mode: false, // TODO this needs updated POST MVP, see mobile app
        });
      }

      if (eventname === 'SUBMIT_CREDENTIALS') {
        setHasSubmittedCredentials(true);
        trackEvent(EVENTS.PLAID_CREDENTIALS_SUBMITTED, {
          bank_name: metadata.institution_name,
        });
      }

      if (eventname === 'ERROR') {
        trackEvent(EVENTS.PLAID_ERROR, {
          institution_id: metadata.institution_id,
          institution_name: metadata.institution_name,
          error_type: metadata.error_type,
          error_code: metadata.error_code,
          error_message: metadata.error_message,
        });
      }

      onEvent(eventname, metadata);
    },
    [onEvent],
  );

  const onPlaidExit = useCallback(
    (error: object, metadata: PlaidExitMetadata) => {
      setUserClosedPlaid(true);
      onExit(error, metadata);
    },
    [onExit],
  );

  const onPlaidSuccess = useCallback(
    (token: string, metadata: PlaidSuccessMetadata) => {
      trackEvent(EVENTS.PLAID_BANK_CREDENTIALS_AUTHORIZED, {
        bank_name: metadata.institution.name,
      });
      onSuccess(token, metadata);
    },
    [onSuccess],
  );

  const onScriptLoad = async () => {
    // @ts-ignore
    const linkHandler = await window.Plaid.create({
      apiVersion: 'v2',
      clientName: 'Dave',
      env: Config.REACT_APP_PLAID_ENV,
      key: Config.REACT_APP_PLAID_PUBLIC_KEY,
      onEvent: onPlaidEvent,
      onExit: onPlaidExit,
      onLoad,
      onSuccess: onPlaidSuccess,
      product: ['transactions'],
      webhook: Config.REACT_APP_PLAID_WEBHOOK_URL,
    });

    linkHandler.open();
  };

  return (
    <Script url="https://cdn.plaid.com/link/v2/stable/link-initialize.js" onLoad={onScriptLoad} />
  );
};

export default PlaidModal;
