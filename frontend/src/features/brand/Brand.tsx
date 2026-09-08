export const PRODUCT_NAME = "MyPDFChat";
const LOGO_SRC = "/logo/Horizontal%20Logo.png";

interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className = "h-16 w-auto" }: BrandMarkProps) {
  return (
    <img
      className={className}
      src={LOGO_SRC}
      alt=""
      aria-hidden="true"
    />
  );
}

interface BrandNameProps {
  className?: string;
}

export function BrandName({ className = "inline whitespace-nowrap font-extrabold leading-none text-ink" }: BrandNameProps) {
  return (
    <span className={className} aria-label={PRODUCT_NAME}>
      <span>My</span>
      <span className="text-sea">PDF</span>
      <span>Chat</span>
    </span>
  );
}

interface BrandLockupProps {
  markClassName?: string;
}

export function BrandLockup({ markClassName }: BrandLockupProps) {
  return (
    <span className="flex min-w-0 items-center">
      <BrandMark className={markClassName ?? "h-16 w-auto max-w-[240px] object-contain"} />
      <span className="sr-only">{PRODUCT_NAME}</span>
    </span>
  );
}
