/**
 * ModuleMetadataSection — Renders all previously hidden vault module fields
 * as collapsible sections: common_errors, solves_problems, test_code,
 * database_schema, why_it_matters, usage_hint, difficulty, estimated_minutes,
 * module_group, implementation_order, version, related_modules, code_example.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/CodeBlock";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDown,
  AlertTriangle,
  Lightbulb,
  Clock,
  BarChart3,
  Layers,
  Link2,
  TestTube,
  Database,
  Target,
  Info,
  Tag,
} from "lucide-react";
import type { VaultModule } from "../types";

interface Props {
  module: VaultModule;
}

function Section({
  icon: Icon,
  label,
  children,
  defaultOpen = false,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full text-left text-sm font-semibold text-foreground uppercase tracking-wider py-1.5 hover:text-primary transition-colors">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1">{label}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 pb-1">{children}</CollapsibleContent>
    </Collapsible>
  );
}

export function ModuleMetadataSection({ module: mod }: Props) {
  const { t } = useTranslation();
  const sections: React.ReactNode[] = [];

  // Why it matters
  if (mod.why_it_matters) {
    sections.push(
      <Section key="why" icon={Lightbulb} label={t("vault.whyItMatters", "Why It Matters")}>
        <p className="text-sm text-foreground/90 whitespace-pre-wrap">{mod.why_it_matters}</p>
      </Section>,
    );
  }

  // Usage hint
  if (mod.usage_hint) {
    sections.push(
      <Section key="hint" icon={Info} label={t("vault.usageHint", "Usage Hint")}>
        <p className="text-sm text-foreground/90 whitespace-pre-wrap">{mod.usage_hint}</p>
      </Section>,
    );
  }

  // Solves problems
  if (mod.solves_problems && mod.solves_problems.length > 0) {
    sections.push(
      <Section key="solves" icon={Target} label={t("vault.solvesProblems", "Solves Problems")}>
        <ul className="list-disc list-inside space-y-1 text-sm text-foreground/90">
          {mod.solves_problems.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      </Section>,
    );
  }

  // Common errors
  if (mod.common_errors && mod.common_errors.length > 0) {
    sections.push(
      <Section key="errors" icon={AlertTriangle} label={t("vault.commonErrors", "Common Errors")}>
        <div className="space-y-3">
          {mod.common_errors.map((e, i) => (
            <div key={i} className="rounded-lg border border-border bg-muted/50 p-3 space-y-1">
              <p className="text-sm font-mono text-destructive">{e.error}</p>
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold">Cause:</span> {e.cause}
              </p>
              <p className="text-xs text-foreground/80">
                <span className="font-semibold">Fix:</span> {e.fix}
              </p>
            </div>
          ))}
        </div>
      </Section>,
    );
  }

  // Test code
  if (mod.test_code) {
    sections.push(
      <Section key="test" icon={TestTube} label={t("vault.testCode", "Test Code")}>
        <CodeBlock code={mod.test_code} language={mod.language} />
      </Section>,
    );
  }

  // Code example
  if (mod.code_example) {
    sections.push(
      <Section key="example" icon={Layers} label={t("vault.codeExample", "Code Example")}>
        <CodeBlock code={mod.code_example} language={mod.language} />
      </Section>,
    );
  }

  // Database schema
  if (mod.database_schema) {
    sections.push(
      <Section key="schema" icon={Database} label={t("vault.databaseSchema", "Database Schema")}>
        <CodeBlock code={mod.database_schema} language="sql" />
      </Section>,
    );
  }

  // Module metadata badges
  const metaBadges: React.ReactNode[] = [];
  if (mod.difficulty) {
    metaBadges.push(
      <Badge key="diff" variant="outline" className="gap-1">
        <BarChart3 className="h-3 w-3" /> {mod.difficulty}
      </Badge>,
    );
  }
  if (mod.estimated_minutes) {
    metaBadges.push(
      <Badge key="time" variant="outline" className="gap-1">
        <Clock className="h-3 w-3" /> {mod.estimated_minutes} min
      </Badge>,
    );
  }
  if (mod.version) {
    metaBadges.push(
      <Badge key="ver" variant="outline" className="gap-1">
        <Tag className="h-3 w-3" /> {mod.version}
      </Badge>,
    );
  }
  if (mod.module_group) {
    metaBadges.push(
      <Badge key="group" variant="secondary" className="gap-1">
        <Layers className="h-3 w-3" /> {mod.module_group}
        {mod.implementation_order != null && ` #${mod.implementation_order}`}
      </Badge>,
    );
  }

  if (metaBadges.length > 0) {
    sections.unshift(
      <div key="meta" className="flex flex-wrap gap-2">
        {metaBadges}
      </div>,
    );
  }

  // Related modules
  if (mod.related_modules && mod.related_modules.length > 0) {
    sections.push(
      <Section key="related" icon={Link2} label={t("vault.relatedModules", "Related Modules")}>
        <div className="flex flex-wrap gap-1.5">
          {mod.related_modules.map((id) => (
            <Badge key={id} variant="outline" className="font-mono text-xs">
              {id.slice(0, 8)}…
            </Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {mod.related_modules.length} related module(s)
        </p>
      </Section>,
    );
  }

  if (sections.length === 0) return null;

  return <div className="space-y-4">{sections}</div>;
}
