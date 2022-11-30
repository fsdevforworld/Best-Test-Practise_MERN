import { Box, makeStyles, Theme, useMediaQuery, useTheme } from '@material-ui/core';
import React, { FunctionComponent } from 'react';

import Navbar from 'components/navbar';

import { GreenCheck } from 'img/icon';
import classNames from 'classnames';

const NewPasswordSuccess: FunctionComponent = () => {
  const classes = useStyles();
  const theme = useTheme();
  const breakpoint = useMediaQuery(theme.breakpoints.up('md'));

  return (
    <>
      <Navbar />
      <Box className={classes.box}>
        <div className={classes.container}>
          <GreenCheck className={classes.image} />
          <h1 className={classNames([classes.header, breakpoint ? 'title-6' : 'title-3'])}>
            You&apos;re all done
          </h1>
          <p className="body-4">
            Dave updated your password in the system, so you’re good to go now.
          </p>
        </div>
      </Box>
    </>
  );
};

export default NewPasswordSuccess;

const useStyles = makeStyles((theme: Theme) => {
  return {
    box: {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      flexWrap: 'nowrap',
      height: '75vh',
    },
    container: {
      maxWidth: '24rem',
      padding: '2rem',
      textAlign: 'center',
    },
    image: {
      height: '6rem',
      width: '100%',
    },
    header: {
      marginTop: '1.5rem',
      marginBottom: '1rem',
      [theme.breakpoints.up('md')]: {
        marginTop: '2.25rem',
      },
    },
  };
});
