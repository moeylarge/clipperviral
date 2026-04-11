import Link from "next/link";

type KickTagProps = {
  streamer: string;
};

export function KickTag({ streamer }: KickTagProps) {
  const normalized = streamer.trim().replace(/^[@/]+/, "").toLowerCase();
  const handle = normalized || "ninadrama";

  return (
    <section className="kick-banner" aria-label="Kick profile">
      <div className="kick-logo" aria-hidden="true">
        <svg viewBox="0 0 48 48" role="img" focusable="false">
          <path d="M8 6h15v12h5V6h12v13h-6v10h6v13H28V30h-5v12H8V6Z" />
        </svg>
      </div>
      <Link href={`https://kick.com/${handle}`} target="_blank" rel="noreferrer">
        kick.com/{handle}
      </Link>
    </section>
  );
}
