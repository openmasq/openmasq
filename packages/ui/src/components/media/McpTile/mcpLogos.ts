// The brand marks moved to `@openmasq/catalog/mcp`, beside the connector list they belong
// to: they are pure data, and the proxy's console renders them too — a Node CLI that cannot
// import a React package (rule 9, one home). Re-exported here so the components that had
// them keep their import path.
export { MCP_LOGOS, MCP_LOGO_IMAGES, type BrandLogo } from "@openmasq/catalog/mcp";
