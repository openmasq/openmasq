import type { McpConnector } from "../types";

/**
 * Broker sidecar platforms — the `@openmasq/mcp-broker` local broker's OAuth-federated
 * platforms. Ids/display only; the upstream creds stay in apps/mcp-broker.
 */
export const BROKER: McpConnector[] = [
  { id: "demo", name: "Demo", desc: "Bac à sable de démonstration (données d'exemple, sans compte)", transport: "broker" },
  { id: "gmail", name: "Gmail", desc: "Lire et rechercher dans votre boîte mail", category: "productivity", transport: "broker", hosts: ["mail.google.com"] },
  { id: "slack", name: "Slack", desc: "Canaux et messages", category: "productivity", transport: "broker", hosts: ["slack.com"] },
];
