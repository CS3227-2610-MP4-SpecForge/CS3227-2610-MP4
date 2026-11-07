import Link from "next/link";
export default function Home() {
  return <section className="hero">
    <p className="eyebrow">A shared starting point</p>
    <h1>Good software starts<br />with clear requirements.</h1>
    <p className="lede">Bring Product Managers and Developers into one organisation workspace. Give your next idea a place to take shape.</p>
    <div className="actions"><Link className="button" href="/sign-up">Create an account <span aria-hidden="true">↗</span></Link><Link className="button secondary" href="/sign-in">Sign in</Link></div>
    <div className="hero-note"><span className="status-dot" aria-hidden="true" />One workspace. Two perspectives.</div>
  </section>;
}
