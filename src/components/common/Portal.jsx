// Portal.jsx — renders children outside the map stacking context
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function Portal({ children }) {
  const el = useRef(document.createElement('div'));

  useEffect(() => {
    const container = el.current;
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '0';
    container.style.height = '0';
    container.style.zIndex = '9999';
    container.style.overflow = 'visible';
    document.body.appendChild(container);
    return () => document.body.removeChild(container);
  }, []);

  return createPortal(children, el.current);
}
