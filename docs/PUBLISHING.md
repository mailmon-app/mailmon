# NPM Publishing for Mailmon Packages

The Mailmon monorepo contains multiple packages that are published to the NPM registry, including:

- **`@mailmon.dev/sdk`**: The TypeScript SDK generated using Fern.
- **`@mailmon.dev/cli`**: The Mailmon command-line interface.

We use **[Changesets](https://github.com/changesets/changesets)** to automate Semantic Versioning (SemVer), changelog generation, and NPM publishing. The publishing process is handled entirely via GitHub Actions.

## Publishing Workflow (Changesets)

You no longer need to manually bump versions or create Git tags. The workflow is fully automated.

### 1. Generating a Changeset

When you create a Pull Request that introduces a change requiring a new version (e.g., a bug fix or a new feature), you must include a changeset.

Run the following command locally in your branch:

```bash
pnpm changeset
```

An interactive prompt will guide you through:

1. Selecting the packages that changed (e.g., `@mailmon.dev/sdk`, `@mailmon.dev/cli`).
2. Choosing the bump type: `major` (breaking changes), `minor` (new features), or `patch` (bug fixes).
3. Writing a description of the changes. This description will be automatically added to the `CHANGELOG.md`.

This will generate a markdown file inside the `.changeset/` directory. Commit this file and push your branch.

### 2. The "Version Packages" Pull Request

When your branch is merged into `main`, our `.github/workflows/release.yml` GitHub Action triggers.

1. It detects the new `.changeset/` markdown files.
2. It automatically creates or updates a Pull Request titled **"Version Packages"**.
3. This PR contains the calculated version bumps in `package.json` files, deletes the consumed `.changeset` markdown files, and updates the `CHANGELOG.md` files.

### 3. Publishing to NPM

When you are ready to release the new versions to the public, simply **merge the "Version Packages" PR** into `main`.

Upon merging, the `release.yml` workflow will:

1. Build the packages by running `pnpm release` (which compiles the SDK and CLI).
2. Publish the updated packages to NPM.
3. Automatically create and push the appropriate Git tags (e.g., `@mailmon.dev/sdk@1.0.1`).

## Security & Authentication (OIDC)

We use **Trusted Publishing (OpenID Connect / OIDC)** to securely publish packages to NPM without relying on long-lived, hardcoded `NPM_TOKEN` secrets. With this configuration, the NPM registry cryptographically verifies that the publish request originated from our specific GitHub Actions workflow.

### Initializing OIDC on NPM (First-Time Setup)

For each package (`@mailmon.dev/sdk` and `@mailmon.dev/cli`), an organization admin must configure NPM to trust this GitHub repository:

1. Log in to [npmjs.com](https://npmjs.com/).
2. Navigate to the package settings (or organization settings if it's the first package).
3. Locate the **Trusted Publisher** section and click **Add trusted publisher**.
4. Select **GitHub Actions** as the provider and configure it as follows:
   - **Organization or user**: `mailmon-app` (your GitHub organization)
   - **Repository**: `mailmon`
   - **Workflow filename**: `release.yml`
   - **Environment name**: _(leave blank)_

## Local Configuration Highlights

- **`fern/generators.yml`**: Configured to output the TypeScript SDK into `../sdks/typescript` using `local-file-system`. `outputSourceFiles` is set to `false` so Fern pre-compiles CommonJS and ESM modules, avoiding a separate build step before publishing.
- **`apps/cli/tsdown.config.ts`**: The CLI is bundled into a standalone ESM executable (`dist/index.mjs`) using `tsdown`.
- **`apps/cli/package.json`**: All internal monorepo packages (e.g., `@mailmon/core`) are configured as `devDependencies` so `tsdown` completely inlines them into the final CLI bundle.
- **`.changeset/config.json`**: Configures `access` to `public` so changesets publishes packages publicly.
