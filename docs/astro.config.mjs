// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// https://astro.build/config
export default defineConfig({
  site: "https://restio.dev",
  integrations: [
    starlight({
      title: "RestIO",
      description: "A fast, shareable REST API client for your desktop.",
      logo: {
        src: "./src/assets/logo.png",
      },
      favicon: "/favicon.png",
      components: {
        Footer: "./src/components/Footer.astro",
      },
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/ibishek/restio" }],
      sidebar: [
        {
          label: "Start Here",
          items: [
            { label: "Introduction", slug: "getting-started/introduction" },
            { label: "Installation", slug: "getting-started/installation" },
            { label: "Quickstart", slug: "getting-started/quickstart" },
          ],
        },
        {
          label: "Core Concepts",
          items: [
            { label: "Workspaces & Collections", slug: "core/workspaces-collections" },
            { label: "Request Builder & Auth", slug: "core/request-builder" },
            { label: "Rust HTTP Engine", slug: "core/http-engine" },
            { label: "Environments & Variables", slug: "core/environments" },
            { label: "Response Inspector & Timing", slug: "core/response-inspector" },
            { label: "Saved Response Examples", slug: "core/saved-examples" },
            { label: "Send History & Tabs", slug: "core/history-tabs" },
          ],
        },
        {
          label: "Team & Collaboration",
          items: [
            { label: "Git-Backed Sharing", slug: "collaboration/git-sync" },
            { label: "Security & Secret Hygiene", slug: "collaboration/security" },
            { label: "Storage Locations & Paths", slug: "collaboration/storage-locations" },
          ],
        },
        {
          label: "Scripting & Tests",
          items: [
            { label: "Scripting Runtime", slug: "testing/scripting" },
            { label: "Assertions & Expectations", slug: "testing/assertions" },
            { label: "Mock Data (Faker)", slug: "testing/mock-data" },
            { label: "Automated Collection Runner", slug: "testing/collection-runner" },
          ],
        },
        {
          label: "Interoperability",
          items: [
            { label: "OpenAPI & Swagger", slug: "interoperability/openapi-swagger" },
            { label: "Postman Interchange", slug: "interoperability/postman" },
            { label: "Code Generation", slug: "interoperability/code-generation" },
          ],
        },
        {
          label: "User Interface",
          items: [{ label: "Command Palette & Navigation", slug: "ui/command-palette" }],
        },
        {
          label: "Reference",
          items: [
            { label: "rio.* Scripting API", slug: "reference/rio-api" },
            { label: "Keyboard Shortcuts", slug: "reference/keyboard-shortcuts" },
            { label: "Architecture & Engine", slug: "reference/architecture" },
            { label: "Troubleshooting & FAQ", slug: "reference/troubleshooting" },
            { label: "Product Roadmap", slug: "reference/roadmap" },
          ],
        },
      ],
    }),
  ],
});
