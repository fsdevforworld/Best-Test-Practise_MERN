import { makeStyles, Theme } from '@material-ui/core';
import { PlayButtonIcon } from 'img/icon/v2';
import { JDThumb } from 'img/influencer';
import { JDPromoVideo } from 'img/video';
import React, { FC, SyntheticEvent, useState } from 'react';
import ReactPlayer from 'react-player';

const useStyles = makeStyles((theme: Theme) => ({
  container: {
    position: 'relative',
    width: '100%',
    maxWidth: '500px',
    paddingTop: 'calc(1920 / 1080 * 100%)',
    cursor: 'pointer',
    outline: 'none',
    borderRadius: '20px',
    '&:focus': {
      boxShadow: `0 0 0 1pt ${theme.palette.grey['50']}`,
    },
  },
  thumbnail: {
    width: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    borderRadius: '20px',
  },
  player: {
    position: 'absolute',
    top: 0,
    left: 0,
    outline: 'none',
    zIndex: ({ isThumbnailShowing }: { isThumbnailShowing: boolean }) =>
      isThumbnailShowing ? -1 : 0,
  },
  video: {
    borderRadius: '20px',
  },
  playIcon: {
    cursor: 'pointer',
    position: 'absolute',
    zIndex: 1,
    top: 'calc(50% - 45px)',
    left: 'calc(50% - 45px)',
    width: '90px',
    height: '90px',
    [theme.breakpoints.down('md')]: {
      width: '70px',
      height: '70px',
      top: 'calc(50% - 35px)',
      left: 'calc(50% - 35px)',
    },
    [theme.breakpoints.down('xs')]: {
      width: '60px',
      height: '60px',
      top: 'calc(50% - 30px)',
      left: 'calc(50% - 30px)',
    },
  },
}));

const Video: FC = () => {
  const [isThumbnailShowing, setIsThumbnailShowing] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);

  const classes = useStyles({ isThumbnailShowing });

  const handleContainerClick = (event: SyntheticEvent) => {
    event.preventDefault();
    setIsThumbnailShowing(false);
    setIsPlaying((previous) => !previous);
  };

  return (
    <div
      role="button"
      className={classes.container}
      onClick={handleContainerClick}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          handleContainerClick(event);
        }
      }}
    >
      {isThumbnailShowing && (
        <img alt="jason-derulo-promo" src={JDThumb} className={classes.thumbnail} />
      )}
      <ReactPlayer
        className={classes.player}
        url={JDPromoVideo}
        playing={isPlaying}
        onEnded={() => setIsPlaying(false)}
        width="100%"
        height="100%"
        config={{
          file: {
            attributes: {
              className: classes.video,
              playsInline: true,
            },
          },
        }}
      />

      {!isPlaying && <PlayButtonIcon className={classes.playIcon} />}
    </div>
  );
};

export default Video;
