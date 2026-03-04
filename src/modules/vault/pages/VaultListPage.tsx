import { useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, Search, Loader2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useVaultModules, useVaultDomainCounts } from "../hooks/useVaultModules";
import { CreateModuleDialog } from "../components/CreateModuleDialog";
import { VaultModuleCard } from "../components/VaultModuleCard";
import { VaultDomainFilters } from "../components/VaultDomainFilters";
import { VaultAdvancedFilters, type AdvancedFilters } from "../components/VaultAdvancedFilters";
import type { VaultDomain, VaultScope } from "../types";

export function VaultListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [activeDomain, setActiveDomain] = useState<VaultDomain | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const scope: VaultScope = useMemo(() => {
    if (location.pathname === "/vault/shared") return "shared_with_me";
    if (location.pathname === "/vault/global") return "global";
    return "owned";
  }, [location.pathname]);

  const pageTitle = useMemo(() => {
    if (scope === "shared_with_me") return t("vault.sharedWithMe");
    if (scope === "global") return t("vault.globalVaultTitle");
    return t("vault.title");
  }, [scope, t]);

  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useVaultModules({
    scope,
    domain: activeDomain,
    query: searchQuery || undefined,
  });

  const { data: domainData } = useVaultDomainCounts(scope);

  const modules = data?.pages.flatMap((p) => p.items) ?? [];
  const totalFiltered = data?.pages[0]?.total ?? 0;
  const totalAll = domainData?.total ?? 0;
  const domainCounts = domainData?.counts ?? {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{pageTitle}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("vault.moduleCount", { count: totalAll })}
          </p>
        </div>
        {scope === "owned" && (
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> {t("vault.newModule")}
          </Button>
        )}
      </div>

      <VaultDomainFilters
        activeDomain={activeDomain}
        onDomainChange={setActiveDomain}
        domainCounts={domainCounts}
        totalCount={totalAll}
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t("vault.searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !modules.length ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
          <Package className="h-12 w-12 text-muted-foreground/30" />
          <div>
            <p className="text-foreground font-medium">{t("vault.noModules")}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {searchQuery || activeDomain ? t("vault.tryOtherFilters") : t("vault.createFirstModule")}
            </p>
          </div>
          {!searchQuery && !activeDomain && scope === "owned" && (
            <Button onClick={() => setCreateOpen(true)} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" /> {t("vault.createFirst")}
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((mod) => (
              <VaultModuleCard key={mod.id} mod={mod} onClick={() => navigate(`/vault/${mod.id}`)} />
            ))}
          </div>

          {totalFiltered > modules.length && (
            <p className="text-center text-sm text-muted-foreground">
              {t("vault.showingOf", { shown: modules.length, total: totalFiltered })}
            </p>
          )}

          {hasNextPage && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="gap-2"
              >
                {isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("vault.loadMore")}
              </Button>
            </div>
          )}
        </>
      )}

      <CreateModuleDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
