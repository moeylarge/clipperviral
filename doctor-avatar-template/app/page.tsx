export default function HomePage() {
  return (
    <main className="private-shell">
      <section className="private-panel" style={{ padding: "32px" }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "#8a80ad" }}>For Mark</p>
        <h1 style={{ margin: "14px 0 0", fontSize: "clamp(2rem, 5vw, 3.8rem)", lineHeight: 0.96 }}>This page opens through a private link.</h1>
        <p style={{ margin: "16px 0 0", maxWidth: 620, fontSize: 18, lineHeight: 1.6, color: "#665f8d" }}>
          The main kids site is not connected to this deployment. Use the direct private route to open Mark&apos;s voice and video session.
        </p>
      </section>
    </main>
  );
}
