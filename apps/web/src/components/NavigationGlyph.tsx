import type { NavigationIconName } from './navigation'

const paths: Record<NavigationIconName, React.ReactNode> = {
  home: <path d="M3.5 9.2 10 3.7l6.5 5.5v7.1H12v-4.5H8v4.5H3.5Z" />,
  library: (
    <>
      <path d="M3.5 4.2h3.2v11.6H3.5zM8.4 4.2h3.2v11.6H8.4z" />
      <path d="m13.4 4.8 2.7-.7 2.7 10.9-2.7.7z" />
    </>
  ),
  shelves: (
    <>
      <path d="M3 5h14M3 10h14M3 15h14" />
      <path d="M5 3v4M10 8v4M15 13v4" />
    </>
  ),
  series: (
    <>
      <rect x="3.5" y="4" width="5" height="12" rx="0.8" />
      <rect x="11.5" y="4" width="5" height="12" rx="0.8" />
      <path d="M6 7h.01M14 7h.01M6 13h.01M14 13h.01" />
    </>
  ),
  tropes: (
    <>
      <path d="M10 16.5V9.8M10 10c-3.2-.1-5.3-1.8-5.5-5.3 3.5.2 5.3 2.2 5.5 5.3Z" />
      <path d="M10 12.7c3.2-.1 5.3-1.8 5.5-5.3-3.5.2-5.3 2.2-5.5 5.3Z" />
    </>
  ),
  planner: (
    <>
      <rect x="3.5" y="5" width="13" height="11" rx="1.5" />
      <path d="M6.5 3.5v3M13.5 3.5v3M3.5 8.5h13M7 11h2M11 11h2M7 13.5h2" />
    </>
  ),
  stats: (
    <>
      <path d="M4 16V9.5h3V16M8.5 16V5h3v11M13 16v-8h3v8M3 16.5h14" />
    </>
  ),
  match: <path d="M10 3.2 11.6 8l5.2 2-5.2 2-1.6 4.8L8.4 12l-5.2-2 5.2-2L10 3.2Z" />,
  discover: (
    <>
      <circle cx="10" cy="10" r="6.5" />
      <path d="m12.8 7.2-1.4 4.2-4.2 1.4 1.4-4.2 4.2-1.4Z" />
    </>
  ),
  clubs: (
    <>
      <path d="M6.7 9.2a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4ZM13.5 10a2.2 2.2 0 1 0 0-4.4" />
      <path d="M2.8 16.2c.2-3 1.5-4.7 4-4.7s3.8 1.7 4 4.7M12 12c3-.4 4.7 1 5.2 4.2" />
    </>
  ),
  indies: (
    <>
      <path d="M4 16V5.5l6-2 6 2V16" />
      <path d="M7 7.5h6M7 10.5h6M7 13.5h2M11 13.5h2" />
    </>
  ),
  skins: (
    <>
      <path d="M10 3.5a6.5 6.5 0 1 0 6.5 6.5c0-1.2-.8-1.8-1.8-1.8H13a1.8 1.8 0 0 1-1.8-1.8V4.7c0-.7-.5-1.2-1.2-1.2Z" />
      <path d="M6.2 8h.01M6.8 12h.01M10 14h.01" />
    </>
  ),
  settings: (
    <>
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 3.2v2M10 14.8v2M3.2 10h2M14.8 10h2M5.2 5.2l1.4 1.4M13.4 13.4l1.4 1.4M14.8 5.2l-1.4 1.4M6.6 13.4l-1.4 1.4" />
    </>
  ),
}

export function NavigationGlyph({
  name,
  className = '',
}: {
  name: NavigationIconName
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {paths[name]}
    </svg>
  )
}
