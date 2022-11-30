import React, { FC } from 'react';
import { Grid, Typography, makeStyles, Theme } from '@material-ui/core';

import CircularProgressStat, {
  Props as CircularProgressStatProps,
} from 'components/circular-progress-stat';

export type ListItem = { title: string; items: CircularProgressStatProps[] };

export interface Props {
  list: ListItem[];
}

const useStyles = makeStyles((theme: Theme) => ({
  title: {
    fontFamily: 'Larsseit',
    fontWeight: 'bold',
    fontSize: '24px',
    lineHeight: '29px',
    marginBottom: '36px',
    [theme.breakpoints.up(376)]: {
      marginBottom: '69px',
    },
  },
  container: {
    margin: '60px 16px 18px 16px',
    [theme.breakpoints.up(376)]: {
      margin: '80px 16px 66px 16px',
    },
  },
}));

const EmployeeBreakdown: FC<Props> = ({ list }) => {
  const classes = useStyles();

  return (
    <div className={classes.container}>
      {list.map(({ title, items }) => (
        <Grid key={title} item container justify="center" alignContent="center">
          <Grid item xs={12}>
            <Typography align="center" className={classes.title}>
              {title}
            </Typography>
          </Grid>
          <Grid item container xs={12} alignContent="center" justify="space-evenly">
            {items.map((props) => (
              <CircularProgressStat key={props.title} {...props} />
            ))}
          </Grid>
        </Grid>
      ))}
    </div>
  );
};

export default EmployeeBreakdown;
