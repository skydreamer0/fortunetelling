/** 太極＋八角框品牌標誌；幾何與 public/icons/fortune-app-v1.svg 相同，只用在頁面裡（頁首、載入、安裝提示）。 */

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 128 128" aria-hidden="true" focusable="false">
      <rect width="128" height="128" rx="26" fill="#252947" />
      <g transform="translate(9 9) scale(.86)" fill="#D5B57A">
        <path d="M45 15 H83 L113 45 V83 L83 113 H45 L15 83 V45 Z" fill="none" stroke="#D5B57A" strokeWidth="8" strokeLinejoin="round" />
        <circle cx="64" cy="64" r="29" fill="none" stroke="#D5B57A" strokeWidth="5" />
        <path fillRule="evenodd" d="M64 35 A29 29 0 0 0 64 93 A14.5 14.5 0 0 0 64 64 A14.5 14.5 0 0 1 64 35 Z M70 78.5 A6 6 0 1 0 58 78.5 A6 6 0 1 0 70 78.5 Z" />
        <circle cx="64" cy="49.5" r="6" />
      </g>
    </svg>
  );
}
