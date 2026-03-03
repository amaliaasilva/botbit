"use client";

import { clsx } from "clsx";

/**
 * Button — consistent action trigger
 * @param {object} props
 * @param {"default"|"primary"|"danger"|"primary-sm"|"danger-sm"} [props.variant]
 * @param {string} [props.className]
 * @param {React.ReactNode} props.children
 */
export default function Button({ variant = "default", className, children, ...rest }) {
  const variantCls = {
    default: "btn",
    primary: "btn btn-primary",
    danger: "btn btn-danger",
    "primary-sm": "btn-primary-sm",
    "danger-sm": "btn-danger-sm",
  };
  return (
    <button className={clsx(variantCls[variant] || "btn", className)} {...rest}>
      {children}
    </button>
  );
}
