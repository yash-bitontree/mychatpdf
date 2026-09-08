// Stroke icon set for sections and pages. CMS content references icons by
// key (see SECTION_ICONS); unknown keys fall back to the chat icon.

type IconProps = { className?: string };

function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className ?? "h-6 w-6"}
    >
      {children}
    </svg>
  );
}

export function ChatIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
      <path d="M8.5 10.5h7M8.5 13.5h4.5" />
    </Svg>
  );
}

export function DocumentsIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M15 2H9a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7l-5-5Z" />
      <path d="M14 2v5h5M4 7v13a2 2 0 0 0 2 2h10" />
    </Svg>
  );
}

export function CitationIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.35-4.35M8.5 11l1.8 1.8 3.2-3.6" />
    </Svg>
  );
}

export function ShieldIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 22s8-3.5 8-9.5V5l-8-3-8 3v7.5C4 18.5 12 22 12 22Z" />
      <path d="m9 11.5 2 2 4-4.5" />
    </Svg>
  );
}

export function BoltIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" />
    </Svg>
  );
}

export function FolderIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4.6a2 2 0 0 1 1.6.8L11.8 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2Z" />
    </Svg>
  );
}

export function ArrowRightIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 12h16m-6-6 6 6-6 6" />
    </Svg>
  );
}

export function CheckIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m4.5 12.5 5 5 10-11" />
    </Svg>
  );
}

export function QuoteIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9.5 5.5C6.5 7 4.5 9.8 4.5 13.4c0 2.9 1.7 4.6 3.8 4.6 1.9 0 3.3-1.4 3.3-3.2 0-1.8-1.3-3-3-3-.3 0-.7 0-.8.1.3-1.9 1.9-3.9 3.7-4.9l-2-1.5Zm9 0c-3 1.5-5 4.3-5 7.9 0 2.9 1.7 4.6 3.8 4.6 1.9 0 3.3-1.4 3.3-3.2 0-1.8-1.3-3-3-3-.3 0-.7 0-.8.1.3-1.9 1.9-3.9 3.7-4.9l-2-1.5Z" />
    </Svg>
  );
}

export function MailIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </Svg>
  );
}

export function PhoneIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M21 16.9v2.6a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 2.5 5.2 2 2 0 0 1 4.5 3h2.6a2 2 0 0 1 2 1.7c.13.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.1L8.2 10.8a16 16 0 0 0 5 5l1.2-1.15a2 2 0 0 1 2.1-.45c.9.34 1.84.57 2.8.7a2 2 0 0 1 1.7 2Z" />
    </Svg>
  );
}

export function MapPinIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </Svg>
  );
}

export function PlusIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function StarIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className={className ?? "h-4 w-4"}>
      <path d="M10 1.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L10 14.9l-5.3 2.7 1-5.8-4.2-4.1 5.9-.9L10 1.5Z" />
    </svg>
  );
}

export const SECTION_ICONS: Record<string, (p: IconProps) => React.ReactNode> = {
  chat: ChatIcon,
  documents: DocumentsIcon,
  citation: CitationIcon,
  shield: ShieldIcon,
  bolt: BoltIcon,
  folder: FolderIcon,
};

export function sectionIcon(key: string | undefined, className?: string) {
  const Icon = (key && SECTION_ICONS[key]) || ChatIcon;
  return <Icon className={className} />;
}
