import React, { FC } from 'react';
import ReactPlayer from 'react-player';
import { Grid, makeStyles, Hidden, Theme } from '@material-ui/core';

import { Pattern } from 'img/dei';

const useStyles = makeStyles((theme: Theme) => ({
  title: {
    fontFamily: 'Larsseit',
    fontWeight: 'bold',
    fontSize: '36px',
    lineHeight: '40px',
    marginBottom: '12px',
  },
  description: {
    fontFamily: 'Basis Grotesque',
    fontSize: '18px',
    lineHeight: '24px',
    marginTop: '12px',
    maxWidth: '684px',
  },
  patternImg: {
    top: '0',
    width: '100%',
    height: '100%',
    position: 'absolute',
    zIndex: -1,
  },
  container: {
    position: 'relative',
    width: '100%',
    marginBottom: '80px',
    [theme.breakpoints.up('md')]: {
      paddingBottom: '130px',
    },
    [theme.breakpoints.up(376)]: {
      marginBottom: '130px',
    },
  },
  playerContainer: {
    maxHeight: '579px',
    maxWidth: '1037px',
  },
  playerContent: {
    paddingBottom: '56.25%',
    position: 'relative',
  },
  player: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
}));

const Money2020: FC = () => {
  const classes = useStyles();

  return (
    <div className={classes.container}>
      <Grid container justify="center">
        <Grid container item className={classes.playerContainer}>
          <Grid item xs={12} className={classes.playerContent}>
            <ReactPlayer
              controls
              className={classes.player}
              height="100%"
              width="100%"
              url="https://www.youtube.com/watch?v=TbWu1qwR00k&feature=youtu.be"
            />
          </Grid>
        </Grid>
      </Grid>
      <Hidden smDown>
        <img className={classes.patternImg} src={Pattern} alt="pattern" />
      </Hidden>
    </div>
  );
};

export default Money2020;
