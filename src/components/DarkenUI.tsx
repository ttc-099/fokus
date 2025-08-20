// DarkenUI.tsx
interface DarkenUIProps {
  isActive: boolean;
  onClick?: () => void;
}

export default function DarkenUI({ isActive, onClick }: DarkenUIProps) {
  return (
    <div 
      className={`darken-ui ${isActive ? 'active' : ''}`}
      onClick={onClick}
    />
  );
}