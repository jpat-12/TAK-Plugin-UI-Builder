/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

interface ImportMetaEnv {
  /** "dev" for the dev preview build (served at /dev/); unset for the live site */
  readonly VITE_CHANNEL?: string;
}
