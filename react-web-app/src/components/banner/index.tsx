import React, { FC, ReactElement } from 'react';
import { Grid, Typography, makeStyles } from '@material-ui/core';

interface Props {
  onClick: () => void;
  title: string | ReactElement;
  color?: string;
}

const useStyles = makeStyles({
  container: {
    padding: '20px',
    backgroundColor: ({ color = '#ffc107' }: Props) => color,
    cursor: 'pointer',
  },
  title: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#505050',
    fontFamily: 'Basis Grotesque',
    lineHeight: '27px',
  },
});

const Banner: FC<Props> = (props) => {
  const classes = useStyles(props);

  const { onClick, title } = props;
  const isTitleString = typeof title === 'string';

  return (
    <Grid
      className={classes.container}
      container
      direction="row"
      justify="center"
      alignContent="center"
      onClick={onClick}
    >
      <Grid item>
        {isTitleString ? (
          <Typography
            align="center"
            className={classes.title}
            color="inherit"
            variant="inherit"
            component="p"
          >
            {title}
          </Typography>
        ) : (
          title
        )}
      </Grid>
    </Grid>
  );
};

export default Banner;
