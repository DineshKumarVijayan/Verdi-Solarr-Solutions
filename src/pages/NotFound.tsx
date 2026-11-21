import { Link, useNavigate } from "react-router";
import { usePageMeta } from "../lib/seo";

export default function NotFound() {
  const nav = useNavigate();
  usePageMeta("Page not found", undefined, { noindex: true });
  return (
    <div className="container-x py-28 text-center max-lg:py-12">
      <p className="num text-7xl text-paper-3">404</p>
      <h1 className="mt-2 text-3xl font-semibold">This page went behind a cloud.</h1>
      <p className="mt-2 text-muted">The page you’re looking for doesn’t exist or has moved.</p>
      <form
        role="search"
        className="mx-auto mt-6 flex max-w-sm gap-2 lg:hidden"
        onSubmit={(e) => {
          e.preventDefault();
          const q = new FormData(e.currentTarget).get("q")?.toString().trim();
          nav(`/products${q ? `?q=${encodeURIComponent(q)}` : ""}`);
        }}
      >
        <label htmlFor="nf-q" className="sr-only">
          Search products
        </label>
        <input id="nf-q" name="q" className="field !rounded-full" placeholder="Search products" inputMode="search" enterKeyHint="search" />
        <button className="btn-primary tap shrink-0" type="submit">
          Search
        </button>
      </form>
      <div className="mt-6 flex justify-center gap-3">
        <Link to="/" className="btn-dark">
          Home
        </Link>
        <Link to="/products" className="btn-ghost">
          Browse products
        </Link>
      </div>
    </div>
  );
}
