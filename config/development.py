"""Local HTTP configuration; manage.py selects this explicitly."""
import os

from .settings import *  # noqa: F403
from .local_secret import local_secret

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY") or local_secret(BASE_DIR / ".local" / "secret-key")
DEBUG = os.environ.get("DJANGO_DEBUG", "0") == "1"
ALLOWED_HOSTS = ["localhost", "127.0.0.1", "[::1]"]
SECURE_SSL_REDIRECT = False
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
SECURE_HSTS_SECONDS = 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = False
SECURE_HSTS_PRELOAD = False
