import React, { FC } from 'react';

import { Grid, Typography, makeStyles } from '@material-ui/core';

export interface Props {
  imgSrc: string;
  title: string;
  description: string;
}

const useStyles = makeStyles({
  title: {
    fontFamily: 'Basis Grotesque',
    fontWeight: 'bold',
    fontSize: '20px',
    lineHeight: '24px',
    marginTop: '13px',
  },
  description: {
    fontFamily: 'Basis Grotesque',
    fontSize: '18px',
    lineHeight: '24px',
    marginTop: '8px',
  },
  content: {
    width: '277px',
    margin: '4px',
    marginBottom: '48px',
  },
});

const CommunityCard: FC<Props> = ({ imgSrc, description, title }) => {
  const classes = useStyles();

  return (
    <Grid
      className={classes.content}
      container
      direction="column"
      justify="flex-end"
      alignContent="space-around"
      alignItems="center"
    >
      <Grid item>
        <img src={imgSrc} alt={title} />
      </Grid>
      <Grid item>
        <Typography className={classes.title} align="center">
          {title}
        </Typography>
      </Grid>
      <Grid item>
        <Typography className={classes.description} align="center">
          {description}
        </Typography>
      </Grid>
    </Grid>
  );
};

export default CommunityCard;
