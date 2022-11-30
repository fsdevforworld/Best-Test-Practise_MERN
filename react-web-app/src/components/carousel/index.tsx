import React, { FC } from 'react';
import SwipeableViews from 'react-swipeable-views';
import { autoPlay } from 'react-swipeable-views-utils';
import { Grid, Typography, makeStyles, Theme, MobileStepper, IconButton } from '@material-ui/core';

import { ArrowLeftIcon, ArrowRightIcon } from 'components/icons';

export type Slide = {
  title: string;
  header: string;
  description: string;
  imgSrc: string;
};

export interface Props {
  slides: Slide[];
}

const useStyles = makeStyles((theme: Theme) => ({
  swipeContainer: {
    width: 'inherit',
  },
  verbiageContainer: {
    paddingRight: '10px',
    [theme.breakpoints.up(376)]: {
      paddingRight: '0px',
    },
  },
  title: {
    letterSpacing: '1px',
    textTransform: 'uppercase',
    fontFamily: 'Basis Grotesque',
    fontWeight: 500,
    fontSize: '10px',
    lineHeight: '12px',
    color: '#898989',
    marginBottom: '4px',
    [theme.breakpoints.up(376)]: {
      fontSize: '14px',
      lineHeight: '20px',
      marginBottom: '16px',
    },
  },
  header: {
    color: '#3C3C3C',
    marginBottom: '8px',
    lineHeight: '24px',
    fontSize: '20px',
    fontWeight: 'bold',
    fontFamily: 'Larsseit',
    [theme.breakpoints.up(376)]: {
      lineHeight: '40px',
      fontSize: '36px',
      marginBottom: '12px',
    },
  },
  description: {
    fontFamily: 'Basis Grotesque',
    fontSize: '16px',
    lineHeight: '21px',
    color: '#505050',
    [theme.breakpoints.up(376)]: {
      fontSize: '24px',
      lineHeight: '32px',
    },
  },
  stepper: {
    position: 'relative',
    backgroundColor: 'white',
    paddingTop: '36px',
    [theme.breakpoints.up(376)]: {
      paddingTop: '32px',
    },
    '& .MuiMobileStepper-dot': {
      border: '2px solid #C0C0C0',
      boxSizing: 'border-box',
      backgroundColor: 'white',
      width: '12px',
      height: '12px',
      '&.MuiMobileStepper-dotActive': {
        backgroundColor: '#3C3C3C',
        border: '2px solid #3C3C3C',
      },
    },
  },
  buttonContainer: {
    marginTop: '36px',
    display: 'none',
    [theme.breakpoints.up(376)]: {
      display: 'block',
    },
  },
  arrowButton: {
    color: '#3C3C3C',
  },
  arrowIcon: {
    height: '20px',
    width: '20px',
    color: 'inherit',
  },
  img: {
    width: '100%',
    height: 'auto',
  },
}));

const AutoPlaySwipeableViews = autoPlay(SwipeableViews);

/*
  We may be able to improve the implmentation of this component by having users pass the slide content into the component through children prop. 
  We can then split out the carousel control component in combination with the useRef hook to still give the Carousel component the ability
  to manage state and current slide bring displayed. This would allow users to implement the carosel component however they would like instead
  of having to pass in a strctured list prop. If this component evolves based on current designs then we should make this update.
*/
const Carousel: FC<Props> = ({ slides }) => {
  const classes = useStyles();
  const [activeStep, setActiveStep] = React.useState(0);
  const maxSteps = slides.length;

  const handleNext = () => {
    setActiveStep((prevActiveStep) => prevActiveStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  };

  const handleStepChange = (step: number) => {
    setActiveStep(step);
  };

  return (
    <Grid container direction="column">
      <AutoPlaySwipeableViews
        className={classes.swipeContainer}
        index={activeStep}
        onChangeIndex={handleStepChange}
        enableMouseEvents
      >
        {slides.map(({ title, header, description, imgSrc }, index) => (
          <Grid
            key={header}
            item
            container
            direction="row"
            alignItems="center"
            justify="space-between"
            wrap="nowrap"
          >
            <Grid item className={classes.verbiageContainer}>
              <Typography className={classes.title}>{title}</Typography>
              <Typography className={classes.header}>{header}</Typography>
              <Typography className={classes.description}>{description}</Typography>
              <div className={classes.buttonContainer}>
                <IconButton
                  onClick={handleBack}
                  className={classes.arrowButton}
                  disabled={index === 0}
                >
                  <ArrowLeftIcon className={classes.arrowIcon} />
                </IconButton>
                <IconButton
                  onClick={handleNext}
                  className={classes.arrowButton}
                  disabled={index === maxSteps - 1}
                >
                  <ArrowRightIcon className={classes.arrowIcon} />
                </IconButton>
              </div>
            </Grid>
            <Grid item>
              <img className={classes.img} src={imgSrc} alt={header} />
            </Grid>
          </Grid>
        ))}
      </AutoPlaySwipeableViews>
      <Grid container item xs={12} justify="center">
        <MobileStepper
          steps={maxSteps}
          position="bottom"
          variant="dots"
          activeStep={activeStep}
          className={classes.stepper}
          backButton={null}
          nextButton={null}
        />
      </Grid>
    </Grid>
  );
};

export default Carousel;
