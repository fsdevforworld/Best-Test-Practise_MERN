import React, { FunctionComponent } from 'react';
import { BrowserRouter, Route, RouteComponentProps, Redirect, Switch } from 'react-router-dom';

import Gift5Screen from './containers/gift-5';
import Gift5TermsScreen from './containers/gift-5-terms';

import Get5Give5Screen from './containers/get-5-give-5';
import Get5Give5TermsScreen from './containers/get-5-give-5-terms';

const InviteAFriend: FunctionComponent<RouteComponentProps> = ({ match }) => {
  return (
    <BrowserRouter>
      <Switch>
        <Route path={`${match.url}/gift-5/terms`} component={Gift5TermsScreen} />
        <Route path={`${match.url}/gift-5/:inviteCode`} component={Gift5Screen} />
        <Route exact path={`${match.url}/gift-5`} render={() => <Redirect to="/saves" />} />

        <Route path={`${match.url}/get-5-give-5/terms`} component={Get5Give5TermsScreen} />
        <Route path={`${match.url}/get-5-give-5/:inviteCode`} component={Get5Give5Screen} />
        <Route exact path={`${match.url}/get-5-give-5`} render={() => <Redirect to="/saves" />} />
      </Switch>
    </BrowserRouter>
  );
};

export default InviteAFriend;
