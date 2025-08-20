// WhiteInfoBox.tsx
import type { ReactNode } from "react";

interface WhiteInfoBoxProps {
  isOpen: boolean;
  children: ReactNode;
}

export default function WhiteInfoBox({ isOpen, children }: WhiteInfoBoxProps) {
  return (
    <div className={`white-info-box ${isOpen ? 'open' : ''}`}>
      {children}
    </div>
  );
}