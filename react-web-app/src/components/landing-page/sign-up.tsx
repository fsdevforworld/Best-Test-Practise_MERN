import { Grid, makeStyles, Theme } from '@material-ui/core';
import Registration, { Disclaimer } from 'components/registration';
import { Step } from 'components/registration/registration-step';
import React, { FC } from 'react';

interface Props {
  onStepChange: (step: Step) => void;
}

const useStyles = makeStyles((theme: Theme) => ({
  container: {
    padding: theme.spacing(20),
    [theme.breakpoints.down('md')]: {
      paddingLeft: theme.spacing(10),
      paddingRight: theme.spacing(10),
    },
    [theme.breakpoints.down('sm')]: {
      padding: theme.spacing(15, 4),
    },
    [theme.breakpoints.down('xs')]: {
      padding: theme.spacing(3, 3, 15),
    },
  },
  contentContainer: {
    width: '100%',
  },
}));

const SignUp: FC<Props> = ({
  onStepChange = () => {
    /**/
  },
}) => {
  const classes = useStyles();

  return (
    <Grid container className={classes.container} direction="column" alignItems="center">
      <Grid
        container
        item
        className={classes.contentContainer}
        direction="column"
        alignItems="center"
        wrap="nowrap"
      >
        <Registration onStepChange={onStepChange} />
        <Disclaimer />
      </Grid>
    </Grid>
  );
};

export default SignUp;
