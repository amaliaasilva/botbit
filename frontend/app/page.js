import Link from "next/link";

export default function HomePage() {
  return (
    <main className="container">
      <div className="card">
        <h1>BotBit</h1>
        <p>Sistema pessoal pro de scoring para Bitcoin e ações B3.</p>
        <Link href="/login">Ir para login</Link>
      </div>
    </main>
  );
}
