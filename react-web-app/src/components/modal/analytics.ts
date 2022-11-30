import { useRef, useEffect } from 'react';
import { AnalyticsData } from 'typings/analytics';
import { usePrevious } from 'lib/hooks';
import { trackEvent } from 'lib/analytics';

export type ModalAnalyticsEvent =
  | {
      eventName: string;
      params?: AnalyticsData;
    }
  | string;

export type ModalAnalyticsProps = {
  openEvent?: ModalAnalyticsEvent;
  closeEvent?: ModalAnalyticsEvent;
};

const track = (event: ModalAnalyticsEvent, data?: AnalyticsData) => {
  if (typeof event === 'string') {
    trackEvent(event, data);
  } else if (typeof event === 'object') {
    const { eventName, params } = event;
    trackEvent(eventName, { ...params, ...data });
  }
};

type UseModalAnalyticsProps = {
  showModal: boolean;
  openEvent?: ModalAnalyticsEvent;
  closeEvent?: ModalAnalyticsEvent;
  data?: AnalyticsData;
};

export function useModalAnalytics({
  showModal,
  openEvent,
  closeEvent,
  data,
}: UseModalAnalyticsProps) {
  const prevShowModal = usePrevious(showModal);

  const isDismissing = useRef(false);
  useEffect(() => {
    return () => {
      isDismissing.current = true;
    };
  }, []);

  useEffect(() => {
    if (openEvent && showModal && !prevShowModal) {
      track(openEvent, data);
    } else if (closeEvent && !showModal && prevShowModal) {
      track(closeEvent, data);
    }

    // close event tracked on unmount to capture even when closed by navigation
    return () => {
      if (closeEvent && showModal && isDismissing.current) {
        track(closeEvent, data);
      }
    };
  }, [openEvent, closeEvent, showModal, prevShowModal, data, isDismissing]);
}
