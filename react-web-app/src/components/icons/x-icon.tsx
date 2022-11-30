import React from 'react';
import { SvgIcon } from '@material-ui/core';
import { SvgIconProps } from '@material-ui/core/SvgIcon';

function XIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 24 24">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2.89299 19.6929C2.50247 20.0834 2.50247 20.7166 2.89299 21.1071C3.28352 21.4976 3.91668 21.4976 4.3072 21.1071L12.0001 13.4142L19.693 21.1071C20.0835 21.4976 20.7167 21.4976 21.1072 21.1071C21.4977 20.7166 21.4977 20.0834 21.1072 19.6929L13.4143 12L21.1072 4.30711C21.4977 3.91659 21.4977 3.28342 21.1072 2.8929C20.7167 2.50237 20.0835 2.50238 19.693 2.8929L12.0001 10.5858L4.30721 2.8929C3.91669 2.50238 3.28352 2.50238 2.893 2.8929C2.50247 3.28343 2.50247 3.91659 2.893 4.30712L10.5859 12L2.89299 19.6929Z"
      />
    </SvgIcon>
  );
}
export default XIcon;
