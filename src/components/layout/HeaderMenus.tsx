"use client";

import { startTransition, useState } from "react";
import Link from "next/link";
import { ChevronDown, FolderPlus, ListPlus, LogOut, Menu, Plus, Settings, UserPlus, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "@/components/brand/Logo";
import { signOutAction } from "@/features/auth/actions";
import { SidebarNav } from "./SidebarNav";

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="onNavy" size="icon" className="lg:hidden" aria-label="Ouvrir le menu">
          <Menu className="size-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[86vw] max-w-xs gap-0 bg-surface p-0">
        <SheetHeader className="bg-navy-800 px-4 py-4">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">Navigation principale de SELECT Agency</SheetDescription>
          <Logo className="h-8" />
        </SheetHeader>
        <div className="overflow-y-auto p-3">
          <SidebarNav onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

const NEW_ITEMS = [
  { href: "/clients/new", label: "Nouveau client", icon: UserPlus },
  { href: "/cases/new", label: "Nouveau dossier", icon: FolderPlus },
  { href: "/tasks#nouvelle-tache", label: "Nouvelle tâche", icon: ListPlus },
];

export function NewMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="accent" className="gap-1.5 px-3 sm:px-4">
          <Plus className="size-5" aria-hidden />
          <span className="hidden sm:inline">Nouveau</span>
          <span className="sr-only sm:hidden">Créer</span>
          <ChevronDown className="hidden size-4 sm:block" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {NEW_ITEMS.map((item) => (
          <DropdownMenuItem key={item.href} asChild className="min-h-10 text-sm">
            <Link href={item.href}>
              <item.icon className="text-navy-800" aria-hidden />
              {item.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UserMenu({ fullName, roleLabel, initials }: { fullName: string; roleLabel: string; initials: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="onNavy" className="h-11 gap-2 px-1.5 sm:px-2">
          <span className="hidden text-right leading-tight md:block">
            <span className="block text-sm font-semibold">{fullName}</span>
            <span className="block text-xs text-navy-100">{roleLabel}</span>
          </span>
          <span className="flex size-9 items-center justify-center rounded-full bg-white text-sm font-bold text-navy-800">
            {initials}
          </span>
          <ChevronDown className="hidden size-4 md:block" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-sm text-foreground">
          {fullName}
          <span className="block text-xs font-normal text-muted-foreground">{roleLabel}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="min-h-10 text-sm">
          <Link href="/team">
            <UserRound aria-hidden />
            Équipe et rôles
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="min-h-10 text-sm">
          <Link href="/settings">
            <Settings aria-hidden />
            Paramètres de l&apos;agence
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-10 text-sm" onSelect={() => startTransition(() => signOutAction())}>
          <LogOut aria-hidden />
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
