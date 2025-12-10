#!/usr/bin/env python3
"""
Check Python library compatibility for Next.js integration.

Usage:
    python check-compatibility.py
"""

import sys
import subprocess
import json
from packaging import version


def check_library(lib_name: str, min_version: str) -> dict:
    """Check if library is installed and meets version requirement."""

    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "show", lib_name],
            capture_output=True,
            text=True,
            check=False,
        )

        if result.returncode != 0:
            return {
                "installed": False,
                "version": None,
                "meets_requirement": False,
                "message": f"{lib_name} not installed",
            }

        # Parse version from output
        for line in result.stdout.split("\n"):
            if line.startswith("Version:"):
                installed_version = line.split(": ")[1].strip()
                break
        else:
            return {
                "installed": True,
                "version": "unknown",
                "meets_requirement": False,
                "message": "Version info not found",
            }

        # Compare versions
        meets_requirement = version.parse(installed_version) >= version.parse(
            min_version
        )

        return {
            "installed": True,
            "version": installed_version,
            "required": min_version,
            "meets_requirement": meets_requirement,
            "message": "✅ OK" if meets_requirement else f"⚠️ Upgrade to {min_version}+",
        }

    except Exception as e:
        return {
            "installed": False,
            "version": None,
            "meets_requirement": False,
            "message": f"Error: {str(e)}",
        }


def main():
    # Define minimum required versions
    requirements = {
        "fastapi": "0.100.0",
        "pydantic": "2.0.0",
        "uvicorn": "0.23.0",
        "aiohttp": "3.8.0",
        "cryptography": "40.0.0",
        "motor": "3.0.0",
        "redis": "5.0.0",
    }

    print("Python Library Compatibility Check")
    print("=" * 50)
    print(f"Python version: {sys.version.split()[0]}\n")

    results = {}
    all_ok = True

    for lib, min_ver in requirements.items():
        result = check_library(lib, min_ver)
        results[lib] = result

        status = "✅" if result["meets_requirement"] else "❌"
        version_str = result.get("version", "N/A")
        print(f"{status} {lib:20} {version_str:15} {result['message']}")

        if not result["meets_requirement"]:
            all_ok = False

    print("\n" + "=" * 50)

    if all_ok:
        print("✅ All libraries meet requirements!")
        sys.exit(0)
    else:
        print("⚠️ Some libraries need updates")
        print("\nTo install missing libraries:")
        print("  pip install -r requirements.txt")
        sys.exit(1)


if __name__ == "__main__":
    main()
