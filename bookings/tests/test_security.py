import json
import os
import runpy
import secrets
import tempfile
from datetime import date
from pathlib import Path
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ImproperlyConfigured
from django.test import Client, SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from django.views.defaults import server_error
from django.test import RequestFactory

from bookings.models import Booking, InventoryItem, Member
from bookings.services import book_item
from config.local_secret import local_secret


@override_settings(FRONTEND_INDEX_FILE=Path(__file__).with_name("fixtures") / "angular-index.html")
class AccessSecurityTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.password = secrets.token_urlsafe(24)
        users = get_user_model().objects
        cls.staff = users.create_user("desk", password=cls.password, is_staff=True)
        cls.other_staff = users.create_user("other-desk", is_staff=True)
        cls.ordinary = users.create_user("ordinary", password=cls.password)
        cls.inactive = users.create_user("inactive", is_staff=True, is_active=False)
        cls.member = Member.objects.create(name="Private", surname="Member", date_joined=timezone.now())
        cls.item = InventoryItem.objects.create(title="Experience", description="Trip", remaining_count=3, expiration_date=date(2030, 1, 1))
        cls.booking = book_item(member_id=cls.member.pk, item_id=cls.item.pk)

    def setUp(self):
        self.browser = Client(enforce_csrf_checks=True)

    def post_json(self, path, payload, *, token=None, **headers):
        if token is None:
            token = self.browser.get("/api/csrf").json()["csrf_token"]
        return self.browser.post(path, json.dumps(payload), content_type="application/json", HTTP_X_CSRFTOKEN=token, **headers)

    def assert_counts_unchanged(self):
        self.member.refresh_from_db()
        self.item.refresh_from_db()
        self.booking.refresh_from_db()
        self.assertEqual(self.member.booking_count, 1)
        self.assertEqual(self.item.remaining_count, 2)
        self.assertIsNone(self.booking.cancelled_at)
        self.assertEqual(Booking.objects.count(), 1)

    def test_anonymous_cannot_read_pages_or_confirmation(self):
        for path in ["/", "/bookings/", f"/bookings/?confirmed={self.booking.pk}", f"/bookings/?cancelled={self.booking.pk}"]:
            with self.subTest(path=path):
                response = self.browser.get(path)
                self.assertEqual(response.status_code, 302)
                self.assertTrue(response.url.startswith("/accounts/login/?next="))
                self.assertNotIn(b"Private Member", response.content)
                self.assertIn("no-store", response["Cache-Control"])

    def test_original_anonymous_write_exploits_denied_with_valid_csrf(self):
        for path, payload in [
            ("/book", {"member_id": self.member.pk, "item_id": self.item.pk}),
            ("/cancel", {"member_id": self.member.pk, "booking_reference": str(self.booking.pk)}),
        ]:
            response = self.post_json(path, payload)
            self.assertEqual(response.status_code, 401)
            self.assertEqual(response.json()["error"]["code"], "authentication_required")
            self.assertIn("no-store", response["Cache-Control"])
        token = self.browser.get("/api/csrf").json()["csrf_token"]
        response = self.browser.post("/bookings/", {"action": "book", "member": self.member.pk, "item": self.item.pk, "csrfmiddlewaretoken": token})
        self.assertEqual(response.status_code, 302)
        self.assert_counts_unchanged()

    def test_ordinary_user_cannot_access_data_or_mutate_bookings(self):
        self.browser.force_login(self.ordinary)
        for path in ["/", "/bookings/", f"/bookings/?confirmed={self.booking.pk}"]:
            response = self.browser.get(path)
            self.assertEqual(response.status_code, 403)
            self.assertNotIn(b"Private Member", response.content)
        for path, payload in [
            ("/book", {"member_id": self.member.pk, "item_id": self.item.pk}),
            ("/cancel", {"member_id": self.member.pk, "booking_reference": str(self.booking.pk)}),
        ]:
            response = self.post_json(path, payload)
            self.assertEqual(response.status_code, 403)
            self.assertEqual(response.json()["error"]["code"], "permission_denied")
        token = self.browser.get("/api/csrf").json()["csrf_token"]
        response = self.browser.post("/bookings/", {"action": "cancel", "cancel-member": self.member.pk, "cancel-booking_reference": str(self.booking.pk), "csrfmiddlewaretoken": token})
        self.assertEqual(response.status_code, 403)
        self.assert_counts_unchanged()

    def test_inactive_or_revoked_staff_loses_access(self):
        self.browser.force_login(self.inactive)
        self.assertEqual(self.browser.get("/").status_code, 302)
        self.browser.force_login(self.staff)
        get_user_model().objects.filter(pk=self.staff.pk).update(is_staff=False)
        self.assertEqual(self.browser.get("/bookings/").status_code, 403)
        self.assertEqual(self.post_json("/book", {"member_id": self.member.pk, "item_id": self.item.pk}).status_code, 403)
        self.assert_counts_unchanged()

    def test_staff_policy_allows_another_staff_member_to_manage_bookings(self):
        self.browser.force_login(self.other_staff)
        response = self.browser.get(f"/api/bookings/{self.booking.pk}")
        self.assertEqual(response.json()["member_name"], str(self.member))
        self.assertIn("no-store", response["Cache-Control"])
        response = self.post_json("/cancel", {"member_id": self.member.pk, "booking_reference": str(self.booking.pk)})
        self.assertEqual(response.status_code, 200)
        response = self.post_json("/book", {"member_id": self.member.pk, "item_id": self.item.pk})
        self.assertEqual(response.status_code, 201)
        self.assertIn("no-store", response["Cache-Control"])

    def sign_in(self, username="desk", **extra):
        token = self.browser.get("/api/csrf").json()["csrf_token"]
        old_session = self.browser.session.session_key
        response = self.browser.post("/accounts/login/", {"username": username, "password": self.password, "csrfmiddlewaretoken": token, **extra})
        return response, token, old_session

    def test_real_login_rotates_session_and_csrf_then_api_works(self):
        response, old_token, old_session = self.sign_in()
        self.assertRedirects(response, "/", fetch_redirect_response=False)
        self.assertNotEqual(self.browser.session.session_key, old_session)
        payload = {"member_id": self.member.pk, "item_id": self.item.pk}
        self.assertEqual(self.post_json("/book", payload, token=old_token).status_code, 403)
        self.assertEqual(self.post_json("/book", payload).status_code, 201)

    def test_login_csrf_and_invalid_credentials_or_role(self):
        response = self.browser.post("/accounts/login/", {"username": "desk", "password": self.password})
        self.assertEqual(response.status_code, 403)
        for username in ["ordinary", "missing"]:
            response, _, _ = self.sign_in(username)
            self.assertContains(response, "Please enter a correct username and password for a staff account.")
            self.assertNotIn("_auth_user_id", self.browser.session)

    def test_login_rejects_external_redirect_target(self):
        response, _, _ = self.sign_in(next="https://evil.example/steal")
        self.assertEqual(response.url, "/")

    def test_logout_requires_post_and_csrf_then_invalidates_access(self):
        self.browser.force_login(self.staff)
        self.assertEqual(self.browser.get("/accounts/logout/").status_code, 405)
        self.assertEqual(self.browser.post("/accounts/logout/").status_code, 403)
        self.assertEqual(self.browser.get("/").status_code, 200)
        token = self.browser.get("/api/csrf").json()["csrf_token"]
        self.assertEqual(self.browser.post("/accounts/logout/", {"csrfmiddlewaretoken": token}).status_code, 302)
        self.assertNotIn("_auth_user_id", self.browser.session)
        self.assertEqual(self.post_json("/cancel", {"member_id": self.member.pk, "booking_reference": str(self.booking.pk)}).status_code, 401)
        self.assert_counts_unchanged()

    def test_authenticated_api_still_rejects_untrusted_origin(self):
        self.browser.force_login(self.staff)
        response = self.post_json("/book", {"member_id": self.member.pk, "item_id": self.item.pk}, HTTP_ORIGIN="https://evil.example")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["error"]["code"], "csrf_failed")
        self.assert_counts_unchanged()

    @override_settings(SECURE_SSL_REDIRECT=True, SESSION_COOKIE_SECURE=True, CSRF_COOKIE_SECURE=True, SECURE_HSTS_SECONDS=31536000, SECURE_HSTS_INCLUDE_SUBDOMAINS=True, SECURE_HSTS_PRELOAD=True)
    def test_https_sign_in_sets_secure_http_only_session_cookie(self):
        token = self.browser.get("/api/csrf", secure=True).json()["csrf_token"]
        response = self.browser.post("/accounts/login/", {
            "username": "desk", "password": self.password, "csrfmiddlewaretoken": token,
        }, secure=True, HTTP_REFERER="https://testserver/accounts/login/")
        self.assertEqual(response.status_code, 302)
        cookie = response.cookies[settings.SESSION_COOKIE_NAME]
        self.assertTrue(cookie["secure"])
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["samesite"], "Lax")
        self.assertEqual(self.browser.get("/bookings/", secure=True).status_code, 200)

    @override_settings(DEBUG=False)
    def test_errors_are_generic_and_security_headers_present(self):
        response = self.browser.get("/does-not-exist/")
        self.assertContains(response, "Page not found", status_code=404)
        for internal in ["config.urls", "Traceback", "urlpatterns", "DJANGO_SETTINGS_MODULE"]:
            self.assertNotIn(internal.encode(), response.content)
        self.assertEqual(response["X-Frame-Options"], "DENY")
        self.assertEqual(response["X-Content-Type-Options"], "nosniff")
        self.assertEqual(response["Referrer-Policy"], "same-origin")
        response = server_error(RequestFactory().get("/"))
        self.assertContains(response, "Something went wrong", status_code=500)
        self.assertNotIn(b"Traceback", response.content)


