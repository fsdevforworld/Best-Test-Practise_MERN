import React, { FunctionComponent } from 'react';
import { Route, RouteProps, RouteComponentProps } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';

type Props = {
  component: React.ComponentType<RouteComponentProps<any>> | React.ComponentType<any>;
  title?: string;
  keywords?: string;
  description?: string;
  robots?: string;
} & RouteProps;

const DaveRoute: FunctionComponent<Props> = ({
  component: Component,
  title,
  keywords,
  description,
  robots,
  ...rest
}) => {
  return (
    <Route
      {...rest}
      render={(routeProps) => {
        return (
          <>
            <Helmet>
              {Boolean(title) && <title>{title}</title>}
              {Boolean(keywords) && <meta name="keywords" content={keywords} />}
              {Boolean(description) && <meta name="description" content={description} />}
              {Boolean(robots) && <meta name="robots" content={robots} />}
            </Helmet>
            <Component {...routeProps} />
          </>
        );
      }}
    />
  );
};

export default DaveRoute;
