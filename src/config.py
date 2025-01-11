"""Configuration management for the kayaking conditions service."""

import os
import yaml
from typing import Dict, Any

def load_config(config_path: str = "config.yaml") -> Dict[str, Any]:
    """Load configuration from YAML file."""
    with open(config_path, 'r') as f:
        return yaml.safe_load(f)

def load_rubric(rubric_path: str = "rubric.md") -> str:
    """Load LLM rubric from markdown file."""
    with open(rubric_path, 'r') as f:
        return f.read()
