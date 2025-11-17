"use client";

import { useState } from "react";
import { Button, ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

interface Ripple {
  x: number;
  y: number;
  id: number;
}

export function RippleButton({ 
  children, 
  className, 
  onClick, 
  disabled,
  ...props 
}: ButtonProps) {
  const [ripples, setRipples] = useState<Ripple[]>([]);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const newRipple: Ripple = { x, y, id: Date.now() };
    setRipples((prev) => [...prev, newRipple]);
    
    // Remove ripple after animation completes
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== newRipple.id));
    }, 600);
    
    // Call original onClick handler
    onClick?.(e);
  };

  return (
    <Button
      onClick={handleClick}
      disabled={disabled}
      className={cn("relative overflow-hidden", className)}
      {...props}
    >
      {children}
      {ripples.map((ripple) => (
        <span
          key={ripple.id}
          className="absolute rounded-full bg-white/30 animate-ripple pointer-events-none"
          style={{
            left: ripple.x - 100,
            top: ripple.y - 100,
          }}
        />
      ))}
    </Button>
  );
}
