"""Fail closed without explicit production secrets and hosts."""
import os

from django.core.exceptions import ImproperlyConfigured

from .settings import *  # noqa: F403

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "")
if len(SECRET_KEY) < 50 or len(set(SECRET_KEY)) < 5 or SECRET_KEY.startswith("django-insecure-"):
    raise ImproperlyConfigured("Production requires a strong DJANGO_SECRET_KEY (50+ characters, at least 5 distinct characters).")
ALLOWED_HOSTS = [host.strip() for host in os.environ.get("DJANGO_ALLOWED_HOSTS", "").split(",") if host.strip()]
if not ALLOWED_HOSTS or "*" in ALLOWED_HOSTS:
    raise ImproperlyConfigured("Production requires explicit DJANGO_ALLOWED_HOSTS; wildcard '*' is forbidden.")
if os.environ.get("DJANGO_DEBUG", "0") != "0":
    raise ImproperlyConfigured("DJANGO_DEBUG must be 0 in production.")
DEBUG = False
# Opt in only behind a proxy which strips client values and sets this header itself.
if os.environ.get("DJANGO_TRUST_PROXY", "0") == "1":
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
