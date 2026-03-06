import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/modules/auth/providers/AuthProvider";
import { useToast } from "@/hooks/use-toast";
import { invokeEdgeFunction } from "@/lib/edge-function-client";
import i18n from "@/i18n/config";
import type { VaultModule, VaultModuleSummary, VaultDomain, VaultModuleType, VaultValidationStatus, VaultScope, VisibilityLevel, AiMetadata } from "../types";

const PAGE_SIZE = 50;

export interface VaultModuleFilters {
  scope?: VaultScope;
  domain?: VaultDomain;
  module_type?: VaultModuleType;
  saas_phase?: number;
  source_project?: string;
  validation_status?: VaultValidationStatus;
  tags?: string[];
  query?: string;
  difficulty?: string;
  language?: string;
}

interface VaultListResponse {
  items: VaultModuleSummary[];
  total: number;
}

export function useVaultModules(filters?: VaultModuleFilters) {
  const { user } = useAuth();
  return useInfiniteQuery({
    queryKey: ["vault_modules", filters],
    queryFn: ({ pageParam = 0 }) =>
      invokeEdgeFunction<VaultListResponse>("vault-crud", {
        action: "list",
        scope: filters?.scope ?? "owned",
        domain: filters?.domain,
        module_type: filters?.module_type,
        query: filters?.query,
        validation_status: filters?.validation_status,
        difficulty: filters?.difficulty,
        language: filters?.language,
        limit: PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.items.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    enabled: !!user,
  });
}

interface DomainCountsResponse {
  counts: Record<string, number>;
  total: number;
}

export function useVaultDomainCounts(scope: VaultScope) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["vault_domain_counts", scope],
    queryFn: () =>
      invokeEdgeFunction<DomainCountsResponse>("vault-crud", {
        action: "domain_counts",
        scope,
      }),
    enabled: !!user,
    staleTime: 30_000,
  });
}

export function useVaultSearch(params: VaultModuleFilters & { validated?: boolean }) {
  const { user } = useAuth();
  return useInfiniteQuery({
    queryKey: ["vault_search", params],
    queryFn: ({ pageParam = 0 }) =>
      invokeEdgeFunction<VaultListResponse>("vault-crud", {
        action: "search",
        ...params,
        limit: PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.items.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    enabled: !!user && !!(params.query || params.domain || params.module_type || params.saas_phase != null),
  });
}

// Fetches all SaaS playbook modules grouped by phase
export function useVaultPlaybook() {
  const { user } = useAuth();
  return useInfiniteQuery({
    queryKey: ["vault_playbook"],
    queryFn: () =>
      invokeEdgeFunction<{ phases: Record<number, VaultModuleSummary[]>; total: number }>("vault-crud", {
        action: "get_playbook",
      }),
    initialPageParam: 0,
    getNextPageParam: () => undefined,
    enabled: !!user,
  });
}

// Creates a module with all structured fields
export interface CreateModuleInput {
  title: string;
  description?: string;
  domain?: VaultDomain;
  module_type?: VaultModuleType;
  language?: string;
  code?: string;
  context_markdown?: string;
  dependencies?: string;
  tags?: string[];
  saas_phase?: number;
  phase_title?: string;
  why_it_matters?: string;
  code_example?: string;
  source_project?: string;
  validation_status?: VaultValidationStatus;
  related_modules?: string[];
  visibility?: VisibilityLevel;
  ai_metadata?: AiMetadata;
}

export function useCreateVaultModule(onSuccess?: (createdModule: VaultModule) => void) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateModuleInput) =>
      invokeEdgeFunction<VaultModule>("vault-crud", { action: "create", ...input }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["vault_modules"] });
      queryClient.invalidateQueries({ queryKey: ["vault_playbook"] });
      queryClient.invalidateQueries({ queryKey: ["vault_domain_counts"] });
      toast({ title: i18n.t("toast.moduleCreated") });
      onSuccess?.(data);
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: i18n.t("toast.createError"), description: err.message });
    },
  });
}

// Updates module fields selectively
export function useUpdateVaultModule(onSuccess?: () => void) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...fields }: Partial<CreateModuleInput> & { id: string }) =>
      invokeEdgeFunction<VaultModule>("vault-crud", { action: "update", id, ...fields }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["vault_modules"] });
      queryClient.invalidateQueries({ queryKey: ["vault_module", vars.id] });
      queryClient.invalidateQueries({ queryKey: ["vault_playbook"] });
      queryClient.invalidateQueries({ queryKey: ["vault_domain_counts"] });
      toast({ title: i18n.t("toast.moduleUpdated") });
      onSuccess?.();
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: i18n.t("toast.updateError"), description: err.message });
    },
  });
}
