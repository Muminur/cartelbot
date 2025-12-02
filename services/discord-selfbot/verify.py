"""
Verification script to test Discord Self-Bot Service installation.
"""
import sys
import importlib.util
from pathlib import Path


def check_file_exists(filepath: str) -> bool:
    """Check if a file exists."""
    path = Path(filepath)
    exists = path.exists()
    status = "[OK]" if exists else "[MISSING]"
    print(f"{status} {filepath}")
    return exists


def check_module_import(module_name: str) -> bool:
    """Check if a module can be imported."""
    try:
        spec = importlib.util.find_spec(module_name)
        importable = spec is not None
        status = "[OK]" if importable else "[NOT INSTALLED]"
        print(f"{status} {module_name}")
        return importable
    except Exception as e:
        print(f"[ERROR] {module_name} - Error: {e}")
        return False


def main():
    """Run verification checks."""
    print("=" * 60)
    print("Discord Self-Bot Service - Installation Verification")
    print("=" * 60)

    all_checks_passed = True

    # Check required files
    print("\n[Required Files]:")
    required_files = [
        "requirements.txt",
        "main.py",
        "client_manager.py",
        "message_handler.py",
        "signal_forwarder.py",
        "encryption.py",
        "health.py",
        "Dockerfile",
        ".env.example",
        ".dockerignore",
        "README.md"
    ]

    for file in required_files:
        if not check_file_exists(file):
            all_checks_passed = False

    # Check Python modules (only if installed)
    print("\n[Python Dependencies] (check after pip install):")
    optional_modules = [
        "fastapi",
        "uvicorn",
        "pymongo",
        "motor",
        "aiohttp",
        "cryptography",
        "dotenv",
        "pydantic"
    ]

    modules_installed = 0
    for module in optional_modules:
        if check_module_import(module):
            modules_installed += 1

    # Summary
    print("\n" + "=" * 60)
    print("Summary:")
    print(f"  Files: {sum(check_file_exists(f) for f in required_files)}/{len(required_files)}")
    print(f"  Modules: {modules_installed}/{len(optional_modules)} (optional - install with pip)")
    print("=" * 60)

    if all_checks_passed:
        print("\n[OK] All required files created successfully!")
        print("\nNext steps:")
        print("  1. Create virtual environment: python -m venv venv")
        print("  2. Activate: source venv/bin/activate (Windows: venv\\Scripts\\activate)")
        print("  3. Install dependencies: pip install -r requirements.txt")
        print("  4. Copy .env.example to .env and configure")
        print("  5. Run service: python main.py")
    else:
        print("\n[ERROR] Some files are missing. Please check the output above.")
        sys.exit(1)


if __name__ == "__main__":
    main()
