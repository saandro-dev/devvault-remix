/**
 * VaultAdvancedFilters — Collapsible filter panel for vault list page.
 * Adds module_type, validation_status, difficulty, and language filters.
 */

import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SlidersHorizontal, X } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useState } from "react";
import type { VaultModuleType, VaultValidationStatus } from "../types";

export interface AdvancedFilters {
  module_type?: VaultModuleType;
  validation_status?: VaultValidationStatus;
  difficulty?: string;
  language?: string;
}

interface Props {
  filters: AdvancedFilters;
  onChange: (filters: AdvancedFilters) => void;
}

const MODULE_TYPES: VaultModuleType[] = [
  "code_snippet", "full_module", "sql_migration",
  "architecture_doc", "playbook_phase", "pattern_guide",
];

const VALIDATION_STATUSES: VaultValidationStatus[] = ["draft", "validated", "deprecated"];
const DIFFICULTIES = ["beginner", "intermediate", "advanced", "expert"];
const LANGUAGES = ["typescript", "sql", "javascript", "python", "markdown", "bash"];

export function VaultAdvancedFilters({ filters, onChange }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const activeCount = Object.values(filters).filter(Boolean).length;

  const clearAll = () => onChange({});

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-2">
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {t("vault.advancedFilters", "Advanced Filters")}
            {activeCount > 0 && (
              <span className="bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 text-xs">
                {activeCount}
              </span>
            )}
          </Button>
        </CollapsibleTrigger>
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearAll} className="gap-1 text-xs">
            <X className="h-3 w-3" /> {t("common.clearAll", "Clear all")}
          </Button>
        )}
      </div>

      <CollapsibleContent className="pt-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            value={filters.module_type ?? "__all__"}
            onValueChange={(v) => onChange({ ...filters, module_type: v === "__all__" ? undefined : v as VaultModuleType })}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Module Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Types</SelectItem>
              {MODULE_TYPES.map((mt) => (
                <SelectItem key={mt} value={mt}>{mt.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.validation_status ?? "__all__"}
            onValueChange={(v) => onChange({ ...filters, validation_status: v === "__all__" ? undefined : v as VaultValidationStatus })}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Statuses</SelectItem>
              {VALIDATION_STATUSES.map((vs) => (
                <SelectItem key={vs} value={vs}>{vs}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.difficulty ?? "__all__"}
            onValueChange={(v) => onChange({ ...filters, difficulty: v === "__all__" ? undefined : v })}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Difficulty" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Difficulties</SelectItem>
              {DIFFICULTIES.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.language ?? "__all__"}
            onValueChange={(v) => onChange({ ...filters, language: v === "__all__" ? undefined : v })}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Language" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Languages</SelectItem>
              {LANGUAGES.map((l) => (
                <SelectItem key={l} value={l}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
