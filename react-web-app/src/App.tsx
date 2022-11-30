import React, { FunctionComponent, useEffect } from 'react';
import { BrowserRouter, Redirect, Route } from 'react-router-dom';
import { setDeviceContext } from 'lib/analytics';

import CCPA from 'features/ccpa-request';
import DEI from 'features/dei/containers/dei';
import RegistrationLanding from 'features/registration-landing';
import InviteAFriend from 'features/invite-a-friend';
import BankingLanding from 'features/banking-landing';
import ForgotPassword from 'features/set-password';
import URLS from 'lib/urls';
import { isIos, isAndroid } from 'lib/validation';

const redirectToAppStore = () => {
  let url = 'https://dave.com';

  if (isIos()) {
    url = URLS.APP_STORE_IOS;
  }
  if (isAndroid()) {
    url = URLS.APP_STORE_ANDROID;
  }

  window.location.replace(url);
  return null;
};

const App: FunctionComponent = () => {
  useEffect(() => {
    setDeviceContext();
  }, []);

  return (
    <BrowserRouter>
      <Route path="/dei" component={DEI} />
      <Route path="/register" component={RegistrationLanding} />
      <Route path="/100-bonus" component={redirectToAppStore} />
      <Route path="/jasonderulo" component={redirectToAppStore} />
      <Route path="/banking" component={BankingLanding} />
      <Route path="/ccpa-request" component={CCPA} />
      <Route path="/invite-a-friend" component={InviteAFriend} />
      <Route path="/set-password" component={ForgotPassword} />
      <Route exact path="/" render={() => <Redirect to="/register" />} />
    </BrowserRouter>
  );
};

export default App;
