import { test as base, expect } from '@playwright/test';
// Api Models
import { AuthEndpoints } from '../../api/tagc-endpoints';
import { SettingsApi } from '../../api/tagc-settings-api';
// Pages
import { PermissionsGridPage } from '../../pages/tagc-permissions-grid';
import { SecurityAuditPage } from '../../pages/tagc-security-audit';
import { SessionManagerPage } from '../../pages/tagc-session-manager';
import { SettingsPage } from '../../pages/tagc-settings';
import { SystemLogsPage } from '../../pages/tagc-system-logs';
import { UserActivityPage } from '../../pages/tagc-user-activity';
import { UserProfilePage } from '../../pages/tagc-user-profile';
import { SettingsDialog } from '../../pages/tagc-settings-dialog';

export type TagCPages = {
  permissionsGrid: PermissionsGridPage;
  securityAudit: SecurityAuditPage;
  sessionManager: SessionManagerPage;
  settings: SettingsPage;
  systemLogs: SystemLogsPage;
  userActivity: UserActivityPage;
  userProfile: UserProfilePage;
  settingsDialog: SettingsDialog;
};

export type TagCApi = {
  endpoints: AuthEndpoints;
  settings: SettingsApi;
};

export const test = base.extend<{ tagcPages: TagCPages; tagcApi: TagCApi }>({
  tagcPages: async ({ page }, use) => {
    await use({
      permissionsGrid: new PermissionsGridPage(page),
      securityAudit: new SecurityAuditPage(page),
      sessionManager: new SessionManagerPage(page),
      settings: new SettingsPage(page),
      systemLogs: new SystemLogsPage(page),
      userActivity: new UserActivityPage(page),
      userProfile: new UserProfilePage(page),
      settingsDialog: new SettingsDialog(page),
    });
  },
  tagcApi: async ({ request }, use) => {
    await use({
      endpoints: new AuthEndpoints(request),
      settings: new SettingsApi(request),
    });
  },
});

export { expect };
