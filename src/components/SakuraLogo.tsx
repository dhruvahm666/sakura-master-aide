import sakuraIcon from "@/assets/sakura-avatar.png";

interface Props {
  size?: number;
  className?: string;
  spin?: boolean;
}

export function SakuraLogo({ size = 28, className = "", spin = false }: Props) {
  return (
    <img
      src={sakuraIcon}
      alt="Sakura"
      width={size}
      height={size}
      loading="lazy"
      className={`inline-block drop-shadow-[0_2px_8px_rgba(244,167,185,0.45)] ${spin ? "sakura-spin" : ""} ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
