import React, { FC } from 'react';
import { Grid, Typography, makeStyles, Theme } from '@material-ui/core';

export interface Props {
  quote: string;
  author: string;
  department: string;
  imgSrc: string;
}

const useStyles = makeStyles((theme: Theme) => ({
  container: {
    maxWidth: '684px',
  },
  verbiageContainer: {
    marginTop: '23px',
    textAlign: 'center',
    [theme.breakpoints.up('sm')]: {
      marginTop: '4px',
      textAlign: 'left',
    },
  },
  authorText: {
    fontFamily: 'Basis Grotesque',
    fontSize: '16px',
    lineHeight: '21px',
    color: '#3C3C3C',
  },
  departmentText: {
    color: '#0e9a40',
  },
  quoteText: {
    fontStyle: 'italic',
    fontFamily: 'Basis Grotesque',
    fontWeight: 'bold',
    fontSize: '18px',
    lineHeight: '24px',
    color: '#3C3C3C',
    marginBottom: '16px',
    [theme.breakpoints.up(376)]: {
      fontSize: '20px',
      lineHeight: '24px',
    },
  },
  img: {
    maxWidth: '153px',
    height: 'auto',
    [theme.breakpoints.up('sm')]: {
      paddingRight: '30px',
    },
  },
}));

const Testimonial: FC<Props> = ({ imgSrc, quote, author, department }) => {
  const classes = useStyles();

  return (
    <Grid container direction="row" justify="space-between" className={classes.container}>
      <Grid item xs={12} sm="auto" justify="center">
        <Grid item container justify="center">
          <img className={classes.img} src={imgSrc} alt={author} />
        </Grid>
      </Grid>
      <Grid item xs={12} sm className={classes.verbiageContainer}>
        <Typography align="inherit" className={classes.quoteText}>
          &quot;{quote}&quot;
        </Typography>
        <Typography align="inherit" className={classes.authorText}>
          - {author} <span className={classes.departmentText}>({department})</span>
        </Typography>
      </Grid>
    </Grid>
  );
};

export default Testimonial;
