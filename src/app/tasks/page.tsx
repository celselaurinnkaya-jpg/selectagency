"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  CheckSquare,
  Plus,
  Clock,
  AlertTriangle,
  User,
  CheckCircle2,
  FolderKanban,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { initialTasks, Task } from "@/lib/mockData";

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [filter, setFilter] = useState<"all" | "urgent" | "todo" | "done">("all");

  const toggleTask = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, status: t.status === "done" ? "todo" : "done" }
          : t
      )
    );
  };

  const filteredTasks = tasks.filter((t) => {
    if (filter === "urgent") return t.isUrgent;
    if (filter === "todo") return t.status !== "done";
    if (filter === "done") return t.status === "done";
    return true;
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Tâches & Échéances opérationnelles
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Actions attribuées aux conseillers : relances clients, préparation des dossiers et vérifications.
            </p>
          </div>

          <button
            type="button"
            onClick={() => alert("Simulation d'ajout d'une tâche")}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-900 bg-[#F0FF0A] hover:bg-[#d8e600] border border-[#d8e600] rounded-lg shadow-2xs hover:shadow transition-all self-start sm:self-auto"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Ajouter une tâche</span>
          </button>
        </div>

        {/* Filter bar */}
        <div className="bg-white p-2 rounded-xl border border-slate-200/90 shadow-2xs flex flex-wrap gap-2 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              filter === "all" ? "bg-[#023764] text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Toutes les tâches ({tasks.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("urgent")}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              filter === "urgent" ? "bg-[#023764] text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Urgentes ({tasks.filter((t) => t.isUrgent).length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("todo")}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              filter === "todo" ? "bg-[#023764] text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            À faire ({tasks.filter((t) => t.status !== "done").length})
          </button>
        </div>

        {/* Tasks List */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 space-y-3">
          {filteredTasks.map((task) => {
            const isDone = task.status === "done";
            return (
              <div
                key={task.id}
                className={`p-4 rounded-xl border transition-all flex items-start gap-4 ${
                  isDone
                    ? "bg-slate-50 border-slate-200 opacity-60"
                    : "bg-white border-slate-200/90 hover:border-slate-300 shadow-2xs"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isDone}
                  onChange={() => toggleTask(task.id)}
                  className="mt-1 w-4 h-4 rounded text-[#023764] focus:ring-[#023764] cursor-pointer"
                />

                <div className="flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {task.isUrgent && (
                      <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-rose-50 text-rose-700 border border-rose-200">
                        Urgent
                      </span>
                    )}
                    {task.caseReference && (
                      <span className="text-[11px] font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.2 rounded">
                        {task.caseReference}
                      </span>
                    )}
                    {task.clientName && (
                      <span className="text-[11px] font-semibold text-[#023764]">
                        {task.clientName}
                      </span>
                    )}
                  </div>

                  <p
                    className={`text-xs font-bold ${
                      isDone ? "line-through text-slate-400" : "text-slate-900"
                    }`}
                  >
                    {task.title}
                  </p>

                  <div className="flex items-center gap-3 text-[11px] text-slate-500 pt-1">
                    <span className="flex items-center gap-1 font-medium text-amber-700">
                      <Clock className="w-3 h-3 text-amber-600" />
                      Échéance : {task.dueAt}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-400" />
                      Attribué à : {task.assignedTo}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
