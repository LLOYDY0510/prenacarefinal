'use client';

import { useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from './Modal';

type Decision = { title: string; description: string; confirmText?: string };

export function useConfirmation() {
  const [decision, setDecision] = useState<Decision | null>(null);
  const resolve = useRef<((answer: boolean) => void) | null>(null);
  useEffect(() => () => { resolve.current?.(false); }, []);

  function finish(answer: boolean) {
    const complete = resolve.current;
    resolve.current = null;
    setDecision(null);
    complete?.(answer);
  }

  function confirm(options: Decision) {
    if (resolve.current) return Promise.resolve(false);
    setDecision(options);
    return new Promise<boolean>(complete => { resolve.current = complete; });
  }

  const confirmation = <ConfirmDialog isOpen={decision !== null} title={decision?.title ?? 'Confirm action'}
    description={decision?.description ?? ''} confirmText={decision?.confirmText}
    onClose={() => finish(false)} onConfirm={() => finish(true)}/>;
  return { confirm, confirmation };
}
