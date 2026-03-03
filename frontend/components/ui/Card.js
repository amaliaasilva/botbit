"use client";

import { clsx } from "clsx";

/**
 * Card — surface container V2
 * @param {object} props
 * @param {string} [props.variant] - default | soft-blue | soft-green | soft-purple
 * @param {string} [props.className]
 * @param {React.ReactNode} [props.children]
 */
export default function Card({ variant, className, children, ...rest }) {
  const cls = clsx(
    "card",
    variant === "soft-blue" && "card-soft-blue",
    variant === "soft-green" && "card-soft-green",
    variant === "soft-purple" && "card-soft-purple",
    className
  );
  return <div className={cls} {...rest}>{children}</div>;
}
