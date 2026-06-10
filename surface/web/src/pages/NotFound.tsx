/** 404 — also rendered when a detail page can't resolve its record. */
import { Link } from "react-router-dom";
import { usePageTitle } from "../lib/usePageTitle.ts";

export function NotFound() {
  usePageTitle("Not found");
  return (
    <div className="notfound">
      <h1>Not found</h1>
      <p>
        That page isn't in the record. Try the <Link to="/">home page</Link>,{" "}
        <Link to="/bodies">governing bodies</Link>, or <Link to="/search">search</Link>.
      </p>
    </div>
  );
}
