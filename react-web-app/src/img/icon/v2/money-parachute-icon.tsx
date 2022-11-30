import React from 'react';
import { SvgIcon } from '@material-ui/core';
import { SvgIconProps } from '@material-ui/core/SvgIcon';

function MoneyParachuteIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 58 70">
      <path d="M6 23.5L28.5 48" stroke="#C4C4C4" strokeWidth="2" strokeLinecap="round" />
      <path d="M51.5 23.5L29 48" stroke="#C4C4C4" strokeWidth="2" strokeLinecap="round" />
      <path d="M39.5 23L29 46.5" stroke="#C4C4C4" strokeWidth="2" strokeLinecap="round" />
      <path d="M18 23L28.5 46.5" stroke="#C4C4C4" strokeWidth="2" strokeLinecap="round" />
      <path d="M29 0C15.7452 0 5 10.7452 5 24H53C53 10.7452 42.2548 0 29 0Z" fill="#C4C4C4" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12.4354 17.9146C12.267 17.9103 12.0975 17.8757 11.9326 17.8091C11.1982 17.5105 10.8444 16.6735 11.1424 15.9395C14.0138 8.86908 21.0696 4.25144 28.7007 4.44904C29.493 4.46955 30.1187 5.12908 30.0982 5.92138C30.0777 6.71369 29.4187 7.33946 28.6264 7.31894C22.1833 7.15211 16.2262 11.0502 13.8022 17.0194C13.5708 17.589 13.015 17.9296 12.4354 17.9146Z"
        fill="white"
      />
      <mask
        id="mask0"
        mask-type="alpha"
        maskUnits="userSpaceOnUse"
        x="0"
        y="39"
        width="58"
        height="31"
      >
        <rect y="39.9398" width="58" height="29.8683" fill="#11893E" />
      </mask>
      <g mask="url(#mask0)">
        <rect y="39.9398" width="58" height="29.8683" fill="#11893E" />
        <rect x="2.43115" y="42.7185" width="53.1377" height="24.3114" fill="#16B04F" />
        <ellipse cx="28.5" cy="55" rx="8.5" ry="10" fill="#0C622C" />
        <path
          d="M32.5883 57.4162C32.5883 55.6484 31.696 54.6214 29.2043 53.7628C27.7733 53.2577 27.1167 52.9715 27.1167 52.0624C27.1167 51.2542 27.6386 50.7997 28.4635 50.7997C29.2885 50.7997 29.8778 51.3216 29.9114 52.2812H32.2348C32.1506 50.2609 31.0899 49.1161 29.3895 48.8299V47.1631H27.7901V48.813C25.9045 49.0992 24.7933 50.463 24.7933 52.2644C24.7933 54.2342 26.0392 55.177 28.1773 55.8841C29.642 56.3724 30.265 56.8269 30.265 57.6182C30.265 58.4095 29.7094 58.9651 28.7161 58.9651C27.5376 58.9651 26.9146 58.3253 26.8473 57.1637H24.5239C24.5913 59.1335 25.6856 60.5982 27.7901 60.9181V62.5848H29.3895V60.9349C31.2583 60.6824 32.5883 59.4365 32.5883 57.4162Z"
          fill="#16B04F"
        />
        <circle cx="4.76837e-05" cy="69.8082" r="9.37724" fill="#11893E" />
        <circle cx="4.76837e-05" cy="39.94" r="9.37724" fill="#11893E" />
        <circle cx="58" cy="39.94" r="9.37724" fill="#11893E" />
        <circle cx="58" cy="69.8082" r="9.37724" fill="#11893E" />
      </g>
    </SvgIcon>
  );
}

export default MoneyParachuteIcon;
