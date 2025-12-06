import Link from 'next/link';

function CoconutIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12.982 2.184a2.5 2.5 0 0 0-1.964 0l-5.5 3.175a2.5 2.5 0 0 0-1.25 2.165v6.352a2.5 2.5 0 0 0 1.25 2.165l5.5 3.175a2.5 2.5 0 0 0 2.5 0l5.5-3.175a2.5 2.5 0 0 0 1.25-2.165V7.524a2.5 2.5 0 0 0-1.25-2.165Z" />
      <path d="m15.5 7-5 2.89" />
      <path d="m15.5 17-5-2.89" />
      <path d="M8.5 12h5" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2" prefetch={false}>
      <CoconutIcon className="h-8 w-8 text-primary" />
      <span className="font-headline text-xl font-bold">
        CocoSales AI
      </span>
    </Link>
  );
}
