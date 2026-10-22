"""Regenerate frontend/src/lib/api-schema.d.ts from the API's OpenAPI spec.

Run by pre-commit on backend changes, so the commit (or CI's `lint` job) fails
when the checked-in types have drifted. See docs/adr/0001.
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "frontend" / "src" / "lib" / "api-schema.d.ts"
GENERATOR = (
    ROOT / "frontend/tools/openapi-typescript/node_modules/.bin/openapi-typescript"
)


def main() -> int:
    # Settings requires DATABASE_URL, but dumping the spec never connects, and
    # CI's lint job has no .env.
    os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://spec@localhost/spec")
    # The app won't start without the frontend build, which CI's lint job
    # skips; the spec doesn't depend on it.
    (ROOT / "frontend" / "dist").mkdir(exist_ok=True)
    from anvil.main import app

    with tempfile.TemporaryDirectory() as tmp:
        spec = Path(tmp) / "openapi.json"
        spec.write_text(json.dumps(app.openapi()))
        generate = [
            GENERATOR,
            spec,
            "--output",
            OUTPUT,
            "--root-types",
            "--root-types-no-schema-prefix",
        ]
        return subprocess.run(generate, check=False).returncode


if __name__ == "__main__":
    sys.exit(main())
