import React, { FunctionComponent } from 'react';
import { Grid, GridJustification, makeStyles } from '@material-ui/core';

import { isAndroid, isIos } from 'lib/validation';
import Urls from 'lib/urls';

import { BackgroundColor } from './app-store-button';
import AppleAppStoreButton from './apple-app-store-button';
import AndroidAppStoreButton from './android-app-store-button';
import { getAppStoreUrl } from './helpers';

const ios = isIos();
const android = isAndroid();
const isNeither = Boolean(!ios && !android);

type Props = {
  backgroundColor?: BackgroundColor;
  url?: string;
  justify?: GridJustification;
};

const AppStoreButtons: FunctionComponent<Props> = ({ backgroundColor = 'black', url, justify }) => {
  const classes = useStyles();

  return (
    <Grid container spacing={1} justify={justify} className={classes.container}>
      {(ios || isNeither) && (
        <Grid item>
          <AppleAppStoreButton
            url={url || getAppStoreUrl(Urls.APP_STORE_IOS)}
            backgroundColor={backgroundColor}
          />
        </Grid>
      )}
      {(android || isNeither) && (
        <Grid item>
          <AndroidAppStoreButton
            url={url || getAppStoreUrl(Urls.APP_STORE_ANDROID)}
            backgroundColor={backgroundColor}
          />
        </Grid>
      )}
    </Grid>
  );
};

const useStyles = makeStyles({
  // https://github.com/mui-org/material-ui/issues/17142
  container: {
    width: 320,
  },
});

export { AppleAppStoreButton, AndroidAppStoreButton };

export default AppStoreButtons;
