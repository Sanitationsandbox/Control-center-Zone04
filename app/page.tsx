import backgroundStyles from "./control-center/control-center.module.css";
import styles from "./home.module.css";
import Link from "next/link";

export default function Home() {
  return (
    <main 
      className={backgroundStyles.page} 
      style={{ 
        display: "flex", 
        flexDirection: "column", 
        justifyContent: "space-between", 
        minHeight: "100vh", 
        alignItems: "center", 
        padding: "4rem 2rem",
        textAlign: "center"
      }}
    >
      <div className={backgroundStyles.glow} aria-hidden="true" />
      
      {/* Top spacer to balance vertical layout */}
      <div style={{ height: "40px" }} />

      <h1 className={styles.title} style={{ textAlign: "center" }}>
        Zone 01
        <span style={{ display: "block", textAlign: "center" }}>Screen Control Center</span>
      </h1>

      {/* Footer Navigation */}
      <footer 
        style={{
          marginTop: "auto",
          display: "flex",
          gap: "1.5rem",
          fontSize: "0.9rem",
          fontFamily: "var(--font-geist-mono), monospace",
          color: "rgba(255, 255, 255, 0.4)",
          zIndex: 10
        }}
      >
        <Link href="/admin" style={{ color: "#8fffe9", textDecoration: "none", fontWeight: 500 }}>
          Admin Console
        </Link>
        <span>•</span>
        <Link href="/control-center" style={{ color: "#8fffe9", textDecoration: "none", fontWeight: 500 }}>
          Control Center
        </Link>
        <span>•</span>
        <Link href="/preview" target="_blank" rel="noopener noreferrer" style={{ color: "#8fffe9", textDecoration: "none", fontWeight: 500 }}>
          Preview Wall
        </Link>
      </footer>
    </main>
  );
}

