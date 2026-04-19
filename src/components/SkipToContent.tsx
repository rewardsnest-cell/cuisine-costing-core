/**
 * Skip-to-content link for keyboard/screen-reader users.
 * Visually hidden until focused, then jumps focus to #main-content.
 */
export function SkipToContent() {
  return (
    <a
      href="#main-content"
      className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-[100] focus-visible:bg-foreground focus-visible:text-background focus-visible:px-4 focus-visible:py-2 focus-visible:rounded-md focus-visible:text-sm focus-visible:font-semibold focus-visible:shadow-lg"
    >
      Skip to main content
    </a>
  );
}
