import { useState } from "react";
import { useAsset } from "@/lib/use-asset";
import { cn } from "@/lib/utils";

interface Props {
  /** site_asset_manifest slug */
  slug: string;
  alt: string;
  className?: string;
  /** Optional fallback image URL if the slug fails to resolve */
  fallbackUrl?: string;
  loading?: "eager" | "lazy";
  /** Tailwind classes for the wrapper (controls aspect / sizing) */
  wrapperClassName?: string;
  /** Skeleton tone */
  tone?: "light" | "dark";
}

/**
 * SSR-friendly site asset image with built-in skeleton + fallback.
 * Resolves slug → public_url via useAsset (TanStack Query).
 */
export function SiteAssetImage({
  slug,
  alt,
  className,
  fallbackUrl,
  loading = "lazy",
  wrapperClassName,
  tone = "light",
}: Props) {
  const { url, loading: isLoading } = useAsset(slug);
  const [imgError, setImgError] = useState(false);
  const resolved = (!imgError && url) || fallbackUrl || null;
  const showSkeleton = !resolved && (isLoading || (!url && !fallbackUrl));

  return (
    <div className={cn("relative overflow-hidden", wrapperClassName)}>
      {showSkeleton && (
        <div
          className={cn(
            "absolute inset-0 animate-pulse",
            tone === "dark" ? "bg-foreground/20" : "bg-muted",
          )}
          aria-hidden="true"
        />
      )}
      {resolved && (
        <img
          src={resolved}
          alt={alt}
          loading={loading}
          decoding="async"
          onError={() => setImgError(true)}
          className={cn("w-full h-full object-cover", className)}
        />
      )}
    </div>
  );
}
