'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext<(msg: string) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState('');
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((m: string) => {
    setMsg(m);
    setShow(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(false), 2800);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed inset-x-0 bottom-6 z-[9999] flex justify-center px-4 pointer-events-none">
        <div
          aria-live="polite"
          className={`max-w-[calc(100%-2rem)] bg-ink text-white px-4.5 py-2 rounded-full text-[12.5px] text-center shadow-lg transition duration-200 ${
            show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
          }`}
        >
          {msg}
        </div>
      </div>
    </ToastContext.Provider>
  );
}
