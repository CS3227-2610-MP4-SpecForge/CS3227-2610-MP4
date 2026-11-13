import type { ComponentProps } from "react";
export function Button({ className = "", ...props }: ComponentProps<"button">) {
  return <button className={`button ${className}`} {...props} />;
}
