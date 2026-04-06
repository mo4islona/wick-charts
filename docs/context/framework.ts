import { createContext, useContext } from 'react';

export type Framework = 'react' | 'vue' | 'svelte';

export const FrameworkContext = createContext<{
  framework: Framework;
  setFramework: (v: Framework) => void;
}>({ framework: 'react', setFramework: () => {} });

export const FrameworkProvider = FrameworkContext.Provider;

export function useFramework(): [Framework, (v: Framework) => void] {
  const ctx = useContext(FrameworkContext);
  return [ctx.framework, ctx.setFramework];
}
