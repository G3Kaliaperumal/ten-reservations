"""Generate a stable, untracked development key, never a shared fallback."""
import os
import secrets
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured


def local_secret(path: Path) -> str:
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    try:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        pass
    else:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            stream.write(secrets.token_urlsafe(64))
    key = path.read_text(encoding="utf-8").strip()
    if len(key) < 50 or len(set(key)) < 5:
        raise ImproperlyConfigured("The local secret file is invalid. Stop the app, remove .local/secret-key and restart.")
    return key
