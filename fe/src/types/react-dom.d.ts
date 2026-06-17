declare module 'react-dom/client' {
  import type { ReactNode } from 'react';

  interface Root {
    render(children: ReactNode): void;
    unmount(): void;
  }

  export function createRoot(container: Element | DocumentFragment | null): Root;
  export function hydrateRoot(container: Element | DocumentFragment, children: ReactNode): Root;
}
