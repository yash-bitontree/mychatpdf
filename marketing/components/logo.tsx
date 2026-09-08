import Image from "next/image";

export const PRODUCT_NAME = "MyPDFChat";

export default function Logo({ className = "h-10 w-auto" }: { className?: string }) {
  return (
    <Image
      src="/logo-horizontal.png"
      alt={PRODUCT_NAME}
      width={4001}
      height={1146}
      priority
      className={className}
    />
  );
}
