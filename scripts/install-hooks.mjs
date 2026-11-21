// Instala un hook de pre-commit que ejecuta gitleaks sobre lo que se va a commitear.
import { existsSync, writeFileSync, chmodSync } from 'node:fs'

if (!existsSync('.git')) process.exit(0)
const hook = `#!/bin/sh
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks protect --staged --redact -v || { echo "gitleaks ha encontrado secretos. Commit cancelado."; exit 1; }
else
  echo "Aviso: gitleaks no está instalado; se omite la comprobación local."
fi
`
writeFileSync('.git/hooks/pre-commit', hook)
chmodSync('.git/hooks/pre-commit', 0o755)
