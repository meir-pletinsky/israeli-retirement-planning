/** A short name for this browser and system, e.g. "Edge on Windows", to tell devices apart in a prompt. */
export function describeDevice(userAgent: string): string {
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\//.test(userAgent)
      ? "Opera"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Chrome\//.test(userAgent)
          ? "Chrome"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "Browser";
  const system = /Android/.test(userAgent)
    ? "Android"
    : /iPhone|iPad|iPod/.test(userAgent)
      ? "iOS"
      : /Windows/.test(userAgent)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(userAgent)
          ? "Mac"
          : /CrOS/.test(userAgent)
            ? "ChromeOS"
            : /Linux/.test(userAgent)
              ? "Linux"
              : null;
  return system ? `${browser} on ${system}` : browser;
}
