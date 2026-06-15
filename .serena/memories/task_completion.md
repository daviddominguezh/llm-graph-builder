# Task Completion

After finishing code changes, run the check for affected scope:
- Single package: `npm run check -w packages/<name>` (= prettier + eslint + tsc).
- Cross-package / unsure: `npm run check` (root; runs all packages in dependency order).

Must pass clean: no prettier diffs, no eslint errors (remember: no disabling rules), no type errors.
If tests touched, run `npm run test -w packages/<name>` (api/web tests already include the `--experimental-vm-modules` flag in their script).
