import Link from "next/link";

export default function Header() {
  return (
    <header className="border-b border-neutral-200">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
        <Link href="/" className="font-bold tracking-tight">LIE DETECTOR</Link>
        <nav className="flex gap-4 text-sm text-neutral-600">
          <Link href="/">박제</Link>
          <Link href="/search">검색</Link>
        </nav>
      </div>
    </header>
  );
}
