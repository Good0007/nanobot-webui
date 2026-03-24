import { startTransition } from "react";
import { Link, type LinkProps, useNavigate } from "react-router-dom";

/**
 * Drop-in replacement for <Link> that wraps navigation in startTransition.
 * This prevents the Suspense fallback from flashing when lazy-loaded page
 * chunks are still loading — React keeps showing the previous page until
 * the new chunk is ready, then switches atomically.
 */
export function TransitionLink({ to, onClick, ...props }: LinkProps & { to: string }) {
  const navigate = useNavigate();
  return (
    <Link
      to={to}
      {...props}
      onClick={(e) => {
        e.preventDefault();
        onClick?.(e);
        startTransition(() => navigate(to));
      }}
    />
  );
}
