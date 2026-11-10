"""Night bounds for the morning-after overview. The rules live in holdline/static/overview.js."""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class Overview(unittest.TestCase):
    def test_night_grouping(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not installed")
        r = subprocess.run(
            [node, "--test", str(ROOT / "tests" / "test_overview.js")],
            cwd=ROOT, capture_output=True, text=True,
        )
        if r.returncode and 'bun test' in r.stderr and shutil.which("bun"):  # node is a Bun shim on some machines
            r = subprocess.run([shutil.which("bun"), "test", "./tests/test_overview.js"], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)


if __name__ == "__main__":
    unittest.main()
