#!/usr/bin/env python3
"""Run the deterministic PAL fixed-interior regression suite.

Usage:
  python3 tools/shop_regression.py /tmp/rta-shop-regressions
  python3 tools/shop_regression.py /tmp/rta-shop-regressions peach-bartender fuji-barkeeper

The baseline catalogue lives in `_shop_regression_impl.py`; this launcher keeps
repository-path plumbing separate from the large evidence-bearing table.
"""

from __future__ import annotations

from pathlib import Path

import _shop_regression_impl as regression

REPO_ROOT = Path(__file__).resolve().parent.parent
regression.BUNDLE = REPO_ROOT / "rtao" / "sandbox-dist" / "rta-sandbox-capture.js"

if __name__ == "__main__":
    regression.main()
