import { useMemo } from "react";

interface Props { count?: number }

export function PetalRain({ count = 14 }: Props) {
  const petals = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 18,
        duration: 14 + Math.random() * 16,
        size: 8 + Math.random() * 12,
      })),
    [count]
  );

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden z-0">
      {petals.map((p) => (
        <span
          key={p.id}
          className="petal"
          style={{
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            width: p.size,
            height: p.size,
          }}
        />
      ))}
    </div>
  );
}
