import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminProvider } from "../context/AdminProvider";
import { UsersTable } from "../components/UsersTable";
import { RoleChangeDialog } from "../components/RoleChangeDialog";
import { SystemHealthTab } from "../components/SystemHealthTab";
import { ApiMonitorTab } from "../components/ApiMonitorTab";
import { GlobalModerationTab } from "../components/GlobalModerationTab";
import { McpHealthTab } from "../components/McpHealthTab";

export function AdminPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {t("admin.title")}
        </h1>
        <p className="text-muted-foreground">{t("admin.subtitle")}</p>
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users">{t("admin.tabs.usersRoles")}</TabsTrigger>
          <TabsTrigger value="health">{t("admin.tabs.systemHealth")}</TabsTrigger>
          <TabsTrigger value="apiMonitor">{t("admin.tabs.apiMonitor")}</TabsTrigger>
          <TabsTrigger value="moderation">{t("admin.tabs.moderation")}</TabsTrigger>
          <TabsTrigger value="mcpHealth">MCP Health</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <AdminProvider>
            <UsersTable />
            <RoleChangeDialog />
          </AdminProvider>
        </TabsContent>

        <TabsContent value="health">
          <SystemHealthTab />
        </TabsContent>

        <TabsContent value="apiMonitor">
          <ApiMonitorTab />
        </TabsContent>

        <TabsContent value="moderation">
          <GlobalModerationTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
