import React, { FunctionComponent } from 'react';
import { BrowserRouter, Route, RouteComponentProps, Switch } from 'react-router-dom';

import CreateNewPassword from './containers/create-new-password';
import NewPasswordSuccess from './containers/new-password-success';

const SetPassword: FunctionComponent<RouteComponentProps> = ({ match }) => {
  return (
    <BrowserRouter>
      <Switch>
        <Route path={`${match.url}/success`} component={NewPasswordSuccess} />
        <Route path={`${match.url}`} component={CreateNewPassword} />
      </Switch>
    </BrowserRouter>
  );
};

export default SetPassword;
