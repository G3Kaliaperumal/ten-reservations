import json
import secrets
from datetime import date
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.utils import timezone

from bookings.models import Booking, InventoryItem, Member
from bookings.services import book_item


class AngularApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.password = secrets.token_urlsafe(24)
        cls.staff = get_user_model().objects.create_user("angular-staff", password=cls.password, is_staff=True)
        cls.other_staff = get_user_model().objects.create_user("second-staff", is_staff=True)
        cls.ordinary = get_user_model().objects.create_user("ordinary", password=cls.password)
        cls.member = Member.objects.create(name="Emily", surname="Johnson", date_joined=timezone.now())
        cls.item = InventoryItem.objects.create(title="Bali", description='<script>alert("test")</script>', remaining_count=2, expiration_date=date(2030, 1, 1))
        cls.sold_out = InventoryItem.objects.create(title="Sold out", description="No stock", remaining_count=0, expiration_date=date(2020, 1, 1))
        cls.booking = book_item(member_id=cls.member.pk, item_id=cls.item.pk)

    def setUp(self):
        self.browser = Client(enforce_csrf_checks=True)

    def token(self):
        return self.browser.get("/api/csrf").json()["csrf_token"]

    def post(self, path, payload, token=None, **headers):
        return self.browser.post(path, json.dumps(payload), content_type="application/json", HTTP_X_CSRFTOKEN=token or self.token(), **headers)

    def read_paths(self):
        return ["/api/inventory", "/api/booking-options", "/api/bookings", f"/api/bookings/{self.booking.pk}"]

    def test_all_reads_require_active_staff_and_do_not_leak_data(self):
        for user, expected in [(None, 401), (self.ordinary, 403)]:
            if user:
                self.browser.force_login(user)
            for path in self.read_paths():
                with self.subTest(path=path, role=expected):
                    response = self.browser.get(path)
                    self.assertEqual(response.status_code, expected)
                    self.assertNotIn(b"Emily", response.content)
                    self.assertIn("no-store", response["Cache-Control"])

    def test_anonymous_session_status_has_no_member_information(self):
        response = self.browser.get("/api/auth/session")
        self.assertEqual(response.json(), {"authenticated": False, "user": None})
        self.assertIn("no-store", response["Cache-Control"])

    def test_json_sign_in_rotates_csrf_and_session_and_sign_out_revokes_access(self):
        old_token = self.token()
        old_session = self.browser.session.session_key
        response = self.post("/api/auth/login", {"username": "angular-staff", "password": self.password}, old_token)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["authenticated"])
        self.assertEqual(response.json()["user"], {"username": "angular-staff", "is_staff": True})
        self.assertNotEqual(self.browser.session.session_key, old_session)
        self.assertIn("no-store", response["Cache-Control"])
        self.assertTrue(self.browser.get("/api/auth/session").json()["authenticated"])
        self.assertEqual(self.post("/api/auth/logout", {}, old_token).status_code, 403)
        self.assertEqual(self.post("/api/auth/logout", {}).status_code, 200)
        self.assertEqual(self.browser.get("/api/bookings").status_code, 401)

    def test_login_rejects_invalid_credentials_nonstaff_inactive_and_extra_fields(self):
        get_user_model().objects.create_user("inactive", password=self.password, is_staff=True, is_active=False)
        for username in ["missing", "ordinary", "inactive"]:
            response = self.post("/api/auth/login", {"username": username, "password": self.password})
            self.assertEqual(response.status_code, 401)
            self.assertEqual(response.json()["error"]["code"], "invalid_credentials")
            self.assertNotIn("_auth_user_id", self.browser.session)
        for payload in [{}, {"username": 12, "password": "x"}, {"username": "x", "password": "x", "is_staff": True}]:
            self.assertEqual(self.post("/api/auth/login", payload).status_code, 400)

    def test_login_and_logout_require_csrf_and_login_checks_origin(self):
        payload = {"username": "angular-staff", "password": self.password}
        response = self.browser.post("/api/auth/login", json.dumps(payload), content_type="application/json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["error"]["code"], "csrf_failed")
        self.assertEqual(self.post("/api/auth/login", payload, HTTP_ORIGIN="https://evil.invalid").status_code, 403)
        self.browser.force_login(self.staff)
        self.assertEqual(self.browser.get("/api/auth/logout").status_code, 405)
        self.assertEqual(self.browser.post("/api/auth/logout", "{}", content_type="application/json").status_code, 403)

    def test_inventory_search_filters_and_cover_metadata(self):
        self.browser.force_login(self.staff)
        response = self.browser.get("/api/inventory?q=bali&available=1")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["total_items"], 2)
        self.assertEqual(data["member_count"], 1)
        self.assertEqual([item["id"] for item in data["items"]], [self.item.pk])
        self.assertEqual(data["items"][0]["cover_url"], "/static/bookings/images/bali.jpg")
        self.assertEqual(data["items"][0]["description"], self.item.description)
        self.assertFalse(data["items"][0]["is_expired"])
        self.assertEqual(self.browser.get("/api/inventory?q=missing").json()["items"], [])
        sold_out = self.browser.get("/api/inventory?q=Sold").json()["items"][0]
        self.assertTrue(sold_out["is_expired"])
        self.assertEqual(sold_out["cover_url"], "")

    def test_selector_data_and_booking_detail_observe_staff_policy(self):
        self.browser.force_login(self.other_staff)
        options = self.browser.get("/api/booking-options").json()
        self.assertEqual(options["max_bookings"], 2)
        self.assertEqual(options["members"][0]["booking_count"], 1)
        self.assertEqual(len(options["items"]), 2)
        detail = self.browser.get(f"/api/bookings/{self.booking.pk}").json()
        self.assertEqual(detail["booking_reference"], str(self.booking.pk))
        self.assertEqual(detail["member_name"], str(self.member))
        self.assertEqual(detail["item_title"], str(self.item))
        self.assertEqual(detail["status"], "active")
        self.assertEqual(self.browser.get(f"/api/bookings/{uuid4()}").status_code, 404)

    def test_recent_activity_is_bounded_ordered_and_updates_after_cancellation(self):
        Booking.objects.bulk_create([Booking(member=self.member, item=self.item) for _ in range(17)])
        self.browser.force_login(self.staff)
        response = self.browser.get("/api/bookings")
        self.assertEqual(response.json()["pagination"]["page_size"], 5)
        self.assertEqual(response.json()["pagination"]["total_count"], 18)
        records = response.json()["bookings"]
        self.assertEqual(len(records), 5)
        self.assertEqual([row["booked_at"] for row in records], sorted([row["booked_at"] for row in records], reverse=True))
        response = self.post("/cancel", {"member_id": self.member.pk, "booking_reference": str(self.booking.pk)})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.browser.get(f"/api/bookings/{self.booking.pk}").json()["status"], "cancelled")

    def test_reads_are_get_only_no_store_and_revoked_staff_loses_access(self):
        self.browser.force_login(self.staff)
        for path in self.read_paths():
            response = self.browser.get(path)
            self.assertIn("no-store", response["Cache-Control"])
            self.assertEqual(self.post(path, {}).status_code, 405)
        get_user_model().objects.filter(pk=self.staff.pk).update(is_staff=False)
        for path in self.read_paths():
            self.assertEqual(self.browser.get(path).status_code, 403)
