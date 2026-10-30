export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden="true">
        <rect x="1" y="1" width="30" height="30" rx="7" className="fill-foreground" />
        <path
          d="M9 23v-5h5v-5h5V9h4"
          fill="none"
          className="stroke-background"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="9" cy="23" r="2.2" className="fill-background" />
      </svg>
      <span className="font-display text-[1.7rem] leading-none font-extrabold tracking-tight">Fight Club</span>
    </div>
  )
}
