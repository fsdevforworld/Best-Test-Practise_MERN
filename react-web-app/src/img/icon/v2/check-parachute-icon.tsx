import React from 'react';
import { SvgIcon } from '@material-ui/core';
import { SvgIconProps } from '@material-ui/core/SvgIcon';

function CheckParachuteIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 56 70">
      <path d="M5 23.5L27.5 48" stroke="#C4C4C4" strokeWidth="2" strokeLinecap="round" />
      <path d="M50.5 23.5L28 48" stroke="#C4C4C4" strokeWidth="2" strokeLinecap="round" />
      <path d="M38.5 23L28 46.5" stroke="#C4C4C4" strokeWidth="2" strokeLinecap="round" />
      <path d="M17 23L27.5 46.5" stroke="#C4C4C4" strokeWidth="2" strokeLinecap="round" />
      <path d="M28 0C14.7452 0 4 10.7452 4 24H52C52 10.7452 41.2548 0 28 0Z" fill="#C4C4C4" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M11.4354 17.9146C11.267 17.9103 11.0975 17.8757 10.9326 17.8091C10.1982 17.5105 9.84439 16.6735 10.1424 15.9395C13.0138 8.86908 20.0696 4.25144 27.7007 4.44904C28.493 4.46955 29.1187 5.12908 29.0982 5.92138C29.0777 6.71369 28.4187 7.33946 27.6264 7.31894C21.1833 7.15211 15.2262 11.0502 12.8022 17.0194C12.5708 17.589 12.015 17.9296 11.4354 17.9146Z"
        fill="white"
      />
      <path d="M56 43H0V70H56V43Z" fill="#11893E" />
      <path d="M53 46H3V67H53V46Z" fill="white" />
      <path
        d="M16.5521 59.1885C16.5521 57.4093 15.7296 56.2343 13.1447 55.4118C11.8523 55.009 11.2816 54.774 11.2816 54.0858C11.2816 53.5319 11.6509 53.2298 12.2383 53.2298C12.8258 53.2298 13.2622 53.6159 13.3126 54.3208H16.2332C16.1157 52.2563 15.0414 51.0813 13.3126 50.7624V49H11.3655V50.7624C9.5024 51.0981 8.36103 52.4577 8.36103 54.3544C8.36103 56.3686 9.63668 57.4093 11.8523 58.0807C13.0944 58.4667 13.6315 58.836 13.6315 59.457C13.6315 59.9941 13.1951 60.3298 12.5069 60.3298C11.5837 60.3298 11.1305 59.8431 11.0634 58.9535H8.14282C8.19318 60.9005 9.25063 62.3944 11.3655 62.7637V64.5429H13.3126V62.7972C15.1757 62.5119 16.5521 61.253 16.5521 59.1885Z"
        fill="#11893E"
      />
      <rect x="23" y="52" width="24" height="3" fill="#11893E" />
      <rect x="23" y="58" width="24" height="3" fill="#11893E" />
    </SvgIcon>
  );
}

export default CheckParachuteIcon;
