import json
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from bookings.models import Booking, InventoryItem, Member


class FilteredPaginationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = get_user_model().objects.create_user("pagination-staff", is_staff=True)
        cls.member = Member.objects.create(name="Emily", surname="Johnson", booking_count=1, date_joined=timezone.now())
        today = timezone.localdate()
        cls.items = InventoryItem.objects.bulk_create([
            InventoryItem(title=f"Experience {index:02}", description="Trip", remaining_count=3,
                          expiration_date=today + timedelta(days=30)) for index in range(17)
        ])
        cls.expired = InventoryItem.objects.create(title="Expired trip", description="Old season", remaining_count=8, expiration_date=today - timedelta(days=1))
        cls.expired_sold = InventoryItem.objects.create(title="Expired sold out", description="Old season", remaining_count=0, expiration_date=today - timedelta(days=1))
        cls.sold = InventoryItem.objects.create(title="Sold out", description="Future season", remaining_count=0, expiration_date=today + timedelta(days=1))
        cls.low = InventoryItem.objects.create(title="Low stock", description="Last two", remaining_count=2, expiration_date=today)
        cls.bookings = Booking.objects.bulk_create([
            Booking(member=cls.member, item=cls.items[index % 17], booked_at=timezone.now() - timedelta(minutes=index),
                    cancelled_at=timezone.now() if index % 2 else None) for index in range(23)
        ])

    def setUp(self):
        self.client.force_login(self.staff)

    def test_inventory_defaults_to_two_desktop_rows_and_uses_sql_limit_offset(self):
        first = self.client.get("/api/inventory").json()
        self.assertEqual(len(first["items"]), 6)
        self.assertEqual(first["pagination"]["page_size"], 6)
        self.assertEqual(first["pagination"]["total_count"], 21)
        with CaptureQueriesContext(connection) as queries:
            second = self.client.get("/api/inventory?page=2").json()
        self.assertEqual(len(second["items"]), 6)
        self.assertFalse({row["id"] for row in first["items"]} & {row["id"] for row in second["items"]})
        self.assertTrue(any('LIMIT 6 OFFSET 6' in query["sql"] for query in queries))

    def test_inventory_quick_filters_and_search_are_applied_before_paging(self):
        expected = {"available": 18, "low_stock": 1, "expired": 2, "sold_out": 2, "all": 21}
        for status, count in expected.items():
            response = self.client.get("/api/inventory", {"status": status, "page_size": 100}).json()
            self.assertEqual(response["pagination"]["total_count"], count, status)
            self.assertEqual(response["filter_counts"], expected)
        data = self.client.get("/api/inventory?q=Expired&status=available").json()
        self.assertEqual(data["items"], [])
        self.assertEqual(data["filter_counts"]["expired"], 2)
        self.assertEqual(data["filter_counts"]["available"], 0)
        self.assertEqual(self.client.get("/api/inventory?available=1&page_size=100").json()["pagination"]["total_count"], 18)

    def test_expired_data_is_marked_and_excluded_from_bookable_selectors(self):
        expired = self.client.get("/api/inventory?status=expired").json()["items"]
        self.assertTrue(all(row["is_expired"] and not row["is_bookable"] for row in expired))
        options = self.client.get("/api/booking-options").json()["items"]
        expired_choice = next(row for row in options if row["id"] == self.expired.pk)
        self.assertFalse(expired_choice["is_bookable"])
        self.assertEqual(expired_choice["expiration_date"], self.expired.expiration_date.isoformat())

    def test_row_sizes_and_exact_totals_are_supported_without_oversized_metadata(self):
        for size in (2, 3, 4, 6, 9):
            data = self.client.get("/api/inventory", {"page_size": size}).json()
            self.assertEqual(len(data["items"]), size)
            self.assertEqual(data["pagination"]["page_size"], size)
        data = self.client.get("/api/inventory", {"page_size": 100}).json()["pagination"]
        self.assertEqual(data["page_size"], data["total_count"])
        self.assertEqual(data["total_pages"], 1)
        small = self.client.get("/api/inventory?status=expired&page_size=9").json()["pagination"]
        self.assertEqual(small["page_size"], 2)
        self.assertEqual(small["total_count"], 2)

    def test_expired_booking_api_cannot_be_bypassed_with_a_stale_item_id(self):
        response = self.client.post("/book", json.dumps({"member_id": self.member.pk, "item_id": self.expired.pk}), content_type="application/json")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["error"]["code"], "experience_expired")
        self.member.refresh_from_db()
        self.expired.refresh_from_db()
        self.assertEqual(self.member.booking_count, 1)
        self.assertEqual(self.expired.remaining_count, 8)
        self.assertEqual(Booking.objects.count(), 23)

    def test_bookings_default_five_and_larger_sizes_include_all_history(self):
        for size in (5, 10, 15):
            data = self.client.get("/api/bookings", {"page_size": size}).json()
            self.assertEqual(data["pagination"]["total_count"], 23)
            self.assertEqual(len(data["bookings"]), min(size, 23))
        first = self.client.get("/api/bookings").json()
        second = self.client.get("/api/bookings?page=2").json()
        self.assertEqual(first["pagination"]["page_size"], 5)
        self.assertFalse({row["booking_reference"] for row in first["bookings"]} & {row["booking_reference"] for row in second["bookings"]})
        self.assertEqual(first["bookings"][0]["booking_reference"], str(self.bookings[0].pk))

    def test_booking_page_size_cannot_exceed_fifteen(self):
        for size in (16, 20, 100):
            response = self.client.get("/api/bookings", {"page_size": size})
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.json()["error"]["code"], "invalid_query")
        small = self.client.get("/api/bookings", {"q": "Experience 00", "page_size": 10}).json()
        self.assertEqual(len(small["bookings"]), 2)
        self.assertEqual(small["pagination"]["page_size"], 2)

    def test_bookings_filter_by_status_full_member_name_experience_and_reference(self):
        for status, total in (("active", 12), ("cancelled", 11)):
            data = self.client.get("/api/bookings", {"status": status}).json()
            self.assertEqual(data["pagination"]["total_count"], total)
            self.assertTrue(all(row["status"] == status for row in data["bookings"]))
        self.assertEqual(self.client.get("/api/bookings?q=emily johnson").json()["pagination"]["total_count"], 23)
        self.assertEqual(self.client.get("/api/bookings?q=Experience 00").json()["pagination"]["total_count"], 2)
        for query in (str(self.bookings[0].pk), str(self.bookings[0].pk)[:8]):
            rows = self.client.get("/api/bookings", {"q": query}).json()["bookings"]
            self.assertEqual([row["booking_reference"] for row in rows], [str(self.bookings[0].pk)])

    def test_invalid_parameters_are_bounded_and_out_of_range_pages_clamp(self):
        for route in ("/api/inventory", "/api/bookings"):
            for query in ("page=0", "page=-1", "page=no", "page=999999999999999", "page_size=0", "page_size=105", "status=invalid"):
                response = self.client.get(route + "?" + query)
                self.assertEqual(response.status_code, 400, (route, query))
                self.assertEqual(response.json()["error"]["code"], "invalid_query")
            data = self.client.get(route + "?page=999").json()["pagination"]
            self.assertEqual(data["page"], data["total_pages"])
            empty = self.client.get(route + "?q=NoMatchingRecord").json()["pagination"]
            self.assertEqual((empty["total_count"], empty["start_index"], empty["end_index"], empty["total_pages"]), (0, 0, 0, 1))
