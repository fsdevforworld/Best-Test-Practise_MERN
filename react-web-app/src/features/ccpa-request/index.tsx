import React, { FunctionComponent } from 'react';
import { BrowserRouter, MemoryRouter, Route, RouteComponentProps } from 'react-router-dom';

import { isDevEnv } from 'lib/config';

import CCPARequest from './containers/ccpa-request';
import CCPARequestSubmitted from './containers/ccpa-request-submitted';

const CCPA: FunctionComponent<RouteComponentProps> = ({ match }) => {
  // allows dev users to skip flows for visual testing
  const Router: typeof MemoryRouter & typeof BrowserRouter = isDevEnv()
    ? BrowserRouter
    : MemoryRouter;

  return (
    <Router>
      <Route path={`${match.url}/submitted`} component={CCPARequestSubmitted} />
      <Route exact path={match.url} component={CCPARequest} />
      <Route exact path="/" component={CCPARequest} />
    </Router>
  );
};

export default CCPA;
