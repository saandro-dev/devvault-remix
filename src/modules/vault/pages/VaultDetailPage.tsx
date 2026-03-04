import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CodeBlock } from "@/components/CodeBlock";
import { TagCloud } from "@/components/TagCloud";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirmDelete } from "@/components/common/ConfirmDelete";
import { EditModuleSheet } from "@/modules/vault/components/EditModuleSheet";
import { ShareModuleDialog } from "@/modules/vault/components/ShareModuleDialog";
import { DependencyCard } from "@/modules/vault/components/DependencyCard";
import { useVaultModule, useDeleteVaultModule } from "@/modules/vault/hooks/useVaultModule";
import { useRemoveDependency } from "@/modules/vault/hooks/useModuleDependencies";
import { useAuth } from "@/modules/auth/providers/AuthProvider";
import { MarkdownRenderer } from "@/modules/vault/components/MarkdownRenderer";
import { ModuleMetadataSection } from "@/modules/vault/components/ModuleMetadataSection";
import { ArrowLeft, Trash2, Copy, Check, Loader2, Pencil, Lock, Users, Globe, AlertTriangle, Package } from "lucide-react";
import { VISIBILITY_COLORS } from "../types";
import type { VisibilityLevel } from "../types";

const VISIBILITY_ICONS: Record<VisibilityLevel, React.ElementType> = {
  private: Lock,
  shared: Users,
  global: Globe,
};

export function VaultDetailPage() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const [depCopied, setDepCopied] = useState(false);
  const [npmCopied, setNpmCopied] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const { confirm, ConfirmDialog } = useConfirmDelete();

  const { data: mod, isLoading } = useVaultModule(moduleId);
  const deleteMutation = useDeleteVaultModule();
  const removeDep = useRemoveDependency(moduleId ?? "");

  const isOwner = mod?.user_id === user?.id;

  const handleDelete = async () => {
    if (!mod) return;
    const confirmed = await confirm({
      resourceType: "module",
      resourceName: mod.title,
      requireTypeToConfirm: true,
    });
    if (confirmed) {
      deleteMutation.mutate(mod.id, { onSuccess: () => navigate(-1) });
    }
  };

  const copyDeps = async () => {
    if (!mod?.dependencies) return;
    await navigator.clipboard.writeText(mod.dependencies);
    setDepCopied(true);
    setTimeout(() => setDepCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!mod) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <p className="text-muted-foreground">{t("vault.notFound")}</p>
        <Link to="/vault">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> {t("vault.backToVault")}
          </Button>
        </Link>
      </div>
    );
  }

  const VisIcon = VISIBILITY_ICONS[mod.visibility];

  return (
    <div className="space-y-6 max-w-4xl">
      <ConfirmDialog />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/vault">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">{mod.title}</h1>
              <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border ${VISIBILITY_COLORS[mod.visibility]}`}>
                <VisIcon className="h-3 w-3" /> {t(`visibility.${mod.visibility}`)}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{mod.description}</p>
          </div>
        </div>
        {isOwner && (
          <div className="flex items-center gap-2">
            <ShareModuleDialog moduleId={mod.id} />
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" /> {t("common.edit")}
            </Button>
            <Button variant="destructive" size="sm" className="gap-2" onClick={handleDelete} disabled={deleteMutation.isPending}>
              <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
            </Button>
          </div>
        )}
      </div>

      <TagCloud tags={mod.tags} />

      {/* AI Metadata: NPM Dependencies */}
      {mod.ai_metadata?.npm_dependencies && mod.ai_metadata.npm_dependencies.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
            <Package className="h-4 w-4" /> {t("vault.npmDependencies")}
          </h2>
          <div className="flex items-center gap-2 bg-surface rounded-lg border border-border p-3">
            <div className="flex flex-wrap gap-1.5 flex-1">
              {mod.ai_metadata.npm_dependencies.map((dep) => (
                <Badge key={dep} variant="secondary" className="font-mono text-xs">{dep}</Badge>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={async () => {
              await navigator.clipboard.writeText(`npm install ${mod.ai_metadata.npm_dependencies!.join(" ")}`);
              setNpmCopied(true);
              setTimeout(() => setNpmCopied(false), 2000);
            }}>
              {npmCopied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      )}

      {/* AI Metadata: Required Environment Variables */}
      {mod.ai_metadata?.env_vars_required && mod.ai_metadata.env_vars_required.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-500" /> {t("vault.envVarsRequired")}
          </h2>
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3">
            <div className="flex flex-wrap gap-1.5">
              {mod.ai_metadata.env_vars_required.map((v) => (
                <Badge key={v} variant="outline" className="font-mono text-xs border-yellow-500/40 text-yellow-600 dark:text-yellow-400">{v}</Badge>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Prerequisites / Dependencies Section */}
      {(mod.module_dependencies && mod.module_dependencies.length > 0) && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
            {t("vault.prerequisites")}
          </h2>
          <div className="space-y-2">
            {mod.module_dependencies.map((dep) => (
              <DependencyCard
                key={dep.id}
                dependency={dep}
                isOwner={isOwner}
                onRemove={() => removeDep.mutate(dep.depends_on_id)}
              />
            ))}
          </div>
        </div>
      )}

      {mod.context_markdown && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">{t("vault.whyAndHow")}</h2>
          <div className="prose prose-sm dark:prose-invert max-w-none bg-surface p-4 rounded-lg border border-border">
            <p className="text-foreground whitespace-pre-wrap">{mod.context_markdown}</p>
          </div>
        </div>
      )}

      {mod.dependencies && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">{t("vault.dependencies")}</h2>
          <div className="flex items-center gap-2 bg-surface rounded-lg border border-border p-3">
            <code className="font-mono text-sm text-foreground flex-1">{mod.dependencies}</code>
            <Button variant="ghost" size="sm" onClick={copyDeps}>
              {depCopied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">{t("vault.code")}</h2>
        <CodeBlock code={mod.code} language={mod.language} />
      </div>

      {isOwner && (
        <EditModuleSheet module={mod} open={editOpen} onOpenChange={setEditOpen} />
      )}
    </div>
  );
}
