import React, { FC } from 'react';
import { Grid, Typography, makeStyles, Theme } from '@material-ui/core';

import { DaveTeam, Ellipse } from 'img/dei';

const useStyles = makeStyles((theme: Theme) => ({
  title: {
    fontFamily: 'Larsseit',
    fontWeight: 'bold',
    marginTop: '13px',
    fontSize: '36px',
    lineHeight: '40px',
    color: 'white',
    [theme.breakpoints.up(376)]: {
      fontSize: '48px',
      lineHeight: '57px',
    },
  },
  description: {
    fontFamily: 'Basis Grotesque',
    fontSize: '18px',
    lineHeight: '24px',
    marginTop: '24px',
    maxWidth: '684px',
    color: 'white',
  },
  imgContainer: {
    position: 'relative',
    marginBottom: '48px',
    padding: '30%',
  },
  container: {
    position: 'relative',
    overflow: 'hidden',
    maxHeight: '738px',
    minHeight: '514px',
    background: 'linear-gradient(0deg, rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.3))',
    backgroundImage: `url(${DaveTeam})`,
    backgroundPosition: 'center',
    backgroundSize: 'cover',
    backgroundRepeat: 'no-repeat',
  },
  ellipse: {
    top: '90%',
    width: '100%',
    position: 'absolute',
    left: 0,
    [theme.breakpoints.up(376)]: {
      fontSize: '48px',
      lineHeight: '57px',
      top: '80%',
    },
    [theme.breakpoints.up(2200)]: {
      top: '72%',
    },
  },
  content: {
    position: 'absolute',
    left: 0,
    height: '100%',
    width: '100%',
    bottom: '78px',
    padding: '16px',
    [theme.breakpoints.up(376)]: {
      fontSize: '48px',
      lineHeight: '57px',
      bottom: '10%',
    },
  },
}));

const PageHeader: FC = () => {
  const classes = useStyles();

  return (
    <div className={classes.container}>
      <img className={classes.ellipse} src={Ellipse} alt="ellipse" />
      <div className={classes.imgContainer} />
      <Grid
        className={classes.content}
        container
        direction="column"
        justify="center"
        alignItems="center"
      >
        <Grid item>
          <Typography className={classes.title} align="center">
            Diversity, Equity &amp; Inclusion
          </Typography>
        </Grid>
        <Grid item>
          <Typography className={classes.description} align="center">
            Dave is on a mission to put financial minds at ease. But you can’t put people at ease if
            you don’t listen, learn and empathize.
          </Typography>
        </Grid>
      </Grid>
    </div>
  );
};

export default PageHeader;
