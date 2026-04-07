declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  // biome-ignore lint/suspicious/noExplicitAny: standard Vue SFC shim
  const component: DefineComponent<object, object, any>;
  export default component;
}
