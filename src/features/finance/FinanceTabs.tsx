"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

const TABS = [
  { href: "/finance", label: "Synthèse" },
  { href: "/finance/payments", label: "Paiements et reçus" },
  { href: "/finance/expenses", label: "Dépenses" },
];

export function FinanceTabs() {
  const pathname = usePathname();
  if (pathname?.startsWith("/finance/receipts")) return null;
  return (
    <nav aria-label="Sections financières" className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0 print:hidden">
      <ul className="flex min-w-max gap-1 border-b border-slate-200">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex min-h-11 items-center border-b-[3px] px-3 text-sm font-medium",
                  active ? "border-navy-800 text-navy-800" : "border-transparent text-slate-600 hover:text-navy-800",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
