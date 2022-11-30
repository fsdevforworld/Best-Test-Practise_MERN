import React, { FC, useState, useRef } from 'react';
import clsx from 'clsx';
import { makeStyles, Grid, ListItemText, Button, Menu, MenuItem } from '@material-ui/core';

import { ChevronDownIcon } from 'components/icons';

export type NavBarRouteListItem = {
  name: string;
  url?: string;
  dropdownList?: {
    name: string;
    url: string;
  }[];
};

interface Props {
  routeList: NavBarRouteListItem;
}

const useStyles = makeStyles(() => ({
  copyrightText: {
    paddingRight: '25px',
    marginBottom: '15px',
    marginTop: '7px',
    fontSize: '12px',
    color: '#aaa',
    fontFamily: 'Basis Grotesque',
  },
  linkText: {
    fontSize: '16px',
    lineHeight: '24px',
    fontFamily: 'Basis Grotesque',
    color: '#898989',
    padding: '20px 16.25px',
    position: 'relative',
    textTransform: 'none',
    fontWeight: 'normal',
    '&:hover': {
      color: '#3c3c3c',
      backgroundColor: 'transparent',
    },
  },
  linkTextActive: {
    color: '#3c3c3c',
    '&::after': {
      borderBottom: '3px solid #0b9a40',
      bottom: '4px',
      left: 0,
      right: 0,
      width: '28px',
      content: "''",
      display: 'block',
      margin: 'auto',
      position: 'absolute',
    },
  },
  menu: {
    pointerEvents: 'none',
    cursor: 'pointer',
  },
  popperLink: {
    fontSize: '16px',
    lineHeight: '16px',
    fontFamily: 'Basis Grotesque',
    color: '#898989',
    padding: '12px 24px',
    pointerEvents: 'auto',
    '&:hover': {
      color: '#3c3c3c',
      backgroundColor: 'white',
    },
    '&:focus': {
      backgroundColor: 'white',
    },
  },
  menuList: {
    pointerEvents: 'auto',
    borderRadius: '8px',
    boxShadow: '0px 4px 19px rgba(0, 0, 0, 0.09)',
    overflow: 'hidden',
    padding: '2px 0px',
    marginTop: '-10px',
  },
  chevronDownIcon: {
    fontSize: '20px',
  },
}));

const NavBarListItem: FC<Props> = ({ routeList }) => {
  const classes = useStyles();
  const { name, dropdownList, url } = routeList;

  const [showPopover, setShowPopover] = useState(false);
  const anchorEl = useRef(null);

  const popoverEnter = () => {
    setShowPopover(true);
  };

  const popoverLeave = () => {
    setShowPopover(false);
  };

  const isLinkTextActive = url && window.location.pathname === url;
  const buttonLinkProps = dropdownList
    ? {
        onMouseEnter: popoverEnter,
        onMouseLeave: popoverLeave,
        endIcon: <ChevronDownIcon className={classes.chevronDownIcon} fontSize="inherit" />,
      }
    : { component: 'a', href: url };

  return (
    <>
      <Grid item>
        <Button
          disableRipple
          ref={anchorEl}
          className={clsx(classes.linkText, {
            [classes.linkTextActive]: isLinkTextActive,
          })}
          {...buttonLinkProps}
        >
          {name}
        </Button>
      </Grid>
      {dropdownList && (
        <Menu
          onMouseEnter={popoverEnter}
          onMouseLeave={popoverLeave}
          open={showPopover}
          anchorEl={anchorEl.current}
          className={classes.menu}
          getContentAnchorEl={null}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'center',
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'center',
          }}
          elevation={0}
          PaperProps={{
            className: classes.menuList,
          }}
        >
          {dropdownList.map((props) => (
            <MenuItem
              className={classes.popperLink}
              key={props.name}
              button
              disableRipple
              component="a"
              href={props.url}
            >
              <ListItemText
                primary={props.name}
                primaryTypographyProps={{ color: 'inherit', variant: 'inherit' }}
              />
            </MenuItem>
          ))}
        </Menu>
      )}
    </>
  );
};

export default NavBarListItem;
