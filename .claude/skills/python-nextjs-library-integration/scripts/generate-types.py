#!/usr/bin/env python3
"""
Generate TypeScript types from Python Pydantic models.

Usage:
    python generate-types.py models.py > types/python-generated.ts
"""

import sys
import importlib.util
from typing import get_type_hints, get_origin, get_args
from pydantic import BaseModel


def python_type_to_ts(py_type) -> str:
    """Map Python type to TypeScript type."""

    # Handle None
    if py_type is type(None):
        return "null"

    # Handle built-in types
    type_map = {
        str: "string",
        int: "number",
        float: "number",
        bool: "boolean",
        list: "any[]",
        dict: "Record<string, any>",
    }

    if py_type in type_map:
        return type_map[py_type]

    # Handle generic types (List, Optional, etc.)
    origin = get_origin(py_type)
    args = get_args(py_type)

    if origin is list:
        if args:
            return f"{python_type_to_ts(args[0])}[]"
        return "any[]"

    if origin is dict:
        if len(args) == 2:
            return f"Record<{python_type_to_ts(args[0])}, {python_type_to_ts(args[1])}>"
        return "Record<string, any>"

    # Handle Union types (Optional is Union[T, None])
    if origin is type(int | str):  # Union in Python 3.10+
        ts_types = [python_type_to_ts(arg) for arg in args]
        return " | ".join(ts_types)

    # Fallback
    return "any"


def model_to_typescript(model: type[BaseModel]) -> str:
    """Convert Pydantic model to TypeScript interface."""

    fields = model.model_fields
    lines = [f"export interface {model.__name__} {{"]

    for field_name, field_info in fields.items():
        ts_type = python_type_to_ts(field_info.annotation)
        optional = "?" if not field_info.is_required() else ""
        lines.append(f"  {field_name}{optional}: {ts_type};")

    lines.append("}")

    return "\n".join(lines)


def main():
    if len(sys.argv) < 2:
        print("Usage: python generate-types.py <module.py>", file=sys.stderr)
        sys.exit(1)

    module_path = sys.argv[1]

    # Import module dynamically
    spec = importlib.util.spec_from_file_location("models", module_path)
    if not spec or not spec.loader:
        print(f"Error: Could not load {module_path}", file=sys.stderr)
        sys.exit(1)

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    # Find all Pydantic models
    print("// Auto-generated TypeScript types from Python Pydantic models")
    print(f"// Source: {module_path}\n")

    for name in dir(module):
        obj = getattr(module, name)
        if isinstance(obj, type) and issubclass(obj, BaseModel) and obj is not BaseModel:
            print(model_to_typescript(obj))
            print()


if __name__ == "__main__":
    main()
