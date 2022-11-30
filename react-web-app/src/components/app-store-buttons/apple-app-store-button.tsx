import React, { FunctionComponent } from 'react';

import AppStoreButton, { BackgroundColor } from './app-store-button';

type Props = {
  backgroundColor?: BackgroundColor;
  url: string;
};
const AppleAppStoreButton: FunctionComponent<Props> = ({ backgroundColor, url }) => {
  return (
    <AppStoreButton
      iconName="apple"
      backgroundColor={backgroundColor}
      url={url}
      storeName="App Store"
      subtitle="Download on the"
    />
  );
};

export default AppleAppStoreButton;
