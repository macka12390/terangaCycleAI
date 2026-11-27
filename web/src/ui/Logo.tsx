// Logo TerangaCycle AI : un repère de carte (je signale ici) dont la tête porte une boucle de
// recyclage (la matière repart dans le cycle). Source : docs/brand/make_logo.py ; couleurs
// des jetons de src/theme/theme.css. Décoratif par défaut ; `title` le rend lisible.

export function Logo({ className = 'size-8', title }: { className?: string; title?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <rect width="512" height="512" rx="112" fill="var(--color-brand-900)" />
      <path d="M256 468 L134.9 302.6 A150 150 0 1 1 377.1 302.6 Z" fill="var(--color-brand-600)" />
      <circle cx="256" cy="214" r="104" fill="var(--color-mint)" />
      <path
        d="M194.0 191.4 A66 66 0 0 1 298.5 163.5"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="22"
        strokeLinecap="round"
      />
      <path
        d="M330.5 190.4 L314.7 144.1 L282.2 182.8 Z"
        fill="var(--color-accent)"
        stroke="var(--color-accent)"
        strokeWidth="5.5"
        strokeLinejoin="round"
      />
      <path
        d="M318.0 236.6 A66 66 0 0 1 213.5 264.5"
        fill="none"
        stroke="var(--color-brand-600)"
        strokeWidth="22"
        strokeLinecap="round"
      />
      <path
        d="M181.5 237.6 L197.3 283.9 L229.8 245.2 Z"
        fill="var(--color-brand-600)"
        stroke="var(--color-brand-600)"
        strokeWidth="5.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}
