/**
 * Microsoft Graph connectors (desktop-direct, `auth:"microsoft"` — loopback + PKCE,
 * public client). Outlook + OneDrive use delegated user scopes (1-clic); SharePoint +
 * Teams need admin-consent scopes → `byoOnly`.
 */
export { microsoftOutlookConnector } from "./outlook";
export { microsoftOneDriveConnector } from "./onedrive";
export { microsoftSharePointConnector } from "./sharepoint";
export { microsoftTeamsConnector } from "./teams";