@override_settings(FRONTEND_INDEX_FILE=Path(__file__).with_name("fixtures") / "angular-index.html")
class ConfigurationSecurityTests(SimpleTestCase):
    def production(self, **changes):
        environment = {"DJANGO_SECRET_KEY": secrets.token_urlsafe(64), "DJANGO_ALLOWED_HOSTS": "reservations.example.com", "DJANGO_DEBUG": "0"}
        environment.update(changes)
        with patch.dict(os.environ, environment, clear=True):
            return runpy.run_module("config.production")

    def test_production_rejects_missing_weak_secrets_debug_and_wildcard_hosts(self):
        for values in [
            {"DJANGO_SECRET_KEY": ""}, {"DJANGO_SECRET_KEY": "short"},
            {"DJANGO_SECRET_KEY": "a" * 70}, {"DJANGO_SECRET_KEY": "django-insecure-" + secrets.token_urlsafe(64)},
            {"DJANGO_DEBUG": "1"}, {"DJANGO_ALLOWED_HOSTS": ""},
            {"DJANGO_ALLOWED_HOSTS": "*"}, {"DJANGO_ALLOWED_HOSTS": "example.com, *"},
        ]:
            with self.subTest(values=list(values)), self.assertRaises(ImproperlyConfigured):
                self.production(**values)

    def test_production_has_secure_transport_and_sessions(self):
        config = self.production()
        self.assertFalse(config["DEBUG"])
        for name in ["SECURE_SSL_REDIRECT", "SESSION_COOKIE_SECURE", "CSRF_COOKIE_SECURE", "SESSION_COOKIE_HTTPONLY", "SESSION_EXPIRE_AT_BROWSER_CLOSE", "SECURE_HSTS_INCLUDE_SUBDOMAINS", "SECURE_HSTS_PRELOAD"]:
            self.assertTrue(config[name], name)
        self.assertEqual(config["SECURE_HSTS_SECONDS"], 31536000)
        self.assertNotIn("SECURE_PROXY_SSL_HEADER", config)
        self.assertEqual(self.production(DJANGO_TRUST_PROXY="1")["SECURE_PROXY_SSL_HEADER"], ("HTTP_X_FORWARDED_PROTO", "https"))

    def test_local_secret_is_unique_persistent_and_rejects_corruption(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / ".local" / "secret-key"
            first = local_secret(path)
            self.assertGreaterEqual(len(first), 50)
            self.assertEqual(first, local_secret(path))
            self.assertNotEqual(first, local_secret(Path(temporary) / "other" / "secret-key"))
            if os.name != "nt":
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            path.write_text("bad", encoding="utf-8")
            with self.assertRaises(ImproperlyConfigured):
                local_secret(path)

    def test_shared_defaults_never_enable_debug_or_supply_a_secret(self):
        with patch.dict(os.environ, {}, clear=True):
            config = runpy.run_path(str(Path(__file__).resolve().parents[2] / "config" / "settings.py"))
        self.assertFalse(config["DEBUG"])
        self.assertEqual(config["SECRET_KEY"], "")
        self.assertEqual(config["ALLOWED_HOSTS"], [])

    def test_production_https_redirect_cookie_and_hsts_behavior(self):
        config = self.production()
        overrides = {key: config[key] for key in ["SECURE_SSL_REDIRECT", "SESSION_COOKIE_SECURE", "CSRF_COOKIE_SECURE", "SECURE_HSTS_SECONDS", "SECURE_HSTS_INCLUDE_SUBDOMAINS", "SECURE_HSTS_PRELOAD"]}
        with override_settings(**overrides):
            browser = Client()
            response = browser.get("/accounts/login/")
            self.assertEqual(response.status_code, 301)
            self.assertEqual(response.url, "https://testserver/accounts/login/")
            response = browser.get("/accounts/login/", secure=True)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response["Strict-Transport-Security"], "max-age=31536000; includeSubDomains; preload")
            response = browser.get("/api/csrf", secure=True)
            self.assertTrue(response.cookies[settings.CSRF_COOKIE_NAME]["secure"])
