import React, { FunctionComponent } from 'react';

import AppStoreButton, { BackgroundColor } from './app-store-button';

type Props = {
  backgroundColor?: BackgroundColor;
  url: string;
};
const AndroidAppStoreButton: FunctionComponent<Props> = ({ backgroundColor, url }) => {
  return (
    <AppStoreButton
      backgroundColor={backgroundColor}
      iconName="android"
      url={url}
      storeName="Google Play"
      subtitle="GET IT ON"
    />
  );
};

export default AndroidAppStoreButton;
