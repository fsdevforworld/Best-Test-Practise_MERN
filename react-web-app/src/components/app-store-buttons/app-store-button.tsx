import React, { FunctionComponent } from 'react';
import cx from 'classnames';
import { makeStyles, Button, Grid, Typography } from '@material-ui/core';

import Colors from 'components/colors';
import Icon from 'components/icon';
import { trackEvent } from 'lib/analytics';

import EVENTS from './events';

export type BackgroundColor = 'black' | 'white';

type Props = {
  className?: string;
  url: string;
  iconName: 'apple' | 'android';
  storeName: string;
  subtitle: string;
  backgroundColor?: BackgroundColor;
};
const AppStoreButton: FunctionComponent<Props> = ({
  url,
  iconName,
  storeName,
  subtitle,
  backgroundColor = 'black',
}) => {
  const classes = useStyles({ backgroundColor });
  return (
    <Button
      onClick={() => {
        trackEvent(EVENTS.DOWNLOAD_DAVE_SELECTED, {
          storeName,
        });
      }}
      className={classes.link}
      href={url}
      target="_blank"
      rel="noreferrer noopener"
    >
      <Grid container alignItems="center" wrap="nowrap">
        <Grid item>
          <Icon
            styles={classes.logo}
            name={iconName}
            fill={backgroundColor === 'black' ? 'white' : 'pitchBlack'}
          />
        </Grid>
        <Grid item>
          <Typography className={classes.text}>{subtitle}</Typography>
          <Typography className={cx(['title', classes.storeText])}>{storeName}</Typography>
        </Grid>
      </Grid>
    </Button>
  );
};

const useStyles = makeStyles({
  link: ({ backgroundColor: $backgroundColor }: { backgroundColor: BackgroundColor }) => {
    const backgroundColor = $backgroundColor === 'black' ? Colors.pitchBlack : Colors.white;
    return {
      display: 'flex',
      textAlign: 'left',
      textDecoration: 'none',
      color: $backgroundColor === 'black' ? Colors.white : Colors.pitchBlack,
      backgroundColor,
      borderColor: $backgroundColor === 'black' ? Colors.gray3 : Colors.pitchBlack,
      borderRadius: '10px',
      borderWidth: 1,
      borderStyle: 'solid',
      boxSizing: 'border-box',
      boxShadow: '0 12px 33px 0 transparent',
      padding: 8,
      '&:hover': {
        backgroundColor,
      },
    };
  },
  logo: {
    marginRight: 4,
    marginLeft: 2,
  },
  text: {
    fontSize: 10,
    lineHeight: 1,
    whiteSpace: 'nowrap',
  },
  storeText: {
    fontSize: 20,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    fontWeight: 500,
    letterSpacing: -0.8,
  },
});

export { useStyles };

export default AppStoreButton;
