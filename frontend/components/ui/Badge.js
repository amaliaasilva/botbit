"use client";

import { clsx } from "clsx";

/**
 * Badge — semantic label
 * @param {object} props
 * @param {"buy"|"wait"|"avoid"|"p0"|"p1"|"p2"|"p3"} [props.variant]
 * @param {string} [props.className]
 * @param {React.ReactNode} props.children
 */
export default function Badge({ variant, className, children, ...rest }) {
  const cls = clsx(
    variant === "p0" ? "badge-p0" :
    variant === "p1" ? "badge-p1" :
    variant === "p2" ? "badge-p2" :
    variant === "p3" ? "badge-p3" :
    `badge ${variant || "wait"}`,
    className
  );
  return <span className={cls} {...rest}>{children}</span>;
}
