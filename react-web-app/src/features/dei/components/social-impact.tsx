import React, { FC } from 'react';
import { Grid, Typography, makeStyles, Theme } from '@material-ui/core';

import { Graph } from 'img/dei';

export type ListItem = {
  title: string;
  description: string;
};

export interface Props {
  list: ListItem[];
}

const useStyles = makeStyles((theme: Theme) => ({
  subTitle: {
    fontFamily: 'Larsseit',
    fontWeight: 'bold',
    fontSize: '20px',
    lineHeight: '24px',
    marginBottom: '12px',
    [theme.breakpoints.up(376)]: {
      fontSize: '24px',
      lineHeight: '29px',
    },
  },
  description: {
    fontFamily: 'Basis Grotesque',
    fontSize: '18px',
    lineHeight: '24px',
    marginTop: '12px',
    maxWidth: '684px',
  },
  container: {
    position: 'relative',
  },
  listItemContainer: {
    '& > div:not(:last-child)': {
      paddingBottom: '53px',
      [theme.breakpoints.up(376)]: {
        paddingBottom: '48px',
      },
    },
  },
  imgContainer: {
    textAlign: 'center',
    maxWidth: 494,
    maxHeight: 327,
    padding: '0px',
    marginBottom: '50px',
    [theme.breakpoints.up(960)]: {
      padding: '40px',
      marginBottom: '0px',
    },
  },
  content: {
    marginTop: '66px',
    marginBottom: '80px',
    [theme.breakpoints.up(376)]: {
      marginTop: '130px',
      marginBottom: '130px',
    },
  },
}));

const SocialImpact: FC<Props> = ({ list }) => {
  const classes = useStyles();

  return (
    <Grid
      className={classes.container}
      container
      direction="row"
      justify="center"
      alignItems="center"
    >
      <Grid
        item
        container
        direction="row"
        xs={12}
        justify="center"
        alignContent="space-between"
        alignItems="center"
        className={classes.content}
        wrap="wrap-reverse"
      >
        <Grid
          xs={12}
          md={6}
          item
          container
          direction="column"
          alignContent="center"
          className={classes.listItemContainer}
        >
          {list.map(({ title, description }) => (
            <Grid item key={title}>
              <Typography className={classes.subTitle}>{title}</Typography>
              <Typography className={classes.description}>{description}</Typography>
            </Grid>
          ))}
        </Grid>
        <Grid className={classes.imgContainer} item xs={12} md={6}>
          <img width="100%" height="100%" src={Graph} alt="graph" />
        </Grid>
      </Grid>
    </Grid>
  );
};

export default SocialImpact;
