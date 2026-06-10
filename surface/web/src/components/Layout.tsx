/**
 * Site chrome: skip link, header nav, main landmark, footer. On route
 * change, focus moves to the main landmark (screen-reader + keyboard
 * users land at the new content, not stranded in the nav).
 */
import { useEffect, useRef } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

const NAV = [
  { to: "/", label: "Home", end: true },
  { to: "/bodies", label: "Bodies" },
  { to: "/issues", label: "Issues" },
  { to: "/domains", label: "Domains" },
  { to: "/search", label: "Search" },
  { to: "/about", label: "About" },
];

export function Layout() {
  const location = useLocation();
  const mainRef = useRef<HTMLElement | null>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.focus();
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="site-header">
        <div className="container site-header-inner">
          <NavLink to="/" className="site-logo">
            <span className="logo-mark" aria-hidden="true">
              ⚖
            </span>
            <span>Woven Boulder</span>
          </NavLink>
          <nav className="site-nav" aria-label="Main">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end === true}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main id="main" className="container" tabIndex={-1} ref={mainRef}>
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="container">
          <p>
            Meeting records sourced from the{" "}
            <a href="https://www.youtube.com/@CityofBoulder" rel="noopener noreferrer">
              City of Boulder YouTube channel
            </a>
            . An independent civic resource — not affiliated with the City of Boulder.
          </p>
          <p>
            Summaries are AI-generated; transcripts are automated.{" "}
            <NavLink to="/about">How this site works</NavLink> · You can also{" "}
            <NavLink to="/about">query the record yourself</NavLink> over MCP.
          </p>
        </div>
      </footer>
    </>
  );
}
