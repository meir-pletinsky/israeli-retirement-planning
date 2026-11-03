/** Replaced at build time by `define` in vite.config.ts. */
declare const __BUILD_COMMIT__: string;
declare const __BUILD_TIME__: string;

export const BUILD_COMMIT: string = __BUILD_COMMIT__;
/** ISO timestamp of the build, which is when this version was deployed. */
export const BUILD_TIME: string = __BUILD_TIME__;
