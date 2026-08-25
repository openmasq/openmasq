/// <reference types="vite/client" />

import type { OpenMasqApi } from "../../preload/index";

declare global {
  interface Window {
    openmasq: OpenMasqApi;
  }
}
