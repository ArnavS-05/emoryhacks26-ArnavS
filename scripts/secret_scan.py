"""Pre-push secret scan over files git would commit. Exit 1 on any finding. Never prints secret values."""
import re
import subprocess
import sys

PATTERNS = {
    "Google API key": re.compile(r"AIza[0-9A-Za-z_\-]{35}"),
    "Postgres URL with password": re.compile(r"postgres(?:ql)?(?:\+\w+)?://[^:\s/]+:[^@\s]{6,}@"),
    "Private key": re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    "Generic secret assignment": re.compile(
        r"(?i)(api[_-]?key|secret|password|access[_-]?code)\s*[=:]\s*['\"][A-Za-z0-9_\-]{20,}['\"]"),
    "Env assignment with value": re.compile(
        r"^(GEMINI_API_KEY|TYPESENSE_ADMIN_API_KEY|TYPESENSE_SEARCH_API_KEY|TIGER_DATABASE_URL|SESSION_SIGNING_SECRET|CLINICIAN_ACCESS_CODE)=\S+",
        re.M),
}
SKIP = (".png", ".jpg", ".woff", ".woff2", ".task", ".wasm", ".ico", ".pdf")


def files() -> list[str]:
    out = subprocess.run(["git", "ls-files", "--cached", "--others", "--exclude-standard"], capture_output=True, text=True, check=True)
    return [f for f in out.stdout.splitlines() if not f.endswith(SKIP)]


def main() -> int:
    findings = []
    for f in files():
        if f.endswith("secret_scan.py"):
            continue
        try:
            text = open(f, encoding="utf-8", errors="ignore").read()
        except (FileNotFoundError, IsADirectoryError):
            continue
        for name, pat in PATTERNS.items():
            for m in pat.finditer(text):
                line = text.count("\n", 0, m.start()) + 1
                findings.append(f"{f}:{line}: {name}")
    if findings:
        print("SECRET SCAN FAILED:")
        print("\n".join(findings))
        return 1
    print(f"secret scan: OK ({len(files())} files checked)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
