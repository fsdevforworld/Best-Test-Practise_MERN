import React, { FunctionComponent, ReactNode, useState, useEffect } from 'react';
import ReactModal from 'react-modal';
import Swiper, { SwiperInstance } from 'react-id-swiper';
import classNames from 'classnames';

import { trackEvent } from 'lib/analytics';
import { usePrevious } from 'lib/hooks';
import {
  ModalAnalyticsEvent,
  ModalAnalyticsProps,
  useModalAnalytics,
} from 'components/modal/analytics';
import Icon from 'components/icon';
import { ModalProps } from 'components/modal';

import styles from './index.module.css';
import 'react-id-swiper/lib/styles/css/swiper.css';

export type SwipeElement = {
  body: string;
  image: ReactNode;
  title: string;
} & ModalAnalyticsProps;

type Props = {
  elements: SwipeElement[];
  slideChangedEvent?: ModalAnalyticsEvent;
} & ModalProps;

const Modal: FunctionComponent<Props> = ({
  elements,
  showModal,
  onClose,
  openEvent,
  closeEvent,
  slideChangedEvent,
}) => {
  const [swiper, updateSwiper] = useState(null);
  const [currentSlide, setCurrentSlide] = useState<SwipeElement>(elements[0]);
  const prevSlide = usePrevious<SwipeElement>(currentSlide);

  // open/close analytics
  useModalAnalytics({
    showModal,
    openEvent,
    closeEvent,
    data: {
      title: currentSlide.title,
    },
  });

  // slide changed analytics
  useEffect(() => {
    if (
      slideChangedEvent &&
      currentSlide &&
      showModal &&
      prevSlide &&
      prevSlide.title !== currentSlide.title
    ) {
      if (typeof slideChangedEvent === 'string') {
        trackEvent(slideChangedEvent, { title: currentSlide.title });
      } else if (typeof slideChangedEvent === 'object') {
        trackEvent(slideChangedEvent.eventName, {
          ...slideChangedEvent.params,
          title: currentSlide.title,
        });
      }
    }
  }, [currentSlide, slideChangedEvent, showModal, prevSlide]);

  useEffect(() => {
    if (swiper !== null) {
      const asSwiper = swiper as SwiperInstance;
      asSwiper.on('slideChange', () => setCurrentSlide(elements[asSwiper.realIndex]));
    }
  }, [swiper, elements]);

  const params = {
    centeredSlides: true,
    getSwiper: updateSwiper,
    grabCursor: true,
    keyboard: {
      enabled: true,
      onlyInViewport: false,
    },
    navigation: {
      nextEl: `.${styles.swiperButtonNext}`,
      prevEl: `.${styles.swiperButtonPrevious}`,
      disabledClass: styles.swiperButtonDisabled,
    },
    pagination: {
      el: '.swiper-pagination',
      clickable: true,
      bulletClass: styles.swiperPaginationBullet,
      bulletActiveClass: styles.swiperPaginationBulletActive,
    },
    renderNextButton: () => (
      <button type="button" className={styles.swiperButtonNext}>
        <Icon styles={styles.errorIcon} name="arrowRight" fill="black" />
      </button>
    ),
    renderPrevButton: () => (
      <button type="button" className={styles.swiperButtonPrevious}>
        <Icon styles={styles.errorIcon} name="arrowLeft" fill="black" />
      </button>
    ),
  };

  return (
    <ReactModal
      overlayClassName={styles.modal}
      className={styles.content}
      isOpen={showModal}
      ariaHideApp={false}
      onRequestClose={onClose}
    >
      <>
        <div className={styles.header}>
          <Icon styles={styles.headerIcon} name="x" onClick={onClose} />
        </div>
        <Swiper {...params}>
          {elements.map((item) => (
            <div key={item.title} className={styles.slide}>
              <div className={styles.image}>{item.image}</div>
              <h1 className={classNames([styles.title, 'title-3'])}>{item.title}</h1>
              <p className={classNames([styles.body, 'body-4'])}>{item.body}</p>
            </div>
          ))}
        </Swiper>
      </>
    </ReactModal>
  );
};

export default Modal;
