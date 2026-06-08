import logoSrc from "@/assets/logo.png";

export function Logo({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src={logoSrc}
      width={size}
      height={size}
      alt="Bharat Auto Parts"
      className={className}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}
