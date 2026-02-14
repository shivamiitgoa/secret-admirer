# Marketing Workspace

This folder stores launch and ongoing marketing materials for MutualWink.

## Structure

- `context/`: canonical product and messaging context.
- `launch/<yyyy-mm>-<campaign>/`: campaign-specific assets.
- `launch/<yyyy-mm>-<campaign>/video/`: video prompts, variants, and production checklists.

## Naming conventions

- Campaign folders: `<yyyy-mm>-<campaign-name>`
- Prompt files: `sora-<asset-name>.md`
- Reusable docs: kebab-case markdown filenames

## Usage

1. Start with `context/product-context.md` before writing campaign copy.
2. Create campaign assets under `launch/<yyyy-mm>-<campaign>/`.
3. Keep final prompts and approved copy in markdown so they are versioned in git.
4. Update context when product behavior, USP wording, or positioning changes.
