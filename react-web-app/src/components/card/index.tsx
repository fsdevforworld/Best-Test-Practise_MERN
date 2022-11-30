import React, { FC } from 'react';

import { Grid, Typography, Paper, makeStyles, Theme } from '@material-ui/core';

export interface Props {
  imgSrc: string;
  description: string;
}

const useStyles = makeStyles((theme: Theme) => ({
  description: {
    fontFamily: 'Basis Grotesque',
    fontWeight: 'bold',
    fontSize: '20px',
    lineHeight: '24px',
    marginTop: '16px',
  },
  paper: {
    borderRadius: '8px',
    backgroundColor: '#EAFBF0',
    padding: '26px',
    maxWidth: '343px',
    height: '263px',
    boxSizing: 'border-box',
    margin: '12px 16px',
    [theme.breakpoints.up(376)]: {
      maxWidth: '329px',
      margin: '12px 13px',
    },
  },
  content: {
    height: '100%',
  },
}));

const GoalCard: FC<Props> = ({ imgSrc, description }) => {
  const classes = useStyles();

  return (
    <Paper elevation={0} className={classes.paper}>
      <Grid
        className={classes.content}
        container
        direction="column"
        justify="center"
        alignContent="space-around"
        alignItems="center"
      >
        <Grid item>
          <img src={imgSrc} alt={description} />
        </Grid>
        <Grid item>
          <Typography className={classes.description} align="center">
            {description}
          </Typography>
        </Grid>
      </Grid>
    </Paper>
  );
};

export default GoalCard;
