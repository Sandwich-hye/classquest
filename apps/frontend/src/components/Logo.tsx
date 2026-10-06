/** ClassQuest logo motif: a ring with a route leading to an amber flag (blue-first palette). */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 100 100" fill="none" aria-label="ClassQuest" role="img">
      <circle cx="50" cy="50" r="40" stroke="#0e9be0" strokeWidth="10" fill="none" />
      <path d="M30 72 C 40 58, 42 48, 55 42 S 66 34, 66 26" stroke="#7fd0f5" strokeWidth="9" strokeLinecap="round" fill="none" />
      <path d="M66 22 L80 28 L66 34 Z" fill="#f5b800" />
    </svg>
  );
}
