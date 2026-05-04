# NPM Publishing for Mailmon SDK

The TypeScript SDK for Mailmon is generated using Fern and published to the NPM registry as `@mailmon/sdk`. We use a monorepo setup where the SDK is generated locally into `sdks/typescript` and published automatically from the main repository using GitHub Actions.

## Publishing Workflow

Publishing a new version of the SDK is handled entirely by our CI/CD pipeline. All you need to do is push a version tag.

### 1. Tagging a Release

To publish a new version of the SDK, create and push a Git tag. The CI pipeline will automatically extract the version number from the tag, apply it to the SDK's `package.json`, and publish the package to NPM.

```bash
# Create a tag for your release (e.g., version 1.0.0)
git tag v1.0.0

# Push the tag to GitHub
git push origin v1.0.0
```

### 2. Automated CI/CD Process

The `.github/workflows/ci.yml` file contains a `publish-sdk` job that executes whenever a tag is pushed to the repository.

This job performs the following steps sequentially:

1. Installs Node.js, `pnpm`, and project dependencies.
2. Generates the SDK code using `pnpm sdk:generate`.
3. Extracts the version from the Git tag (e.g., `v1.0.0` becomes `1.0.0`).
4. Updates `sdks/typescript/package.json` to the new version using `npm version <version> --no-git-tag-version`.
5. Publishes the compiled SDK to NPM via `npm publish --access public`.

## Security & Authentication (OIDC)

We use **Trusted Publishing (OpenID Connect / OIDC)** to securely publish packages to NPM without relying on long-lived, hardcoded `NPM_TOKEN` secrets. With this configuration, the NPM registry cryptographically verifies that the publish request originated from our specific GitHub Actions workflow.

### Initializing OIDC on NPM (First-Time Setup)

If the package is being created for the very first time, an organization admin must configure NPM to trust this GitHub repository:

1. Log in to [npmjs.com](https://npmjs.com/).
2. Navigate to the organization or package settings.
3. Locate the **Trusted Publisher** section and click **Add trusted publisher**.
4. Select **GitHub Actions** as the provider and configure it as follows:
   - **Organization or user**: `mailmon-app` (your GitHub organization)
   - **Repository**: `mailmon`
   - **Workflow filename**: `ci.yml`
   - **Environment name**: _(leave blank)_

## Local Configuration Highlights

- **`fern/generators.yml`**: Configured to output the TypeScript SDK into `../sdks/typescript` using `local-file-system`. We set `outputSourceFiles: false` so that Fern outputs pre-compiled CommonJS and ESM modules (`.js` and `.d.ts` files), bypassing the need for a separate build step prior to publishing.
- **`sdks/typescript/package.json`**: Contains the core NPM metadata for the package, including module resolution paths (`main`, `module`, `types`).
- **`sdks/typescript/.fernignore`**: Ensures Fern does not overwrite our manually crafted `package.json` or itself during the SDK generation cycle.
