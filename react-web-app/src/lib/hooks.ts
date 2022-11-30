import { useEffect, useRef, useState } from 'react';
import { debounce } from 'lodash';
import { useTheme } from '@material-ui/core';
import smoothscroll from 'smoothscroll-polyfill';

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export const usePrevious = <T>(value: T): T | undefined => {
  const ref = useRef<T>();
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
};

export function useWindowSize() {
  const [height, setHeight] = useState<number>(0);
  const [width, setWidth] = useState<number>(0);

  useEffect(() => {
    function handleResize() {
      setHeight(window.innerHeight);
      setWidth(window.innerWidth);
    }
    const debounceHandleResize = debounce(handleResize, 100);

    window.addEventListener('resize', debounceHandleResize);
    debounceHandleResize();
    return () => window.removeEventListener('resize', debounceHandleResize);
  }, []);

  return { height, width };
}

export function useIsMobile() {
  const { width } = useWindowSize();
  const { breakpoints } = useTheme();

  return width < breakpoints.width('sm');
}

export function useScrollToElement() {
  const isMobile = useIsMobile();

  const block = isMobile ? 'start' : 'center';

  return (element: HTMLDivElement) => {
    smoothscroll.polyfill();
    element.scrollIntoView({ behavior: 'smooth', block });
  };
}
