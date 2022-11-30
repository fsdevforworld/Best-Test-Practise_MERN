import React, { FC } from 'react';
import { Grid, Typography, TypographyProps, makeStyles, Theme } from '@material-ui/core';

interface Props extends Pick<TypographyProps, 'align'> {
  title: string;
  description?: string;
  className?: string;
}

const useStyles = makeStyles((theme: Theme) => ({
  title: {
    fontFamily: 'Larsseit',
    fontWeight: 'bold',
    fontSize: '24px',
    lineHeight: '29px',
    marginBottom: ({ description }: Props) => (description ? '4px' : '36px'),
    [theme.breakpoints.up(376)]: {
      fontSize: '36px',
      lineHeight: '40px',
      marginBottom: ({ description }: Props) => (description ? '12px' : '48px'),
    },
  },
  titleContainer: {
    width: '100%',
  },
  description: {
    fontFamily: 'Basis Grotesque',
    fontSize: '18px',
    lineHeight: '24px',
    marginTop: '12px',
    maxWidth: '507px',
  },
}));

const SectionHeader: FC<Props> = (props) => {
  const classes = useStyles(props);
  const { title, description, className, align = 'center' } = props;

  return (
    <Grid container item direction="column" xs={12} alignItems="center" className={className}>
      <Grid item className={classes.titleContainer}>
        <Typography className={classes.title} align={align}>
          {title}
        </Typography>
      </Grid>
      {description && (
        <Grid item>
          <Typography className={classes.description} align={align}>
            {description}
          </Typography>
        </Grid>
      )}
    </Grid>
  );
};

export default SectionHeader;
