/** The home-page search box — submits to /search?q=… */
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

export function SearchForm(props: { autoFocus?: boolean }) {
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const query = q.trim();
    if (query.length === 0) return;
    navigate(`/search?q=${encodeURIComponent(query)}`);
  }

  return (
    <form className="search-form" role="search" onSubmit={onSubmit}>
      <label className="visually-hidden" htmlFor="site-search">
        Search the civic record
      </label>
      <input
        id="site-search"
        type="search"
        placeholder="Search meetings and issues — housing, budget, flood…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus={props.autoFocus}
      />
      <button type="submit">Search</button>
    </form>
  );
}
