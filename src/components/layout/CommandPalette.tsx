"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { 
  Calculator,
  Calendar,
  CreditCard,
  Settings,
  Smile,
  User,
  Search,
  Briefcase,
  CheckSquare,
  Users,
  Banknote,
  FileText
} from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";

export function CommandPalette({ open, setOpen }: { open: boolean, setOpen: (open: boolean) => void }) {
  const router = useRouter();
  const [projects, setProjects] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);

  useEffect(() => {
    if (open) {
      Promise.all([
        getDocs(collection(db, "projects")),
        getDocs(collection(db, "employees")),
        getDocs(collection(db, "invoices"))
      ]).then(([projSnap, empSnap, invSnap]) => {
        setProjects(projSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setEmployees(empSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setInvoices(invSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
    }
  }, [open]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(true);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [setOpen]);

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Suggestions">
          <CommandItem onSelect={() => runCommand(() => router.push("/dashboard/projects"))}>
            <Briefcase className="mr-2 h-4 w-4" />
            <span>Projects</span>
            <CommandShortcut>⌘P</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/dashboard/tasks"))}>
            <CheckSquare className="mr-2 h-4 w-4" />
            <span>Tasks</span>
            <CommandShortcut>⌘T</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/dashboard/hr"))}>
            <Users className="mr-2 h-4 w-4" />
            <span>Team Directory</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Finance & Ops">
          <CommandItem onSelect={() => runCommand(() => router.push("/dashboard/finance"))}>
            <Banknote className="mr-2 h-4 w-4" />
            <span>Finance Dashboard</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/dashboard/reports"))}>
            <FileText className="mr-2 h-4 w-4" />
            <span>Reports</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Settings">
          <CommandItem onSelect={() => runCommand(() => router.push("/dashboard/settings"))}>
            <Settings className="mr-2 h-4 w-4" />
            <span>System Settings</span>
            <CommandShortcut>⌘S</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        
        {employees.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Employees">
              {employees.map(emp => (
                <CommandItem key={emp.id} onSelect={() => runCommand(() => router.push(`/dashboard/hr/${emp.uid || emp.id}`))}>
                  <User className="mr-2 h-4 w-4" />
                  <span>{emp.displayName || emp.name || emp.email}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {projects.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Active Projects">
              {projects.map(proj => (
                <CommandItem key={proj.id} onSelect={() => runCommand(() => router.push(`/dashboard/projects/${proj.id}`))}>
                  <Briefcase className="mr-2 h-4 w-4" />
                  <span>{proj.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {invoices.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Invoices">
              {invoices.map(inv => (
                <CommandItem key={inv.id} onSelect={() => runCommand(() => router.push(`/dashboard/finance`))}>
                  <FileText className="mr-2 h-4 w-4" />
                  <span>{inv.invoiceNumber} - {inv.clientName}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
