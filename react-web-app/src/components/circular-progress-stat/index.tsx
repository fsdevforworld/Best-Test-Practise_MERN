import React, { FC } from 'react';
import clsx from 'clsx';

import {
  Grid,
  Typography,
  makeStyles,
  Theme,
  CircularProgress as MuiCircularProgress,
} from '@material-ui/core';

export interface Props {
  color: string;
  percent: number;
  title: string;
  description: string;
}

const useStyles = makeStyles((theme: Theme) => ({
  container: {
    maxWidth: '310px',
  },
  circle: {
    strokeLinecap: 'round',
  },
  statCircle: {
    color: ({ color }: Props) => color,
  },
  backgroundCircle: {
    color: '#F5F5F5',
    position: 'absolute',
    left: 0,
  },
  percentText: {
    fontFamily: 'Larsseit',
    fontWeight: 'bold',
    fontSize: '64px',
    lineHeight: '77px',
  },
  percentNumber: {
    fontSize: '64px',
    lineHeight: '77px',
  },
  percentTitle: {
    fontSize: '28px',
    lineHeight: '34px',
  },
  statDescription: {
    fontFamily: 'Basis Grotesque',
    fontWeight: 'bold',
    fontSize: '20px',
    lineHeight: '24px',
    marginTop: '35px',
    marginBottom: '64px',
    [theme.breakpoints.up(376)]: {
      marginTop: '45px',
    },
  },
  relative: {
    position: 'relative',
  },
  innerCircleContent: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
}));

const CircularProgressStat: FC<Props> = (props) => {
  const classes = useStyles(props);
  const { percent, description, title } = props;

  return (
    <Grid
      className={classes.container}
      container
      direction="column"
      justify="center"
      alignContent="center"
    >
      <Grid item className={classes.relative}>
        <Grid container className={classes.relative}>
          <MuiCircularProgress
            className={classes.backgroundCircle}
            variant="static"
            value={100}
            size={310}
            thickness={2.5}
          />
          <MuiCircularProgress
            className={classes.statCircle}
            variant="static"
            value={percent}
            size={310}
            classes={{
              circle: classes.circle,
            }}
            thickness={2.5}
          />
        </Grid>
        <Grid
          container
          className={classes.innerCircleContent}
          direction="column"
          alignItems="center"
          justify="center"
        >
          <Typography className={clsx([classes.percentText, classes.percentNumber])}>
            {percent}%
          </Typography>
          <Typography className={clsx([classes.percentText, classes.percentTitle])}>
            {title}
          </Typography>
        </Grid>
      </Grid>
      <Grid item>
        <Typography className={classes.statDescription} align="center">
          {description}
        </Typography>
      </Grid>
    </Grid>
  );
};

export default CircularProgressStat;
