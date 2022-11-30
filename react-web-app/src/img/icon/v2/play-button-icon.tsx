import React from 'react';
import { SvgIcon } from '@material-ui/core';
import { SvgIconProps } from '@material-ui/core/SvgIcon';

function PlayButtonIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 92 92">
      <circle cx="46" cy="46" r="46" fill="white" />
      <path
        d="M62.4059 48.6149L40.0377 66.2371C38.7259 67.2706 36.8 66.3362 36.8 64.6661V29.4217C36.8 27.7517 38.7259 26.8172 40.0377 27.8507L62.4059 45.4729C63.4223 46.2736 63.4223 47.8142 62.4059 48.6149Z"
        fill="#0B9A40"
      />
    </SvgIcon>
  );
}

export default PlayButtonIcon;
