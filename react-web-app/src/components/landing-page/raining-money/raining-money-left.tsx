import React, { FC } from 'react';
import { RainingMoneyLeft as DefaultImage, RainingMoneyLeftMobile } from 'img/influencer';
import { makeStyles, Theme } from '@material-ui/core';
import clsx from 'clsx';

interface Props {
  className?: string;
}

const useStyles = makeStyles((theme: Theme) => ({
  container: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 0,
    height: '100%',
    width: '50%',
    backgroundRepeat: 'no-repeat',
    backgroundSize: 'contain',
    backgroundImage: `url(${DefaultImage})`,
    [theme.breakpoints.down('xs')]: {
      backgroundImage: `url(${RainingMoneyLeftMobile})`,
      marginTop: theme.spacing(7),
    },
  },
}));

const RainingMoneyLeft: FC<Props> = ({ className }) => {
  const classes = useStyles();
  return <div className={clsx(classes.container, className)} />;
};

export default RainingMoneyLeft;
