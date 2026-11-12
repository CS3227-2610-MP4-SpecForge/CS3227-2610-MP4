import type { Metadata } from "next";
import Link from "next/link";
import { NotificationProvider } from "@/components/notifications";
import { AccountMenu } from "@/components/account-menu";
import { SessionBanner } from "@/components/session";
import "@daypicker/react/style.css";
import "./globals.css";
export const metadata: Metadata = { title: "SpecForge", description: "A shared home for clear software requirements." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <NotificationProvider>
          <a className="skip-link" href="#main">
            Skip to content
          </a>
          <header className="site-header">
            <div className="header-inner">
              <Link className="brand" href="/workspace" aria-label="SpecForge home">
                <span className="brand-mark" aria-hidden="true" />
                SpecForge
              </Link>
              <nav aria-label="Main navigation">
                <AccountMenu />
              </nav>
            </div>
          </header>
          <SessionBanner />
          <main id="main" className="main-container">
            {children}
          </main>
          <footer className="site-footer">
            SpecForge <span aria-hidden="true">·</span> Clear requirements. Shared understanding.
          </footer>
        </NotificationProvider>
      </body>
    </html>
  );
}
