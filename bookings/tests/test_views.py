import json
from pathlib import Path
from datetime import date
from uuid import uuid4

from django.test import Client, TestCase, override_settings
from django.contrib.auth import get_user_model
from django.utils import timezone

from bookings.models import Booking, InventoryItem, Member
from bookings.services import book_item


@override_settings(FRONTEND_INDEX_FILE=Path(__file__).with_name("fixtures") / "angular-index.html")
class ViewTests(TestCase):
    def setUp(self):
        self.staff = get_user_model().objects.create_user(username="view_staff", is_staff=True)
        self.client.force_login(self.staff)
        self.member = Member.objects.create(name="Emily", surname="Johnson", date_joined=timezone.now())
        self.item = InventoryItem.objects.create(title="Bali", description="A trip", remaining_count=1, expiration_date=date(2030, 11, 19))
        self.payload = {"member_id": self.member.pk, "item_id": self.item.pk}

    def post_json(self, path, payload):
        return self.client.post(path, json.dumps(payload), content_type="application/json")

    def test_book_and_cancel_api_contract(self):
        response = self.post_json("/book", self.payload)
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["member_id"], self.member.pk)
        self.assertEqual(data["item_id"], self.item.pk)
        self.assertEqual(data["status"], "active")
        self.assertIsNone(data["cancelled_at"])
        response = self.post_json("/cancel", {"member_id": self.member.pk, "booking_reference": data["booking_reference"]})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "cancelled")
        self.assertIsNotNone(response.json()["cancelled_at"])

    def test_api_business_failures_are_structured(self):
        self.post_json("/book", self.payload)
        response = self.post_json("/book", self.payload)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["error"]["code"], "out_of_stock")
        self.assertTrue(response.json()["error"]["message"])

    def test_api_member_limit(self):
        Member.objects.filter(pk=self.member.pk).update(booking_count=2)
        response = self.post_json("/book", self.payload)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["error"]["code"], "booking_limit")

    def test_get_rejected_with_allow_header(self):
        for path in ["/book", "/cancel"]:
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 405)
                self.assertEqual(response["Allow"], "POST")
                self.assertEqual(response.json()["error"]["code"], "method_not_allowed")

    def test_wrong_content_type(self):
        response = self.client.post("/book", self.payload)
        self.assertEqual(response.status_code, 415)

    def test_malformed_json_and_nonobjects(self):
        for body in ["{", "[]", "null", "3", '"hello"', b"\xff"]:
            with self.subTest(body=body):
                response = self.client.post("/book", body, content_type="application/json")
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()["error"]["code"], "invalid_json")

    def test_invalid_fields_and_integer_types(self):
        for payload in [{}, {"member_id": 1}, {**self.payload, "other": 1}, {**self.payload, "member_id": "1"}, {**self.payload, "member_id": True}, {**self.payload, "member_id": 1.0}, {**self.payload, "item_id": 0}, {**self.payload, "item_id": -1}, {**self.payload, "item_id": 2**64}, {**self.payload, "member_id": None}]:
            with self.subTest(payload=payload):
                self.assertEqual(self.post_json("/book", payload).status_code, 400)
        self.assertFalse(Booking.objects.exists())

    def test_missing_member_or_item(self):
        for payload in [{**self.payload, "member_id": 999}, {**self.payload, "item_id": 999}]:
            with self.subTest(payload=payload):
                self.assertEqual(self.post_json("/book", payload).status_code, 404)

    def test_cancel_reference_validation_and_not_found(self):
        for value in [None, 123, [], "broken"]:
            with self.subTest(value=value):
                self.assertEqual(self.post_json("/cancel", {"member_id": self.member.pk, "booking_reference": value}).status_code, 400)
        self.assertEqual(self.post_json("/cancel", {"member_id": self.member.pk, "booking_reference": str(uuid4())}).status_code, 404)

    def test_repeated_api_cancellation(self):
        booking = book_item(**self.payload)
        payload = {"member_id": self.member.pk, "booking_reference": str(booking.reference)}
        self.assertEqual(self.post_json("/cancel", payload).status_code, 200)
        response = self.post_json("/cancel", payload)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["error"]["code"], "already_cancelled")

    def test_csrf_protection_and_documented_token_flow(self):
        browser = Client(enforce_csrf_checks=True)
        browser.force_login(self.staff)
        response = browser.post("/book", json.dumps(self.payload), content_type="application/json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["error"]["code"], "csrf_failed")
        token = browser.get("/api/csrf").json()["csrf_token"]
        response = browser.post("/book", json.dumps(self.payload), content_type="application/json", HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code, 201)
        response = browser.post("/cancel", json.dumps({"member_id": self.member.pk, "booking_reference": response.json()["booking_reference"]}), content_type="application/json", HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code, 200)

    def test_angular_shell_has_no_embedded_member_data(self):
        for path in ["/", "/bookings/", "/accounts/login/", "/bookings/?item=1"]:
            response = self.client.get(path)
            self.assertContains(response, "<app-root>")
            self.assertNotContains(response, "Emily")
            self.assertIn("no-store", response["Cache-Control"])

    def test_missing_frontend_build_has_actionable_setup_error(self):
        with self.settings(FRONTEND_INDEX_FILE=Path("does-not-exist/index.html")):
            self.assertContains(self.client.get("/"), "Build the Angular frontend", status_code=503)

    def test_shell_rejects_html_writes_and_csrf_failures_remain_safe(self):
        self.assertEqual(self.client.post("/bookings/", {"action": "book"}).status_code, 405)
        response = Client(enforce_csrf_checks=True).post("/bookings/", {"action": "book"})
        self.assertContains(response, "Please refresh", status_code=403)
