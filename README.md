# Keytra i18n Sync

The official GitHub Action for [Keytra](https://github.com/keytra-app/keytra), the self-hosted, open-source alternative to Crowdin. Push source JSON files, pull translations, or check localization progress.

## Setup

1. Create a project API key (`ktr_...`) in Keytra and store it as the repository secret `KEYTRA_API_KEY`.
2. Store the base URL of your instance as the repository variable `KEYTRA_URL`. It must be reachable from your runners and should use HTTPS.
3. Replace `my-project` below with your project slug.

## Workflows

### 1. Auto-push on main

Uploads the source strings whenever they change.

```yaml
name: Keytra push

on:
  push:
    branches: [main]
    paths: ['locales/en.json']
  workflow_dispatch:

permissions:
  contents: read

concurrency: keytra-push

jobs:
  push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - uses: keytra-app/keytra-action@v1
        with:
          url: ${{ vars.KEYTRA_URL }}
          api-key: ${{ secrets.KEYTRA_API_KEY }}
          project: my-project
          mode: push
          source-path: locales/en.json
```

With one file per namespace, set `source-path: locales/en/*.json` (and `paths: ['locales/en/*.json']`).

> [!IMPORTANT]
> If `source-path` matches **several files**, each file name without `.json` is its namespace. If it matches **exactly one file**, even through a directory or glob, the `namespace` input applies (`default` if unset).

> [!WARNING]
> `prune: true` deletes keys that are missing from the pushed file, **including their translations**.

### 2. Scheduled or manual pull with a pull request

Pulls all target languages and opens (or updates) a pull request.

Enable **Settings → Actions → General → Allow GitHub Actions to create and approve pull requests** first.

```yaml
name: Keytra pull

on:
  schedule:
    - cron: '0 6 * * 1-5'
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

concurrency: keytra-pull

jobs:
  pull:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - id: keytra
        uses: keytra-app/keytra-action@v1
        with:
          url: ${{ vars.KEYTRA_URL }}
          api-key: ${{ secrets.KEYTRA_API_KEY }}
          project: my-project
          mode: pull
          path-template: locales/{locale}.json

      # Runs without changes too, so that an obsolete pull request gets closed.
      - uses: peter-evans/create-pull-request@v7
        with:
          branch: keytra/translations
          add-paths: locales
          commit-message: 'chore(i18n): update translations'
          title: 'chore(i18n): update translations'
          body: |
            Translations pulled from Keytra.

            Changed files: ${{ steps.keytra.outputs.changed-files || 'none' }}
```

Pull requests opened with the default `GITHUB_TOKEN` do not trigger other workflows. Pass a personal access token or GitHub App token as `token` if your checks must run on them.

### 3. CI status check

Fails the job if a target language has missing or outdated translations.

```yaml
name: Keytra status

on:
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  status:
    runs-on: ubuntu-latest
    steps:
      - uses: keytra-app/keytra-action@v1
        with:
          url: ${{ vars.KEYTRA_URL }}
          api-key: ${{ secrets.KEYTRA_API_KEY }}
          project: my-project
          mode: status
          fail-on-incomplete: true
```

Pull requests from forks have no access to secrets, so this check cannot run there.

## Inputs

| Input                | Modes      | Required | Default                                                                                 | Description                                                                                 |
| -------------------- | ---------- | -------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `url`                | all        | yes      |                                                                                         | Base URL of your Keytra instance. Trailing slashes are trimmed. Redirects are not followed. |
| `api-key`            | all        | yes      |                                                                                         | Project API key (`ktr_...`). Masked in logs.                                                |
| `project`            | all        | yes      |                                                                                         | Project slug.                                                                               |
| `mode`               | all        | yes      |                                                                                         | `push`, `pull` or `status`.                                                                 |
| `source-path`        | push       | for push |                                                                                         | JSON file, directory (its direct `*.json` files) or glob.                                   |
| `namespace`          | push, pull | no       | `default`                                                                               | Namespace for a single-file push, or for pull.                                              |
| `namespaces`         | pull       | no       |                                                                                         | Comma-separated namespaces. Overrides `namespace`.                                          |
| `prune`              | push       | no       | `false`                                                                                 | Remove keys that are no longer in the source file.                                          |
| `locales`            | pull       | no       | all target locales                                                                      | Comma-separated locales, e.g. `de,fr,pl`.                                                   |
| `path-template`      | pull       | no       | `locales/{locale}.json`, or `locales/{locale}/{namespace}.json` with several namespaces | Output path. Each downloaded file needs its own path.                                       |
| `format`             | pull       | no       | `nested`                                                                                | `nested` or `flat`.                                                                         |
| `fallback`           | pull       | no       | `source`                                                                                | Value for missing translations: `source` or `empty`.                                        |
| `indent`             | pull       | no       | `2`                                                                                     | JSON indentation in spaces (0-10). Files end with a newline.                                |
| `fail-on-incomplete` | status     | no       | `false`                                                                                 | Fail the step if any target locale has missing or outdated translations.                    |

## Outputs

| Output          | Modes | Description                                                    |
| --------------- | ----- | -------------------------------------------------------------- |
| `summary-json`  | all   | Compact JSON summary of the run.                               |
| `changed-files` | pull  | Comma-separated list of created or modified files.             |
| `has-changes`   | pull  | `true` if any file was created or modified, otherwise `false`. |

Every run also writes a table to the GitHub job summary. Requests time out after 30 seconds.

## Development

Requires Node.js 24 and pnpm.

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

GitHub runs `dist/index.js` straight from the repository, so commit the rebuilt `dist/` with every source change.

## License

[MIT](LICENSE)
