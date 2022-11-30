import React, { FC } from 'react';
import { Grid, makeStyles, useMediaQuery, Theme } from '@material-ui/core';

import Card, { Props as CardProps } from 'components/card';
import DaveCard, { Props as DaveCardProps } from 'components/dave-card';
import Footer from 'components/footer';

import Navbar from 'components/navbar';

import { Cat, Alpaca, Unicorn, Handout, Pie, People, Shapes, Board } from 'img/dei';

import PageHeader from '../components/page-header';
import SectionHeader from '../components/section-header';
import SocialImpact, { ListItem as SocialImpactListItem } from '../components/social-impact';
import Money2020 from '../components/money2020';
import EmployeeBreakdown, {
  ListItem as EmployeeBreakdownListItem,
} from '../components/employee-breakdown';

const useStyles = makeStyles((theme: Theme) => ({
  title: {
    fontFamily: 'Larsseit',
    fontWeight: 'bold',
    fontSize: '24px',
    lineHeight: '29px',
    marginBottom: '70px',
  },
  section: {
    maxWidth: '1037px',
    padding: '0px 16px',
  },
  goalsSection: {
    maxWidth: '1065px',
    marginBottom: '80px',
    [theme.breakpoints.up(376)]: {
      marginBottom: '260px',
    },
  },
}));

const cardItems: CardProps[] = [
  {
    imgSrc: Handout,
    description: 'Foster and sustain an inclusive culture of belonging',
  },
  {
    imgSrc: Pie,
    description: 'Publicly report diversity figures',
  },
  {
    imgSrc: People,
    description: 'Provide access to Dave’s low-cost banking account to a million customers by 2021',
  },
  {
    imgSrc: Board,
    description: 'Increase board diversity to better reflect Dave’s employees and customers',
  },
  {
    imgSrc: Shapes,
    description: 'Expand partnerships to integrate more diverse organizations into Dave’s product',
  },
];

const employeeBreakdownList: EmployeeBreakdownListItem[] = [
  {
    title: 'Employees',
    items: [
      {
        color: '#36D571',
        percent: 56,
        title: 'non-white',
        description: 'Employees identifying as non-white',
      },
      {
        color: '#8155FB',
        percent: 38,
        title: 'female',
        description: 'Employees that are women',
      },
    ],
  },
  {
    title: 'Leadership',
    items: [
      {
        color: '#36D571',
        percent: 33,
        title: 'non-white',
        description: 'Members of leadership team who identify as non-white',
      },
      {
        color: '#8155FB',
        percent: 42,
        title: 'female',
        description: 'Members of leadership team that are women',
      },
    ],
  },
];

const socialImpactList: SocialImpactListItem[] = [
  {
    title: 'It starts with people',
    description:
      'By fostering an environment where all employees feel heard and empowered, Dave will naturally build an inclusive product that puts financial minds at ease.',
  },
  {
    title: 'Banking that fights inequality',
    description:
      'That means recognizing that advantages and disadvantages exist in the financial system and creating products that correct that imbalance.',
  },
  {
    title: 'It’s not charity, it’s business',
    description:
      'Social impact is about removing the tension between profit vs purpose and creating beneficial business outcomes through positive social change.',
  },
];

const communityList: DaveCardProps[] = [
  {
    imgSrc: Cat,
    title: 'Lady Daves',
    description: 'Women, femmes and allies',
  },
  {
    imgSrc: Alpaca,
    title: 'LatinX Daves',
    description: 'LatinX and allies',
  },
  {
    imgSrc: Unicorn,
    title: 'Gayves',
    description: 'LGBTQ+ and allies',
  },
];

const DEI: FC = () => {
  const classes = useStyles();
  const matchesMobileBreakpoint = useMediaQuery('(min-width:376px)');

  return (
    <>
      <Navbar />
      <Grid container direction="row" justify="center" alignContent="center">
        <Grid item xs={12}>
          <PageHeader />
          <Grid
            container
            justify="center"
            alignContent="center"
            direction="column"
            alignItems="center"
          >
            <Grid item className={classes.section}>
              <SectionHeader
                align={matchesMobileBreakpoint ? 'center' : 'left'}
                title="Making a social impact"
                description="Dave’s Diversity, Equity and Inclusion (DEI) initiatives are designed to build a
              welcoming culture that promotes equity in the financial system."
              />
              <SocialImpact list={socialImpactList} />
            </Grid>
            <Grid item container justify="center" className={classes.goalsSection}>
              <SectionHeader title="Dave’s goals" />
              {cardItems.map((props) => (
                <Grid item key={props.imgSrc}>
                  <Card {...props} />
                </Grid>
              ))}
            </Grid>
            <Grid item container justify="center" alignContent="center">
              <SectionHeader
                className={classes.section}
                title="Money2020: Dave’s approach to DEI"
              />
              <Money2020 />
            </Grid>
            <Grid item container className={classes.section} justify="center" alignContent="center">
              <SectionHeader
                title="Where Dave is now"
                description="All data is self-reported and representative as of Aug 2020"
              />
              <EmployeeBreakdown list={employeeBreakdownList} />
            </Grid>
            <Grid item container justify="center" alignContent="center" className={classes.section}>
              <SectionHeader title="A few beloved communities" />
              {communityList.map((props) => (
                <Grid item key={props.title}>
                  <DaveCard {...props} />
                </Grid>
              ))}
            </Grid>
          </Grid>
        </Grid>
      </Grid>
      <Footer />
    </>
  );
};

export default DEI;
