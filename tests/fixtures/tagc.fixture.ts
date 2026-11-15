import { expect, test as base } from "@playwright/test";
import { TagCAuditJobsApi } from "@api/tagc-audit-jobs-api";
import { ServiceAuthApi } from "@api/tagc-service-auth-api";
import { AuthEndpoints } from "@api/tagc-endpoints";
import { SettingsApi } from "@api/tagc-settings-api";
import { ApiHandler } from "@components/ApiHandler";
import { CsvParser } from "@parsers/csv-parser";
import { TagCNavBar } from "@pages/tagc-navbar-section";
import { PermissionsGridPage } from "@pages/tagc-permissions-grid";
import { TagCRoleModal } from "@pages/tagc-role-modal";
import { SecurityAuditPage } from "@pages/tagc-security-audit";
import { SessionManagerPage } from "@pages/tagc-session-manager";
import { SettingsPage } from "@pages/tagc-settings";
import { SettingsDialog } from "@pages/tagc-settings-dialog";
import { SystemLogsPage } from "@pages/tagc-system-logs";
import { UserActivityPage } from "@pages/tagc-user-activity";
import { UserProfilePage } from "@pages/tagc-user-profile";
import ENV, { requireServiceBaseApiUrl, requireServiceCredentials, resolveTestEnv } from "@utils/testEnv";
import { getAccessTokenForOrigin } from "@workflows/workflows-token";

type TagCSubscriptions = {
  api: string;
  audit: string;
  regionEu: string;
};

type TagCApiSubscriptions = {
  api: string;
};

type TagCSubscriptionOverrides = Partial<TagCApiSubscriptions>;

const defaultTagCSubscriptions: TagCApiSubscriptions = {
  api: ENV.TAGC_AUDIT_SUBSCRIPTION_ID,
};

type ServiceTagCApiModels = {
  serviceApi: string;
  handler: ApiHandler;
  subscriptionId: string;
  auth: ServiceAuthApi;
};

export type TagCPages = {
  tagcWeb: string;
  createCsvParser: (delimiter?: string) => CsvParser;
  createRoleModal: (defaultRole?: string) => TagCRoleModal;
  navBar: TagCNavBar;
  permissionsGrid: PermissionsGridPage;
  roleModal: TagCRoleModal;
  securityAudit: SecurityAuditPage;
  sessionManager: SessionManagerPage;
  settings: SettingsPage;
  settingsDialog: SettingsDialog;
  systemLogs: SystemLogsPage;
  userActivity: UserActivityPage;
  userProfile: UserProfilePage;
};

export type TagCApi = {
  tagcApi: string;
  handler: ApiHandler;
  subscriptionId: string;
  subscriptions: TagCSubscriptions;
  auditJobs: TagCAuditJobsApi;
  endpoints: AuthEndpoints;
  settings: SettingsApi;
  service: ServiceTagCApiModels;
};

const toOrigin = (url: string): string => (url ? new URL(url).origin : "");

export const test = base.extend<{
  tagcPages: TagCPages;
  tagcApi: TagCApi;
  tagcSubscriptions: TagCSubscriptionOverrides;
}>({
  tagcSubscriptions: [
    defaultTagCSubscriptions,
    { option: true },
  ],
  tagcPages: async ({ page }, use, testInfo) => {
    const env = resolveTestEnv(testInfo.project.name);

    await use({
      tagcWeb: env.tagcBaseWebUrl,
      createCsvParser: (delimiter?: string) => new CsvParser(delimiter),
      createRoleModal: (defaultRole?: string) => new TagCRoleModal(page, defaultRole),
      navBar: new TagCNavBar(page),
      permissionsGrid: new PermissionsGridPage(page),
      roleModal: new TagCRoleModal(page),
      securityAudit: new SecurityAuditPage(page),
      sessionManager: new SessionManagerPage(page),
      settings: new SettingsPage(page),
      settingsDialog: new SettingsDialog(page),
      systemLogs: new SystemLogsPage(page),
      userActivity: new UserActivityPage(page),
      userProfile: new UserProfilePage(page),
    });
  },
  tagcApi: async ({ request, tagcSubscriptions }, use, testInfo) => {
    const env = resolveTestEnv(testInfo.project.name);
    const configuredSubscriptions = { ...defaultTagCSubscriptions, ...tagcSubscriptions };
    const subscriptionId = configuredSubscriptions.api;

    const tagcHandler = new ApiHandler(
      request,
      env.tagcBaseApiUrl,
      getAccessTokenForOrigin(env.state, toOrigin(env.tagcBaseWebUrl)),
    );
    let serviceModels: ServiceTagCApiModels | undefined;

    await use({
      tagcApi: env.tagcBaseApiUrl,
      handler: tagcHandler,
      subscriptionId,
      subscriptions: {
        api: subscriptionId,
        audit: ENV.TAGC_AUDIT_SUBSCRIPTION_ID,
        regionEu: ENV.REGION_EU_SUBSCRIPTION_ID,
      },
      auditJobs: new TagCAuditJobsApi(tagcHandler, subscriptionId),
      endpoints: new AuthEndpoints(tagcHandler, subscriptionId),
      settings: new SettingsApi(tagcHandler, subscriptionId),
      // Lazy: Service credentials are only required by tests that use service.
      get service() {
        if (!serviceModels) {
          const serviceBaseApiUrl = requireServiceBaseApiUrl(env.envName);
          const { subscriptionId: serviceSubId, basicToken } = requireServiceCredentials();
          const serviceHandler = new ApiHandler(request, serviceBaseApiUrl, basicToken, "Basic");
          serviceModels = {
            serviceApi: serviceBaseApiUrl,
            handler: serviceHandler,
            subscriptionId: serviceSubId,
            auth: new ServiceAuthApi(serviceHandler),
          };
        }
        return serviceModels;
      },
    });
  },
});

export { expect };
