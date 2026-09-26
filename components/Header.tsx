import Link from "next/link";

export default function Header() {
  return (
    <header className="border-b border-neutral-200">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-6 lg:px-8 lg:py-6">
        <Link href="/" className="text-lg font-bold tracking-tight">LIE DETECTOR</Link>
        <nav className="flex gap-5 text-base text-neutral-600 lg:gap-7">
          <Link href="/">박제</Link>
          <Link href="/search">검색</Link>
        </nav>
      </div>
    </header>
  );
}
