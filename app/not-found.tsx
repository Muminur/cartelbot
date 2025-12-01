import Link from "next/link";

// Force dynamic rendering to prevent Next.js 16 Turbopack prerendering bug
export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <html lang="en">
      <head>
        <title>404 - Page Not Found | CartelBot</title>
      </head>
      <body>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            padding: "20px",
            fontFamily: "system-ui, sans-serif",
            backgroundColor: "#f9fafb",
          }}
        >
          <div
            style={{
              maxWidth: "500px",
              width: "100%",
              backgroundColor: "white",
              padding: "32px",
              borderRadius: "12px",
              boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
              textAlign: "center",
            }}
          >
            <h1
              style={{
                fontSize: "72px",
                fontWeight: "bold",
                marginBottom: "16px",
                color: "#0070f3",
              }}
            >
              404
            </h1>
            <h2
              style={{
                fontSize: "24px",
                fontWeight: "bold",
                marginBottom: "16px",
              }}
            >
              Page Not Found
            </h2>
            <p
              style={{
                color: "#666",
                marginBottom: "24px",
              }}
            >
              The page you are looking for doesn't exist or has been moved.
            </p>
            <Link
              href="/"
              style={{
                display: "inline-block",
                padding: "12px 24px",
                backgroundColor: "#0070f3",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "16px",
                fontWeight: "600",
                textDecoration: "none",
              }}
            >
              Go Home
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
