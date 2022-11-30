import Footer from 'components/footer';
import { NavigationGroup } from 'components/footer/links';
import React, { FC } from 'react';
import Disclaimers from './disclaimers';

const landingNavGroups: NavigationGroup[] = [
  {
    title: 'Company',
    links: [
      { name: 'About', url: '/about' },
      { name: 'Giving Back', url: '/giving-back' },
      { name: 'Careers', url: '/careers' },
      { name: 'Help', url: '/help' },
      { name: 'Press', url: '/press' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { name: 'Policy', url: '/privacy' },
      { name: 'TOS', url: '/terms' },
    ],
  },
  {
    title: 'Follow Us',
    links: [
      { name: 'Facebook', url: 'https://www.facebook.com/TheDaveApp/' },
      { name: 'Twitter', url: 'https://twitter.com/DaveBanking' },
      { name: 'Instagram', url: 'https://www.instagram.com/thedaveapp/' },
    ],
  },
];

const LandingFooter: FC = () => {
  return (
    <Footer navigationGroups={landingNavGroups} showLegal={false}>
      <Disclaimers />
    </Footer>
  );
};

export default LandingFooter;
