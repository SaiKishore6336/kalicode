# Contributing to KaliCode

Thanks for taking the time to contribute. Bug reports, feature ideas, and pull
requests are all welcome.

## Reporting bugs

Open an issue with:

- KaliCode and Electron versions (Help → About shows both)
- Your distribution and desktop environment
- Steps to reproduce
- What you expected and what happened
- Relevant output from the **Output** panel or the terminal, if any

Please do not report security vulnerabilities in a public issue — see
[SECURITY.md](SECURITY.md).

## Development setup

Requirements: Node.js 22+, Corepack, Python 3, and Git.

```bash
git clone <your-fork>
cd kalicode
corepack npm install
corepack npm run build
corepack npm start
```

For renderer work, `corepack npm run dev:web` starts Vite on port 5173, and
`KALICODE_DEV=1 corepack npm start` loads it in the app.

## Before opening a pull request

1. `corepack npm run check` passes.
2. `corepack npm run build` succeeds.
3. The affected flow has been tested manually against a real workspace.
4. New behavior is documented in `README.md` when it is user-facing.

## Code style

- Plain ES modules in the renderer; no framework or build-time abstractions.
- Keep privileged operations in the main process and expose them through the
  existing `window.kali` preload API.
- Follow the naming and structure of the surrounding modules.
- Keep UI changes consistent with the existing themes and keyboard model.
- Avoid machine-specific paths; resolve locations from Electron, `os`, or the
  environment.

## Commit messages

Use a short imperative subject line, optionally with a scope:

```
git: handle repositories without commits
terminal: keep focus after resize
```

## License

By contributing, you agree that your contributions are licensed under the
project's [MIT License](LICENSE).
